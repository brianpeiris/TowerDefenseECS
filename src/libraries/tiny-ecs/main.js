//
// App Boilerplate
//

const { EntityManager } = require("tiny-ecs");

const THREE = require("three");
const App = require("../../app.js");
const Scene = require("../../three-scene.js");

const APP = new App();
const scene = new Scene(update, APP.perfMode);

//
// ECS Setup
//

const entities = new EntityManager();

//
// Components
//

function Velocity() {
  this.x = 0;
  this.y = 0;
  this.z = 0;
}

function Gravity() {
  this.force = -9.8;
}

function Mesh() {
  this.mesh = null;
}

function Collider() {
  this.collider = null;
  this.collides = null;
  this.collided = null;
  this.offsetCollider = new THREE.Box3();
}

function Explosive() {
  this.destructible = true;
}

function ToRemove() {}

function Turret() {
  this.firingRate = 1 / 2;
  this.timeUntilFire = 1 / this.firingRate;
}

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

class GravitySystem {
  constructor(entities) {
    this.query = entities.queryComponents([Velocity, Gravity]);
  }
  update(delta) {
    for (const entity of this.query) {
      entity.velocity.y += entity.gravity.force * delta;
    }
  }
}

class VelocitySystem {
  constructor(entities) {
    this.query = entities.queryComponents([Velocity, Mesh]);
  }
  update(delta) {
    for (const entity of this.query) {
      entity.mesh.mesh.position.x += entity.velocity.x * delta;
      entity.mesh.mesh.position.y += entity.velocity.y * delta;
      entity.mesh.mesh.position.z += entity.velocity.z * delta;
    }
  }
}

class CollisionSystem {
  constructor(entities) {
    this.query = entities.queryComponents([Mesh, Collider]);
  }
  update() {
    for (const entity of this.query) {
      const ec = entity.collider;
      ec.collided = null;
      entity.mesh.mesh.updateMatrixWorld();
      scene.updateBox(ec.offsetCollider, ec.collider, entity.mesh.mesh.matrixWorld);
    }
    for (let i = 0; i < this.query.length; i++) {
      const e1 = this.query[i];
      const e1c = e1.collider;
      for (let j = i + 1; j < this.query.length; j++) {
        const e2 = this.query[j];
        if (e1c.collides && !e2.hasTag(e1c.collides)) continue;
        const e2c = e2.collider;
        if (!e1c.offsetCollider.intersectsBox(e2c.offsetCollider)) continue;
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
  }
  update(delta) {
    let power = 0;
    for (const entity of this.query) {
      power += entity.collector.rate * delta;
    }
    APP.updatePower(power);
  }
}

class PlacementSystem {
  constructor(entities) {
    this.query = entities.queryComponents([Mesh]);
    this.worldPosition = new THREE.Vector3();
    this.placementValid = false;
    this.factories = {
      mine: createMine,
      turret: createTurret,
      vehicle: createTurretVehicle,
      collector: createCollector
    };
    APP.onCreate = (itemName, cost, e) => {
      scene.updatePointer(e);
      this.updatePlacement();
      if (!this.placementValid) return;
      let item = this.factories[itemName]();
      APP.updatePower(-cost);
      item.mesh.mesh.position.copy(scene.placeholder.position);
    };
  }
  update() {
    this.updatePlacement();
  }
  updatePlacement() {
    this.placementValid = !APP.currentItem.input.disabled;
    let x, z;
    const intersection = scene.getIntersection();
    if (intersection) {
      x = Math.round(intersection.point.x);
      z = Math.round(intersection.point.z);
      for (const entity of this.query) {
        entity.mesh.mesh.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!entity.hasTag("projectile") && x === ex && z === ez) {
          this.placementValid = false;
        }
      }
    } else {
      this.placementValid = false;
    }
    scene.updatePlacement(APP.deviceSupportsHover && this.placementValid, x, z);
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

class EnemyWaveSystem {
  constructor() {
    this.currentWave = APP.waves[0];
  }
  update(delta, elapsed) {
    const currentWave = APP.getCurrentWave(elapsed);
    if (currentWave === this.currentWave) return;
    this.currentWave = currentWave;
    this.generateWave(currentWave);
  }
  generateWave(wave) {
    if (!wave) return;
    const occupied = {};
    for (let i = 0; i < wave.enemies; i++) {
      const enemy = createEnemy();
      const lane = THREE.Math.randInt(-2, 2);
      enemy.mesh.mesh.position.x = lane;
      occupied[lane] = occupied[lane] === undefined ? 0 : occupied[lane] - 2;
      enemy.mesh.mesh.position.z = occupied[lane] - 5;
    }
  }
}

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
      scene.stop();
      APP.setInfo("You Win!");
      return;
    }
    for (const entity of this.query) {
      scene.updateBox(this.tempBox, entity.collider.collider, entity.mesh.mesh.matrixWorld);
      if (this.tempBox.intersectsBox(this.collider)) {
        scene.stop();
        APP.setInfo("Game Over");
        break;
      }
    }
  }
}

systems.push(new GravitySystem(entities));
systems.push(new VelocitySystem(entities));
systems.push(new CollisionSystem(entities));
systems.push(new ExplosiveSystem(entities));
systems.push(new OnboardRemover(entities));
systems.push(new MeshRemover(entities));
systems.push(new ResourceSystem(entities));
systems.push(new PlacementSystem(entities));
systems.push(new TurretSystem(entities));
systems.push(new VehicleSystem(entities));
const enemyWaveSystem = new EnemyWaveSystem(entities);
systems.push(enemyWaveSystem);
if (!APP.perfMode) {
  systems.push(new GameOverSystem(entities, enemyWaveSystem));
}

//
// Entity factories
//

function createEnemy() {
  const entity = entities.createEntity();
  entity.addTag("enemy");
  entity.addComponent(Mesh);
  entity.mesh.mesh = scene.createBox("green");
  entity.addComponent(Velocity);
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  entity.explosive.destructible = false;
  entity.velocity.z = 1.5;
  scene.add(entity.mesh.mesh);
  return entity;
}

function createMine() {
  const entity = entities.createEntity();
  entity.addComponent(Mesh);
  entity.mesh.mesh = scene.createBox("red");
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  scene.add(entity.mesh.mesh);
  return entity;
}

function createProjectile() {
  const entity = entities.createEntity();
  entity.addTag("projectile");
  entity.addComponent(Mesh);
  entity.mesh.mesh = scene.createBox("red", 0.2);
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  entity.addComponent(Gravity);
  entity.addComponent(Velocity);
  entity.velocity.z = -20.0;
  scene.add(entity.mesh.mesh);
  return entity;
}

function createTurret(withCollider = true, firingRate) {
  const entity = entities.createEntity();
  entity.addComponent(Turret);
  if (firingRate) {
    entity.turret.firingRate = firingRate;
    entity.turret.timeUntilFire = 1 / firingRate;
  }
  entity.addComponent(Mesh);
  entity.mesh.mesh = scene.createBox("blue");
  if (withCollider) {
    entity.addComponent(Collider);
    entity.collider.collides = "enemy";
    entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  }
  scene.add(entity.mesh.mesh);
  return entity;
}

function createTurretVehicle() {
  const entity = entities.createEntity();
  entity.addComponent(Vehicle);
  entity.addComponent(Mesh);
  entity.mesh.mesh = scene.createBox("yellow", 0.9);
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  const turret = createTurret(false, 1);
  turret.mesh.mesh.position.y = 0.5;
  entity.mesh.mesh.add(turret.mesh.mesh);
  entity.vehicle.onboard = turret;
  scene.add(entity.mesh.mesh);
  return entity;
}

function createCollector() {
  const entity = entities.createEntity();
  entity.addComponent(Collector);
  entity.addComponent(Mesh);
  entity.mesh.mesh = scene.createBox("orange");
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  scene.add(entity.mesh.mesh);
  return entity;
}

if (APP.perfMode) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const turret = createTurretVehicle();
      turret.mesh.mesh.position.set(i - 2, 0, j + 2);
    }
  }
}
