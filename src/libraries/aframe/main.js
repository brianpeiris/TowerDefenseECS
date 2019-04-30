//
// App Boilerplate
//

const AFRAME = require("aframe");
const THREE = AFRAME.THREE;
const App = require("../../app.js");

const APP = new App(update);

const scene = document.createElement("a-scene");
scene.setAttribute("stats", "");
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
    collider: { type: "vec3" }
  },
  init() {
    const c = this.data.collider;
    this.collider = new THREE.Box3({ x: -c.x / 2, y: -c.y / 2, z: -c.z / 2 }, { x: c.x / 2, y: c.y / 2, z: c.z / 2 });
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  },
  tick() {
    this.el.object3D.updateMatrixWorld();
    APP.updateBox(this.tempBox1, this.collider, this.el.object3D.matrixWorld);
    const colliders = this.el.sceneEl.querySelectorAll("[collider]");
    for (let i = 0; i < colliders.length; i++) {
      const e2 = colliders[i];
      if (e2 === this.el) continue;
      //if (e1c.collides && !e2.hasTag(e1c.collides)) continue;
      const e2c = e2.components.collider;
      if (!e2c.collider) continue;
      const e2m = e2.object3D;
      e2m.updateMatrixWorld();
      APP.updateBox(this.tempBox2, e2c.collider, e2m.matrixWorld);
      if (!this.tempBox1.intersectsBox(this.tempBox2)) continue;
      this.collided = e2;
      e2c.collided = this.el;
    }
  }
});

AFRAME.registerComponent("explosive", {
  tick() {
    const explosiveBelowFloor = this.el.object3D.position.y <= -0.5;
    const { collided } = this.el.components.collider;
    if (explosiveBelowFloor || collided) {
      this.el.parentElement.removeChild(this.el);
    }
    if (collided) {
      collided.parentElement.removeChild(collided);
    }
  }
});

function Mesh() {
  this.mesh = null;
}

function Collider() {
  this.collider = null;
  this.collides = null;
  this.collided = null;
}

function Explosive() {
  this.destructible = true;
}

function ToRemove() {}

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

/*
function Turret() {
  this.firingRate = 1 / 2;
  this.timeUntilFire = 1 / this.firingRate;
}
*/

function Vehicle() {
  this.speed = 1;
  this.onboard = null;
}

function Collector() {
  this.rate = 20;
}

//
// Systems
//

const systems = [];
function update(delta, elapsed) {
  for (const system of systems) {
    system.update(delta, elapsed);
  }
}

class CollisionSystem {
  constructor(entities) {
    this.query = entities.queryComponents([Mesh, Collider]);
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  }
  update() {
    for (const entity of this.query) {
      entity.collider.collided = null;
    }
    for (let i = 0; i < this.query.length; i++) {
      const e1 = this.query[i];
      const e1c = e1.collider;
      const e1m = e1.mesh.mesh;
      e1m.updateMatrixWorld();
      APP.updateBox(this.tempBox1, e1c.collider, e1m.matrixWorld);
      for (let j = i + 1; j < this.query.length; j++) {
        const e2 = this.query[j];
        if (e1c.collides && !e2.hasTag(e1c.collides)) continue;
        const e2c = e2.collider;
        const e2m = e2.mesh.mesh;
        e2m.updateMatrixWorld();
        APP.updateBox(this.tempBox2, e2c.collider, e2m.matrixWorld);
        if (!this.tempBox1.intersectsBox(this.tempBox2)) continue;
        e1c.collided = e2;
        e2c.collided = e1;
      }
    }
  }
}

class ExplosiveSystem {
  constructor(entities) {
    this.query = entities.queryComponents([Mesh, Explosive, Collider]);
  }
  update() {
    for (const entity of this.query) {
      const { collided } = entity.collider;
      const explosiveBelowFloor = entity.mesh.mesh.position.y <= -0.5;
      if (explosiveBelowFloor || (collided && entity.explosive.destructible)) {
        entity.addComponent(ToRemove);
      }
      if (collided) {
        entity.collider.collided.addComponent(ToRemove);
      }
    }
  }
}

class OnboardRemover {
  constructor(entities) {
    this.query = entities.queryComponents([Vehicle, ToRemove]);
  }
  update() {
    for (const entity of this.query) {
      entity.vehicle.onboard.addComponent(ToRemove);
    }
  }
}

class MeshRemover {
  constructor(entities) {
    this.query = entities.queryComponents([Mesh, ToRemove]);
    this._entitiesToRemove = [];
  }
  update() {
    this._entitiesToRemove.length = 0;
    for (const entity of this.query) {
      this._entitiesToRemove.push(entity);
    }
    for (const entity of this._entitiesToRemove) {
      entity.mesh.mesh.parent.remove(entity.mesh.mesh);
      entity.remove();
    }
  }
}

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

class TurretSystem {
  constructor(entities) {
    this.query = entities.queryComponents([Turret, Mesh]);
  }
  update(delta) {
    for (const entity of this.query) {
      entity.turret.timeUntilFire -= delta;
      if (entity.turret.timeUntilFire <= 0) {
        const projectile = createProjectile();
        entity.mesh.mesh.getWorldPosition(projectile.mesh.mesh.position);
        entity.turret.timeUntilFire = 1 / entity.turret.firingRate;
      }
    }
  }
}

class VehicleSystem {
  constructor(entities) {
    this.query = entities.queryComponents([Vehicle, Mesh]);
  }
  update(delta) {
    for (const entity of this.query) {
      const { position } = entity.mesh.mesh;
      if (Math.abs(position.x) >= 2) {
        position.x = Math.sign(position.x) * 2;
        entity.vehicle.speed *= -1;
      }
      position.x += entity.vehicle.speed * delta;
    }
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
      //enemy.mesh.mesh.position.x = lane;
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
systems.push(new GravitySystem(entities));
systems.push(new VelocitySystem(entities));
systems.push(new CollisionSystem(entities));
systems.push(new ExplosiveSystem(entities));
systems.push(new OnboardRemover(entities));
systems.push(new MeshRemover(entities));
const resourceSystem = new ResourceSystem(entities);
systems.push(resourceSystem);
systems.push(new PlacementSystem(entities, resourceSystem));
systems.push(new TurretSystem(entities));
systems.push(new VehicleSystem(entities));
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
  //entity.addTag("enemy");
  //entity.addComponent(Mesh);
  //entity.mesh.mesh = APP.createBox("green");
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "green" });
  entity.setAttribute("velocity", { z: 1.5 });
  entity.setAttribute("collider", { collider: "0.8 0.8 0.8" });
  entity.setAttribute("explosive", "");
  scene.append(entity);

  //entity.addComponent(Collider);
  //entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  //entity.addComponent(Explosive);
  //entity.explosive.destructible = false;
  //entity.velocity.z = 1.5;
  //APP.scene.add(entity.mesh.mesh);
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
  //entity.addComponent(Collider);
  //entity.collider.collides = "enemy";
  //entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  //entity.addComponent(Explosive);
  entity.setAttribute("gravity", "");
  entity.setAttribute("velocity", { z: -20 });
  entity.setAttribute("collider", { collider: "0.2 0.2 0.2" });
  entity.setAttribute("explosive", "");
  scene.append(entity);
  return entity;
}

function createTurret(withCollider = true, firingRate) {
  const entity = document.createElement("a-entity");
  // entity.addComponent(Turret);
  /*
  if (firingRate) {
    entity.turret.firingRate = firingRate;
    entity.turret.timeUntilFire = 1 / firingRate;
  }*/
  entity.setAttribute("turret", "");
  entity.setAttribute("geometry", { primitive: "box", width: 0.8, height: 0.8, depth: 0.8 });
  entity.setAttribute("material", { color: "blue" });
  //entity.addComponent(Mesh);
  //entity.mesh.mesh = APP.createBox("blue");
  if (withCollider) {
    //entity.addComponent(Collider);
    //entity.collider.collides = "enemy";
    //entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  }
  scene.append(entity);
  //APP.scene.add(entity.mesh.mesh);
  return entity;
}

function createTurretVehicle() {
  const entity = entities.createEntity();
  entity.addComponent(Vehicle);
  entity.addComponent(Mesh);
  entity.mesh.mesh = APP.createBox("yellow", 0.9);
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  const turret = createTurret(false, 1);
  turret.mesh.mesh.position.y = 0.5;
  entity.mesh.mesh.add(turret.mesh.mesh);
  entity.vehicle.onboard = turret;
  APP.scene.add(entity.mesh.mesh);
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
      const turret = createTurret();
      turret.object3D.position.set(i - 2, 0, j + 2);
    }
  }
}
