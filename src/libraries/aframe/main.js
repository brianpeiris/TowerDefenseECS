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

AFRAME.registerComponent("velocity", {
  schema: {
    x: { default: 0 },
    y: { default: 0 },
    z: { default: 0 }
  },
  play() {
    // A-Frame optimization to avoid setAttribute.
    this.x = this.data.x;
    this.y = this.data.y;
    this.z = this.data.z;
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

AFRAME.registerComponent("explosive", {
  schema: {
    destructible: { default: true }
  }
});

AFRAME.registerComponent("turret", {
  schema: {
    firingRate: { default: 1 / 2 }
  },
  init() {
    this.timeUntilFire = 1 / this.data.firingRate;
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

// A-Frame optimization to avoid querySelectorAll
const entities = [];
const collidable = [];
const explosives = [];
const enemies = [];
const turrets = [];
const velocities = [];

AFRAME.registerSystem("velocity-system", {
  tick(time, delta) {
    for (const entity of velocities) {
      const { velocity } = entity.components;
      const deltaSeconds = (APP.perfMode ? 30 : delta) / 1000;
      entity.object3D.position.x += velocity.x * deltaSeconds;
      entity.object3D.position.y += velocity.y * deltaSeconds;
      entity.object3D.position.z += velocity.z * deltaSeconds;
    }
  }
});

// Optimization to avoid iteration and component access of A-Frame components and entities.
const colliders = [];

AFRAME.registerSystem("collision-system", {
  tick() {
    const entities = collidable;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const ec = entity.components.collider;
      ec.collided = null;
      entity.object3D.updateMatrixWorld();
      scene.updateBox(ec.offsetCollider, ec.collider, entity.object3D.matrixWorld);
      const collider = colliders[i];
      // Extract relevant properties into a simple object.
      if (!collider) {
        // Initialize array objects fully to ensure that array always contains objects
        // of the same shape.
        colliders[i] = {
          entity,
          collider: ec,
          collides: ec.data.collides,
          className: entity.className,
          offsetCollider: ec.offsetCollider
        };
      } else {
        collider.entity = entity;
        collider.collider = ec;
        collider.collides = ec.data.collides;
        collider.className = entity.className;
        collider.offsetCollider = ec.offsetCollider;
      }
    }
    // Truncate cache.
    colliders.length = entities.length;

    for (let i = 0; i < colliders.length; i++) {
      const e1c = colliders[i];
      for (let j = i + 1; j < colliders.length; j++) {
        const e2c = colliders[j];
        if (e1c.collides && e2c.className !== e1c.collides) continue;
        if (!e1c.offsetCollider.intersectsBox(e2c.offsetCollider)) continue;
        e1c.collider.collided = e2c.entity;
        e2c.collider.collided = e1c.entity;
      }
    }
  }
});

const entitiesToRemove = [];
AFRAME.registerSystem("explosive-system", {
  tick() {
    for (let i = 0; i < explosives.length; i++) {
      const entity = explosives[i];
      const { collided } = entity.components.collider;
      const explosiveBelowFloor = entity.object3D.position.y <= -0.5;
      if (explosiveBelowFloor || (collided && entity.components.explosive.data.destructible)) {
        entitiesToRemove.push(entity);
      }
      if (collided) {
        entitiesToRemove.push(collided);
      }
    }
  }
});

AFRAME.registerSystem("removal-system", {
  tick() {
    for (let i = 0; i < entitiesToRemove.length; i++) {
      const entity = entitiesToRemove[i];

      const entitiesIndex = entities.indexOf(entity);
      if (entitiesIndex !== -1) entities.splice(entitiesIndex, 1).id;

      const collidableIndex = collidable.indexOf(entity);
      if (collidableIndex !== -1) collidable.splice(collidableIndex, 1).id;

      const explosiveIndex = explosives.indexOf(entity);
      if (explosiveIndex !== -1) explosives.splice(explosiveIndex, 1).id;

      const turretIndex = turrets.indexOf(entity);
      if (turretIndex !== -1) turrets.splice(turretIndex, 1).id;

      const velocityIndex = velocities.indexOf(entity);
      if (velocityIndex !== -1) velocities.splice(velocityIndex, 1).id;

      if (entity.className === "enemy") {
        const enemiesIndex = enemies.indexOf(entity);
        if (enemiesIndex !== -1) enemies.splice(enemiesIndex, 1).id;
      }

      if (!entity.isPlaying || !entity.parentElement) continue;

      if (entity.className === "enemy") {
        scene.sceneEl.components.pool__enemy.returnEntity(entity);
      } else if (entity.className === "projectile") {
        scene.sceneEl.components.pool__projectile.returnEntity(entity);
      } else {
        entity.parentElement.removeChild(entity);
      }
    }
    entitiesToRemove.length = 0;
  }
});

AFRAME.registerSystem("turret-system", {
  tick(time, delta) {
    for (const entity of turrets) {
      const { turret } = entity.components;
      turret.timeUntilFire -= (APP.perfMode ? 30 : delta) / 1000;
      if (turret.timeUntilFire <= 0) {
        const projectile = createProjectile();
        entity.object3D.getWorldPosition(projectile.object3D.position);
        turret.timeUntilFire = 1 / turret.data.firingRate;
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
      for (const entity of entities) {
        entity.object3D.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (entity.className !== "projectile" && x === ex && z === ez) {
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
      const lane = APP.perfMode ? (i % 5) - 2 : THREE.Math.randInt(-2, 2);
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

//
// Entity factories
//

// A-Frame pooling optimization to save on enemy destruction.
const enemyAsset = document.createElement("a-mixin");
enemyAsset.id = "enemy";
enemyAsset.setAttribute("geometry", "primitive: box; width: 0.8; height: 0.8; depth: 0.8");
enemyAsset.setAttribute("material", "color: green");
enemyAsset.setAttribute("velocity", "z: 1.5");
enemyAsset.setAttribute("collider", "colliderSize: 0.8;");
enemyAsset.setAttribute("explosive", "destructible: false");
scene.sceneEl.append(enemyAsset);
scene.sceneEl.setAttribute("pool__enemy", `mixin: enemy; size: ${APP.perfMode ? APP.PERF_ENEMIES : 200};`);

function createEnemy() {
  const entity = scene.sceneEl.components.pool__enemy.requestEntity();
  entity.className = "enemy";
  entities.push(entity);
  collidable.push(entity);
  explosives.push(entity);
  enemies.push(entity);
  velocities.push(entity);
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
  explosives.push(entity);
  scene.add(entity);
  return entity;
}

// A-Frame pooling optimization for projectiles, since we create and destroy a lot of these per tick.
const projectileAsset = document.createElement("a-mixin");
projectileAsset.id = "projectile";
projectileAsset.setAttribute("gravity", "");
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
  entity.className = "projectile";
  entities.push(entity);
  collidable.push(entity);
  explosives.push(entity);
  velocities.push(entity);
  entity.play();
  return entity;
}

function createTurret(standalone = true, firingRate) {
  const entity = document.createElement("a-entity");
  entity.setAttribute("turret", { firingRate });
  entity.setAttribute("geometry", { primitive: "box", width: 0.7, height: 0.7, depth: 0.7 });
  entity.setAttribute("material", { color: "blue" });
  if (standalone) {
    entity.setAttribute("collider", { colliderSize: 0.8, collides: "enemy" });
    entities.push(entity);
    collidable.push(entity);
    scene.add(entity);
  }
  turrets.push(entity);
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
