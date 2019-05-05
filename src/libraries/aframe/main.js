//
// App Boilerplate
//

const AFRAME = require("aframe");
const THREE = AFRAME.THREE;

const App = require("../../app.js");
const Scene = require("./scene.js");

const APP = new App();
const scene = new Scene();

//
// ECS Setup
//

//
// Components
//

AFRAME.registerComponent("velocity", {
  schema: {
    x: { default: 0 },
    y: { default: 0 },
    z: { default: 0 }
  },
  tick(time, delta) {
    const deltaSeconds = delta / 1000;
    this.el.object3D.position.x += this.data.x * deltaSeconds;
    this.el.object3D.position.y += this.data.y * deltaSeconds;
    this.el.object3D.position.z += this.data.z * deltaSeconds;
  }
});

AFRAME.registerComponent("gravity", {
  schema: {
    force: { default: -9.8 }
  },
  tick(time, delta) {
    const newVelocityY = this.el.getAttribute("velocity").y + this.data.force * (delta / 1000);
    this.el.setAttribute("velocity", "y", newVelocityY);
  }
});

AFRAME.registerComponent("collider", {
  schema: {
    collider: { type: "vec3" },
    collides: { type: "string" }
  },
  init() {
    const c = this.data.collider;
    this.collider = new THREE.Box3({ x: -c.x / 2, y: -c.y / 2, z: -c.z / 2 }, { x: c.x / 2, y: c.y / 2, z: c.z / 2 });
  }
});

AFRAME.registerComponent("explosive", {
  schema: {
    destructible: { default: true }
  },
  tick() {
    const { collided } = this.el.components.collider;
    const explosiveBelowFloor = this.el.object3D.position.y <= -0.5;
    if ((explosiveBelowFloor || (collided && this.data.destructible)) && this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
    if (collided && collided.parentElement) {
      collided.parentElement.removeChild(collided);
    }
  }
});

AFRAME.registerComponent("turret", {
  schema: {
    firingRate: { default: 1 / 2 }
  },
  init() {
    this.timeUntilFire = 1 / this.data.firingRate;
  },
  tick(time, delta) {
    this.timeUntilFire -= delta / 1000;
    if (this.timeUntilFire <= 0) {
      const projectile = createProjectile();
      this.el.object3D.getWorldPosition(projectile.object3D.position);
      this.timeUntilFire = 1 / this.data.firingRate;
    }
  }
});

AFRAME.registerComponent("vehicle", {
  schema: {
    speed: { default: 1 }
  },
  init() {
    this.speed = this.data.speed;
  },
  tick(time, delta) {
    const { position } = this.el.object3D;
    if (Math.abs(position.x) >= 2) {
      position.x = Math.sign(position.x) * 2;
      this.speed *= -1;
    }
    position.x += this.speed * (delta / 1000);
  }
});

AFRAME.registerComponent("collector", {
  schema: {
    rate: { default: 20 }
  },
  tick(time, delta) {
    APP.updatePower(this.data.rate * (delta / 1000));
  }
});

//
// Systems
//

AFRAME.registerSystem("collision-system", {
  init() {
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  },
  tick() {
    const entities = document.querySelectorAll("[collider]");
    for (const entity of entities) {
      entity.components.collider.collided = null;
    }
    for (let i = 0; i < entities.length; i++) {
      const e1 = entities[i];
      const e1c = e1.components.collider;
      if (!e1c.collider) continue;
      const e1m = e1.object3D;
      e1m.updateMatrixWorld();
      scene.updateBox(this.tempBox1, e1c.collider, e1m.matrixWorld);
      for (let j = i + 1; j < entities.length; j++) {
        const e2 = entities[j];
        if (e1c.data.collides && !e2.classList.contains(e1c.data.collides)) continue;
        const e2c = e2.components.collider;
        if (!e2c.collider) continue;
        const e2m = e2.object3D;
        e2m.updateMatrixWorld();
        scene.updateBox(this.tempBox2, e2c.collider, e2m.matrixWorld);
        if (!this.tempBox1.intersectsBox(this.tempBox2)) continue;
        e1c.collided = e2;
        e2c.collided = e1;
      }
    }
  }
});

AFRAME.registerSystem("placement-system", {
  init() {
    this.worldPosition = new THREE.Vector3();
    this.placementValid = false;
    this.factories = {
      mine: createMine,
      turret: createTurret,
      vehicle: createTurretVehicle,
      collector: createCollector
    };
    APP.onCreate = (itemName, cost) => {
      this.updatePlacement();
      if (!this.placementValid) return;
      let item = this.factories[itemName]();
      APP.updatePower(-cost);
      item.object3D.position.copy(scene.placeholder.object3D.position);
    };
  },
  tick() {
    this.updatePlacement();
  },
  updatePlacement() {
    this.placementValid = !APP.currentItem.input.disabled;
    let x, z;
    const intersection = scene.getIntersection();
    if (intersection) {
      x = Math.round(intersection.point.x);
      z = Math.round(intersection.point.z);
      for (const entity of document.querySelectorAll(".entity")) {
        entity.object3D.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!entity.classList.contains("projectile") && x === ex && z === ez) {
          this.placementValid = false;
        }
      }
    } else {
      this.placementValid = false;
    }
    scene.updatePlacement(APP.deviceSupportsHover && this.placementValid, x, z);
  }
});

AFRAME.registerSystem("enemy-wave-system", {
  init() {
    this.currentWave = APP.waves[0];
  },
  tick(time) {
    const currentWave = APP.getCurrentWave(time / 1000);
    if (currentWave === this.currentWave) return;
    this.currentWave = currentWave;
    this.generateWave(currentWave);
  },
  generateWave(wave) {
    if (!wave) return;
    const occupied = {};
    for (let i = 0; i < wave.enemies; i++) {
      const enemy = createEnemy();
      const lane = THREE.Math.randInt(-2, 2);
      enemy.object3D.position.x = lane;
      occupied[lane] = occupied[lane] === undefined ? 0 : occupied[lane] - 2;
      enemy.object3D.position.z = occupied[lane] - 5;
    }
  }
});

if (!APP.perfMode) {
  AFRAME.registerSystem("game-over-system", {
    init() {
      this.tempBox = new THREE.Box3();
      this.collider = new THREE.Box3();
      this.collider.setFromCenterAndSize(new THREE.Vector3(0, 0, 6), new THREE.Vector3(5, 1, 1));
    },
    tick() {
      const enemies = document.querySelectorAll(".enemy");
      if (!enemies.length && !this.sceneEl.systems["enemy-wave-system"].currentWave) {
        scene.stop();
        APP.setInfo("You Win!");
        return;
      }
      for (const entity of enemies) {
        if (!entity.components.collider.collider) continue;
        scene.updateBox(this.tempBox, entity.components.collider.collider, entity.object3D.matrixWorld);
        if (this.tempBox.intersectsBox(this.collider)) {
          scene.stop();
          APP.setInfo("Game Over");
          break;
        }
      }
    }
  });
}

//
// Entity factories
//

function createEnemy() {
  const entity = document.createElement("a-entity");
  entity.classList.add("entity", "enemy");
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "green" });
  entity.setAttribute("velocity", { z: 1.5 });
  entity.setAttribute("collider", { collider: "0.8 0.8 0.8" });
  entity.setAttribute("explosive", { destructible: false });
  scene.add(entity);
  return entity;
}

function createMine() {
  const entity = document.createElement("a-entity");
  entity.classList.add("entity");
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "red" });
  entity.setAttribute("collider", { collider: "0.8 0.8 0.8", collides: "enemy" });
  entity.setAttribute("explosive", "");
  scene.add(entity);
  return entity;
}

function createProjectile() {
  const entity = document.createElement("a-entity");
  entity.classList.add("entity", "projectile");
  entity.setAttribute("geometry", { primitive: "box", width: 0.2, height: 0.2, depth: 0.2 });
  entity.setAttribute("material", { color: "red" });
  entity.setAttribute("gravity", "");
  entity.setAttribute("velocity", { z: -20 });
  entity.setAttribute("collider", { collider: "0.2 0.2 0.2", collides: "enemy" });
  entity.setAttribute("explosive", "");
  scene.add(entity);
  return entity;
}

function createTurret(standalone = true, firingRate) {
  const entity = document.createElement("a-entity");
  entity.classList.add("entity");
  entity.setAttribute("turret", { firingRate });
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "blue" });
  if (standalone) {
    entity.setAttribute("collider", { collider: "0.8 0.8 0.8", collides: "enemy" });
    scene.add(entity);
  }
  return entity;
}

function createTurretVehicle() {
  const entity = document.createElement("a-entity");
  entity.classList.add("entity");
  entity.setAttribute("vehicle", "");
  entity.setAttribute("geometry", { primitive: "box", width: 0.9, height: 0.9, depth: 0.9 });
  entity.setAttribute("material", { color: "yellow" });
  entity.setAttribute("collider", { collider: "0.9 0.9 0.9", collides: "enemy" });
  const turret = createTurret(false, 1);
  turret.object3D.position.y = 0.5;
  entity.append(turret);
  scene.add(entity);
  return entity;
}

function createCollector() {
  const entity = document.createElement("a-entity");
  entity.classList.add("entity");
  entity.setAttribute("collector", "");
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "orange" });
  entity.setAttribute("collider", { collider: "0.8 0.8 0.8", collides: "enemy" });
  scene.add(entity);
  return entity;
}

if (APP.perfMode) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const turret = createTurretVehicle();
      turret.object3D.position.set(i - 2, 0, j + 2);
    }
  }
}
