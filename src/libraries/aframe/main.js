//
// App Boilerplate
//

const AFRAME = require("aframe");
const THREE = AFRAME.THREE;
const App = require("../../app.js");

const APP = new App(update);

const scene = document.createElement("a-scene");
scene.setAttribute("background", "color: black");
scene.setAttribute("enemy-wave-system", "");
scene.style.zIndex = -1;
const camera = document.createElement("a-entity");
camera.setAttribute("camera", "");
camera.setAttribute("position", "15 15 15");
camera.setAttribute("rotation", "-20 52 -5");
scene.append(camera);
document.addEventListener("DOMContentLoaded", () => document.body.append(scene));

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
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  },
  tick() {
    const e1 = this.el;
    const e1c = this.data;
    const e1m = e1.object3D;
    e1m.updateMatrixWorld();
    APP.updateBox(this.tempBox1, this.collider, e1m.matrixWorld);
    const colliders = this.el.sceneEl.querySelectorAll("[collider]");
    for (let i = 0; i < colliders.length; i++) {
      const e2 = colliders[i];
      if (e2 === e1) continue;
      if (e1c.collides && e1c.collides !== e2.className) continue;
      const e2c = e2.components.collider;
      if (!e2c.collider) continue;
      const e2m = e2.object3D;
      e2m.updateMatrixWorld();
      APP.updateBox(this.tempBox2, e2c.collider, e2m.matrixWorld);
      if (!this.tempBox1.intersectsBox(this.tempBox2)) continue;
      this.collided = e2;
      e2c.collided = e1;
    }
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

function Collector() {
  this.rate = 20;
}

//
// Systems
//

class ResourceSystem {
  constructor(entities) {
    this.query = entities.queryComponents([Collector]);
    this.power = 150;
  }
  update(delta) {
    for (const entity of this.query) {
      this.power += entity.collector.rate * delta;
    }
    APP.updatePower(this.power);
  }
}

class PlacementSystem {
  constructor(entities, resourceSystem) {
    this.query = entities.queryComponents([Mesh]);
    this.resourceSystem = resourceSystem;
    this.worldPosition = new THREE.Vector3();
    this.factories = {
      mine: createMine,
      turret: createTurret,
      vehicle: createTurretVehicle,
      collector: createCollector
    };
    APP.onCreate = (itemName, cost) => {
      this.updatePlacement();
      if (!APP.placementValid) return;
      let item = this.factories[itemName]();
      this.resourceSystem.power -= cost;
      item.mesh.mesh.position.copy(APP.placeholder.position);
    };
  }
  update() {
    this.updatePlacement();
  }
  updatePlacement() {
    const intersection = APP.getIntersection();
    if (!intersection) {
      APP.updatePlacement(false);
      return;
    }
    const [x, z] = [Math.round(intersection.point.x), Math.round(intersection.point.z)];
    let placementValid = !APP.currentItem.input.disabled;
    for (const entity of this.query) {
      entity.mesh.mesh.getWorldPosition(this.worldPosition);
      const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
      if (!entity.hasTag("projectile") && x === ex && z === ez) {
        placementValid = false;
      }
    }
    APP.updatePlacement(placementValid, x, z);
  }
}

AFRAME.registerSystem("enemy-wave-system", {
  init() {
    this.currentWave = APP.waves[0];
  },
  tick(delta, elapsed) {
    const currentWave = APP.getCurrentWave(elapsed);
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

class GameOverSystem {
  constructor(entities, enemyWaveSystem) {
    this.query = entities.queryTag("enemy");
    this.enemyWaveSystem = enemyWaveSystem;
    this.tempBox = new THREE.Box3();
    this.collider = new THREE.Box3();
    this.collider.setFromCenterAndSize(new THREE.Vector3(0, 0, 6), new THREE.Vector3(5, 1, 1));
  }
  update() {
    if (!this.query.length && !this.enemyWaveSystem.currentWave) {
      APP.stopPlaying("You Win!");
      return;
    }
    for (const entity of this.query) {
      APP.updateBox(this.tempBox, entity.collider.collider, entity.mesh.mesh.matrixWorld);
      if (this.tempBox.intersectsBox(this.collider)) {
        APP.stopPlaying("Game Over");
        break;
      }
    }
  }
}

/*
const resourceSystem = new ResourceSystem(entities);
systems.push(resourceSystem);
systems.push(new PlacementSystem(entities, resourceSystem));
const enemyWaveSystem = new EnemyWaveSystem(entities);
systems.push(enemyWaveSystem);
if (!APP.perfMode) {
  systems.push(new GameOverSystem(entities, enemyWaveSystem));
}
*/

//
// Entity factories
//

function createEnemy() {
  const entity = document.createElement("a-entity");
  entity.className = "enemy";
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "green" });
  entity.setAttribute("velocity", { z: 1.5 });
  entity.setAttribute("collider", { collider: "0.8 0.8 0.8" });
  entity.setAttribute("explosive", { destructible: false });
  scene.append(entity);
  return entity;
}

function createMine() {
  const entity = entities.createEntity();
  entity.addComponent(Mesh);
  entity.mesh.mesh = APP.createBox("red");
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  APP.scene.add(entity.mesh.mesh);
  return entity;
}

function createProjectile() {
  const entity = document.createElement("a-entity");
  //entity.addTag("projectile");
  entity.setAttribute("geometry", { primitive: "box", width: 0.2, height: 0.2, depth: 0.2 });
  entity.setAttribute("material", { color: "red" });
  entity.setAttribute("gravity", "");
  entity.setAttribute("velocity", { z: -20 });
  entity.setAttribute("collider", { collider: "0.2 0.2 0.2", collides: "enemy" });
  entity.setAttribute("explosive", "");
  scene.append(entity);
  return entity;
}

function createTurret(withCollider = true, firingRate) {
  const entity = document.createElement("a-entity");
  entity.setAttribute("turret", { firingRate });
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "blue" });
  if (withCollider) {
    entity.setAttribute("collider", { collider: "0.8 0.8 0.8", collides: "enemy" });
  }
  scene.append(entity);
  return entity;
}

function createTurretVehicle() {
  const entity = document.createElement("a-entity");
  entity.setAttribute("vehicle", "");
  entity.setAttribute("geometry", { primitive: "box", width: 0.9, height: 0.9, depth: 0.9 });
  entity.setAttribute("material", { color: "yellow" });
  entity.setAttribute("collider", { collider: "0.9 0.9 0.9", collides: "enemy" });
  const turret = createTurret(false, 1);
  turret.object3D.position.y = 0.5;
  entity.append(turret);
  scene.append(entity);
  return entity;
}

function createCollector() {
  const entity = entities.createEntity();
  entity.addComponent(Collector);
  entity.addComponent(Mesh);
  entity.mesh.mesh = APP.createBox("orange");
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  APP.scene.add(entity.mesh.mesh);
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
