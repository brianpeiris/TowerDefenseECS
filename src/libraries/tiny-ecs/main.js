//
// App Boilerplate
//

const THREE = require("three");
const { EntityManager } = require("tiny-ecs");
const App = require("../../app.js");

const APP = new App(update);

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

class System {
  constructor(entities) {
    this.entities = entities;
  }
}

const systems = [];
function update(delta, elapsed) {
  for (const system of systems) {
    system.update(delta, elapsed);
  }
}

class GravitySystem extends System {
  update(delta) {
    const entities = this.entities.queryComponents([Velocity, Gravity]);
    for (const entity of entities) {
      entity.velocity.y += entity.gravity.force * delta;
    }
  }
}

class VelocitySystem extends System {
  update(delta) {
    const entities = this.entities.queryComponents([Velocity, Mesh]);
    for (const entity of entities) {
      entity.mesh.mesh.position.x += entity.velocity.x * delta;
      entity.mesh.mesh.position.y += entity.velocity.y * delta;
      entity.mesh.mesh.position.z += entity.velocity.z * delta;
    }
  }
}

class CollisionSystem extends System {
  constructor(entities) {
    super(entities);
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  }
  update() {
    const entities = this.entities.queryComponents([Mesh, Collider]);
    for (const entity of entities) {
      entity.collider.collided = null;
    }
    for (let i = 0; i < entities.length; i++) {
      const e1 = entities[i];
      const e1c = e1.collider;
      const e1m = e1.mesh.mesh;
      e1m.updateMatrixWorld();
      APP.updateBox(this.tempBox1, e1c.collider, e1m.matrixWorld);
      for (let j = i + 1; j < entities.length; j++) {
        const e2 = entities[j];
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

class ExplosiveSystem extends System {
  update() {
    const entities = this.entities.queryComponents([Mesh, Explosive, Collider]);
    for (const entity of entities) {
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

class OnboardRemover extends System {
  update() {
    const entities = this.entities.queryComponents([Vehicle, ToRemove]);
    for (const entity of entities) {
      entity.vehicle.onboard.addComponent(ToRemove);
    }
  }
}

class MeshRemover extends System {
  constructor(entities) {
    super(entities);
    this._entitiesToRemove = [];
  }
  update() {
    this._entitiesToRemove.length = 0;
    const entities = this.entities.queryComponents([Mesh, ToRemove]);
    for (const entity of entities) {
      this._entitiesToRemove.push(entity);
    }
    for (const entity of this._entitiesToRemove) {
      entity.mesh.mesh.parent.remove(entity.mesh.mesh);
      entity.remove();
    }
  }
}

class ResourceSystem extends System {
  constructor(entities) {
    super(entities);
    this.power = 150;
  }
  update(delta) {
    const entities = this.entities.queryComponents([Collector]);
    for (const entity of entities) {
      this.power += entity.collector.rate * delta;
    }
    APP.updatePower(this.power);
  }
}

class PlacementSystem extends System {
  constructor(entities, resourceSystem) {
    super(entities);
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
    const entities = this.entities.queryComponents([Mesh]);
    const [x, z] = [Math.round(intersection.point.x), Math.round(intersection.point.z)];
    let placementValid = !APP.currentItem.input.disabled;
    for (const entity of entities) {
      entity.mesh.mesh.getWorldPosition(this.worldPosition);
      const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
      if (!entity.hasTag("projectile") && x === ex && z === ez) {
        placementValid = false;
      }
    }
    APP.updatePlacement(placementValid, x, z);
  }
}

class TurretSystem extends System {
  update(delta) {
    const entities = this.entities.queryComponents([Turret, Mesh]);
    for (const entity of entities) {
      entity.turret.timeUntilFire -= delta;
      if (entity.turret.timeUntilFire <= 0) {
        const projectile = createProjectile();
        entity.mesh.mesh.getWorldPosition(projectile.mesh.mesh.position);
        entity.turret.timeUntilFire = 1 / entity.turret.firingRate;
      }
    }
  }
}

class VehicleSystem extends System {
  update(delta) {
    const entities = this.entities.queryComponents([Vehicle, Mesh]);
    for (const entity of entities) {
      const { position } = entity.mesh.mesh;
      if (Math.abs(position.x) >= 2) {
        position.x = Math.sign(position.x) * 2;
        entity.vehicle.speed *= -1;
      }
      position.x += entity.vehicle.speed * delta;
    }
  }
}

class EnemyWaveSystem extends System {
  constructor(entities) {
    super(entities);
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

class GameOverSystem extends System {
  constructor(entities, enemyWaveSystem) {
    super(entities);
    this.enemyWaveSystem = enemyWaveSystem;
    this.tempBox = new THREE.Box3();
    this.collider = new THREE.Box3();
    this.collider.setFromCenterAndSize(new THREE.Vector3(0, 0, 6), new THREE.Vector3(5, 1, 1));
  }
  update() {
    const entities = this.entities.queryTag("enemy");
    if (!entities.length && !this.enemyWaveSystem.currentWave) {
      APP.stopPlaying("You Win!");
      return;
    }
    for (const entity of entities) {
      APP.updateBox(this.tempBox, entity.collider.collider, entity.mesh.mesh.matrixWorld);
      if (this.tempBox.intersectsBox(this.collider)) {
        APP.stopPlaying("Game Over");
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

//
// Entity factories
//

function createEnemy() {
  const entity = entities.createEntity();
  entity.addTag("enemy");
  entity.addComponent(Mesh);
  entity.mesh.mesh = APP.createBox("green");
  entity.addComponent(Velocity);
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  entity.explosive.destructible = false;
  entity.velocity.z = 1.5;
  APP.scene.add(entity.mesh.mesh);
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
  const entity = entities.createEntity();
  entity.addTag("projectile");
  entity.addComponent(Mesh);
  entity.mesh.mesh = APP.createBox("red", 0.2);
  entity.addComponent(Collider);
  entity.collider.collides = "enemy";
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  entity.addComponent(Gravity);
  entity.addComponent(Velocity);
  entity.velocity.z = -20.0;
  APP.scene.add(entity.mesh.mesh);
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
  entity.mesh.mesh = APP.createBox("blue");
  if (withCollider) {
    entity.addComponent(Collider);
    entity.collider.collides = "enemy";
    entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  }
  APP.scene.add(entity.mesh.mesh);
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
      const turret = createTurretVehicle();
      turret.mesh.mesh.position.set(i - 2, 0, j + 2);
    }
  }
}