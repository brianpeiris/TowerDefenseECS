//
// App Boilerplate
//

const AFRAME = require("aframe");
const THREE = AFRAME.THREE;

const App = require("../../app.js");
const Scene = require("./scene.js");

const APP = new App();
const scene = new Scene(APP.perfMode);

//
// Components
//

AFRAME.registerComponent("enemy", {});

AFRAME.registerComponent("velocity", {
  schema: {
    x: { default: 0 },
    y: { default: 0 },
    z: { default: 0 }
  },
  play() {
    // Optimization to avoid setAttribute.
    this.x = this.data.x;
    this.y = this.data.y;
    this.z = this.data.z;
  },
  tick(time, delta) {
    const deltaSeconds = (APP.perfMode ? 30 : delta) / 1000;
    this.el.object3D.position.x += this.x * deltaSeconds;
    this.el.object3D.position.y += this.y * deltaSeconds;
    this.el.object3D.position.z += this.z * deltaSeconds;
  }
});

AFRAME.registerComponent("gravity", {
  schema: {
    force: { default: -9.8 }
  },
  tick(time, delta) {
    const newVelocityY = this.el.components.velocity.y + this.data.force * ((APP.perfMode ? 30 : delta) / 1000);
    this.el.components.velocity.y = newVelocityY;
  }
});

AFRAME.registerComponent("collider", {
  schema: {
    colliderSize: { type: "number" },
    collides: { type: "string" }
  },
  init() {
    this.collided = null;
    const s = this.data.colliderSize;
    this.collider = new THREE.Box3({ x: -s / 2, y: -s / 2, z: -s / 2 }, { x: s / 2, y: s / 2, z: s / 2 });
    this.offsetCollider = new THREE.Box3();
  }
});

const entitiesToRemove = [];
AFRAME.registerComponent("explosive", {
  schema: {
    destructible: { default: true }
  },
  tick() {
    const { collided } = this.el.components.collider;
    const explosiveBelowFloor = this.el.object3D.position.y <= -0.5;
    if (explosiveBelowFloor || (collided && this.data.destructible)) {
      entitiesToRemove.push(this.el);
    }
    if (collided) {
      entitiesToRemove.push(collided);
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
    this.timeUntilFire -= (APP.perfMode ? 30 : delta) / 1000;
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
    position.x += this.speed * ((APP.perfMode ? 30 : delta) / 1000);
  }
});

AFRAME.registerComponent("collector", {
  schema: {
    rate: { default: 20 }
  },
  tick(time, delta) {
    APP.updatePower(this.data.rate * ((APP.perfMode ? 30 : delta) / 1000));
  }
});

//
// Systems
//

// Optimization to avoid querySelectorAll
const entities = [];
const collidable = [];
const enemies = [];

AFRAME.registerSystem("collision-system", {
  tick: function collisionSystemTick() {
    const entities = collidable;
    for (const entity of entities) {
      const ec = entity.components.collider;
      if (!ec.collider) continue;
      entity.components.collider.collided = null;
      entity.object3D.updateMatrixWorld();
      scene.updateBox(ec.offsetCollider, ec.collider, entity.object3D.matrixWorld);
    }
    var t0 = performance.now();
    for (let i = 0; i < entities.length; i++) {
      const e1 = entities[i];
      const e1c = e1.components.collider;
      if (!e1c.data) continue;
      if (!e1c.offsetCollider) continue;
      for (let j = i + 1; j < entities.length; j++) {
        const e2 = entities[j];
        if (e1c.data.collides && !(e1c.data.collides in e2.components)) continue;
        const e2c = e2.components.collider;
        if (!e2c.offsetCollider) continue;
        if (!e1c.offsetCollider.intersectsBox(e2c.offsetCollider)) continue;
        e1c.collided = e2;
        e2.components.collider.collided = e1;
      }
    }
    var t1 = performance.now();
    console.log("collisionSystemTick " + (t1 - t0) + " milliseconds.");
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
      for (const entity of entities) {
        entity.object3D.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!entity.isProjectile && x === ex && z === ez) {
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

AFRAME.registerSystem("removal-system", {
  tick() {
    for (let i = 0; i < entitiesToRemove.length; i++) {
      const entity = entitiesToRemove[i];

      const entitiesIndex = entities.indexOf(entity);
      if (entitiesIndex !== -1) entities.splice(entitiesIndex, 1).id;

      const collidableIndex = collidable.indexOf(entity);
      if (collidableIndex !== -1) collidable.splice(collidableIndex, 1).id;

      if (entity.isEnemy) {
        const enemiesIndex = enemies.indexOf(entity);
        if (enemiesIndex !== -1) enemies.splice(enemiesIndex, 1).id;
      }

      if (!entity.isPlaying || !entity.parentElement) continue;

      if (entity.isEnemy) {
        scene.sceneEl.components.pool__enemy.returnEntity(entity);
      } else if (entity.isProjectile) {
        scene.sceneEl.components.pool__projectile.returnEntity(entity);
      } else {
        entity.parentElement.removeChild(entity);
      }
    }
    entitiesToRemove.length = 0;
  }
});

//
// Entity factories
//

// Pooling optimization.
const enemyAsset = document.createElement("a-mixin");
enemyAsset.id = "enemy";
enemyAsset.setAttribute("geometry", "primitive: box; width: 0.8; height: 0.8; depth: 0.8");
enemyAsset.setAttribute("material", "color: green");
enemyAsset.setAttribute("velocity", "z: 1.5");
enemyAsset.setAttribute("collider", "colliderSize: 0.8;");
enemyAsset.setAttribute("explosive", "destructible: false");
scene.sceneEl.append(enemyAsset);
scene.sceneEl.setAttribute("pool__enemy", `mixin: enemy; size: ${APP.perfMode ? 2000 : 200};`);

function createEnemy() {
  const entity = scene.sceneEl.components.pool__enemy.requestEntity();
  entity.isEnemy = true;
  entities.push(entity);
  collidable.push(entity);
  enemies.push(entity);
  entity.play();
  return entity;
}

function createMine() {
  const entity = document.createElement("a-entity");
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "red" });
  entity.setAttribute("collider", { colliderSize: 0.8, collides: "enemy" });
  entity.setAttribute("explosive", "");
  entities.push(entity);
  collidable.push(entity);
  scene.add(entity);
  return entity;
}

// Pooling optimization for projectiles, since we create and destroy a lot of these per tick.
const projectileAsset = document.createElement("a-mixin");
projectileAsset.id = "projectile";
projectileAsset.setAttribute("geometry", "primitive: box; width: 0.2; height: 0.2; depth: 0.2");
projectileAsset.setAttribute("material", "color: red");
projectileAsset.setAttribute("gravity", "");
projectileAsset.setAttribute("velocity", "z: -20");
projectileAsset.setAttribute("collider", "colliderSize: 0.2; collides: enemy");
projectileAsset.setAttribute("explosive", "");
scene.sceneEl.append(projectileAsset);
scene.sceneEl.setAttribute("pool__projectile", "mixin: projectile; size: 100;");

function createProjectile() {
  const entity = scene.sceneEl.components.pool__projectile.requestEntity();
  entity.isProjectile = true;
  entities.push(entity);
  collidable.push(entity);
  entity.play();
  return entity;
}

function createTurret(standalone = true, firingRate) {
  const entity = document.createElement("a-entity");
  entity.setAttribute("turret", { firingRate });
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "blue" });
  if (standalone) {
    entity.setAttribute("collider", { colliderSize: 0.8, collides: "enemy" });
    entities.push(entity);
    collidable.push(entity);
    scene.add(entity);
  }
  return entity;
}

function createTurretVehicle() {
  const entity = document.createElement("a-entity");
  entity.setAttribute("vehicle", "");
  entity.setAttribute("geometry", { primitive: "box", width: 0.9, height: 0.9, depth: 0.9 });
  entity.setAttribute("material", { color: "yellow" });
  entity.setAttribute("collider", { colliderSize: 0.9, collides: "enemy" });
  const turret = createTurret(false, 1);
  turret.object3D.position.y = 0.5;
  entity.append(turret);
  entities.push(entity);
  collidable.push(entity);
  scene.add(entity);
  return entity;
}

function createCollector() {
  const entity = document.createElement("a-entity");
  entity.setAttribute("collector", "");
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "orange" });
  entity.setAttribute("collider", { colliderSize: 0.8, collides: "enemy" });
  entities.push(entity);
  collidable.push(entity);
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
