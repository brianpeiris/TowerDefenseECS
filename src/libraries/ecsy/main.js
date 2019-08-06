//
// App Boilerplate
//

const { World, System, TagComponent } = require("ecsy");

const THREE = require("three");
const App = require("../../app.js");
const Scene = require("../../three-scene.js");

const APP = new App();
const scene = new Scene(execute, APP.perfMode);

//
// ECS Setup
//

const world = new World();

//
// Components
//

class Velocity {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }
}

class Gravity {
  constructor() {
    this.reset();
  }
  reset() {
    this.force = -9.8;
  }
}

class Mesh {
  constructor() {
    this.reset();
  }
  reset() {
    this.mesh = null;
  }
}

class Collider {
  constructor() {
    this.reset();
  }
  reset() {
    this.collider = null;
    this.collides = null;
    this.collided = null;
    this.offsetCollider = new THREE.Box3();
  }
}

class Explosive {
  constructor() {
    this.reset();
  }
  reset() {
    this.destructible = true;
  }
}

class ToRemove extends TagComponent {}

class Enemy extends TagComponent {}

class Projectile extends TagComponent {}

class Turret {
  constructor() {
    this.reset();
  }
  reset() {
    this.firingRate = 1 / 2;
    this.timeUntilFire = 1 / this.firingRate;
  }
}

class Vehicle {
  constructor() {
    this.reset();
  }
  reset() {
    this.speed = 1;
    this.onboard = null;
  }
}

class Collector {
  constructor() {
    this.reset();
  }
  reset() {
    this.rate = 20;
  }
}

//
// Systems
//

function execute(delta, elapsed) {
  world.execute(delta, elapsed);
}

class GravitySystem extends System {
  init() {
    return {
      queries: {
        entities: { components: [Velocity, Gravity] }
      }
    };
  }
  execute(delta) {
    for (const entity of this.queries.entities) {
      entity.getMutableComponent(Velocity).y += entity.getComponent(Gravity).force * delta;
    }
  }
}

class VelocitySystem extends System {
  init() {
    return {
      queries: {
        entities: { components: [Velocity, Mesh] }
      }
    };
  }
  execute(delta) {
    for (const entity of this.queries.entities) {
      const mesh = entity.getComponent(Mesh);
      const velocity = entity.getComponent(Velocity);
      mesh.mesh.position.x += velocity.x * delta;
      mesh.mesh.position.y += velocity.y * delta;
      mesh.mesh.position.z += velocity.z * delta;
    }
  }
}

class CollisionSystem extends System {
  init() {
    return {
      queries: {
        entities: { components: [Mesh, Collider] }
      }
    };
  }
  execute() {
    for (const entity of this.queries.entities) {
      const ec = entity.getMutableComponent(Collider);
      ec.collided = null;
      const mesh = entity.getComponent(Mesh);
      mesh.mesh.updateMatrixWorld();
      scene.updateBox(ec.offsetCollider, ec.collider, mesh.mesh.matrixWorld);
    }
    for (let i = 0; i < this.queries.entities.length; i++) {
      const e1 = this.queries.entities[i];
      const e1c = e1.getMutableComponent(Collider);
      for (let j = i + 1; j < this.queries.entities.length; j++) {
        const e2 = this.queries.entities[j];
        if (e1c.collides && !e2.hasComponent(e1c.collides)) continue;
        const e2c = e2.getMutableComponent(Collider);
        if (!e1c.offsetCollider.intersectsBox(e2c.offsetCollider)) continue;
        e1c.collided = e2;
        e2c.collided = e1;
      }
    }
  }
}

class ExplosiveSystem extends System {
  init() {
    return {
      queries: {
        entities: { components: [Mesh, Explosive, Collider] }
      }
    };
  }
  execute() {
    for (const entity of this.queries.entities) {
      const collider = entity.getComponent(Collider);
      const { collided } = collider;
      const explosiveBelowFloor = entity.getComponent(Mesh).mesh.position.y <= -0.5;
      if (explosiveBelowFloor || (collided && entity.getComponent(Explosive).destructible)) {
        entity.addComponent(ToRemove);
      }
      if (collided) {
        collider.collided.addComponent(ToRemove);
      }
    }
  }
}

class OnboardRemover extends System {
  init() {
    return {
      queries: {
        entities: { components: [Vehicle, ToRemove] }
      }
    };
  }
  execute() {
    for (const entity of this.queries.entities) {
      entity.getComponent(Vehicle).onboard.addComponent(ToRemove);
    }
  }
}

class MeshRemover extends System {
  init() {
    this._entitiesToRemove = [];
    return {
      queries: {
        entities: { components: [Mesh, ToRemove] }
      }
    };
  }
  execute() {
    this._entitiesToRemove.length = 0;
    for (const entity of this.queries.entities) {
      this._entitiesToRemove.push(entity);
    }
    for (const entity of this._entitiesToRemove) {
      const { mesh } = entity.getComponent(Mesh);
      mesh.parent.remove(mesh);
      entity.remove();
    }
  }
}

class ResourceSystem extends System {
  init() {
    return {
      queries: {
        entities: { components: [Collector] }
      }
    };
  }
  execute(delta) {
    let power = 0;
    for (const entity of this.queries.entities) {
      power += entity.getComponent(Collector).rate * delta;
    }
    APP.updatePower(power);
  }
}

class PlacementSystem extends System {
  init() {
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
      item.getComponent(Mesh).mesh.position.copy(scene.placeholder.position);
    };
    return {
      queries: {
        entities: { components: [Mesh] }
      }
    };
  }
  execute() {
    this.updatePlacement();
  }
  updatePlacement() {
    this.placementValid = !APP.currentItem.input.disabled;
    let x, z;
    const intersection = scene.getIntersection();
    if (intersection) {
      x = Math.round(intersection.point.x);
      z = Math.round(intersection.point.z);
      for (const entity of this.queries.entities) {
        entity.getComponent(Mesh).mesh.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!entity.hasComponent(Projectile) && x === ex && z === ez) {
          this.placementValid = false;
        }
      }
    } else {
      this.placementValid = false;
    }
    scene.updatePlacement(APP.deviceSupportsHover && this.placementValid, x, z);
  }
}

class TurretSystem extends System {
  init() {
    return {
      queries: {
        entities: { components: [Turret, Mesh] }
      }
    };
  }
  execute(delta) {
    for (const entity of this.queries.entities) {
      const turret = entity.getMutableComponent(Turret);
      turret.timeUntilFire -= delta;
      if (turret.timeUntilFire <= 0) {
        const projectile = createProjectile();
        entity.getComponent(Mesh).mesh.getWorldPosition(projectile.getComponent(Mesh).mesh.position);
        turret.timeUntilFire = 1 / turret.firingRate;
      }
    }
  }
}

class VehicleSystem extends System {
  init() {
    return {
      queries: {
        entities: { components: [Vehicle, Mesh] }
      }
    };
  }
  execute(delta) {
    for (const entity of this.queries.entities) {
      const { position } = entity.getComponent(Mesh).mesh;
      const vehicle = entity.getMutableComponent(Vehicle);
      if (Math.abs(position.x) >= 2) {
        position.x = Math.sign(position.x) * 2;
        vehicle.speed *= -1;
      }
      position.x += vehicle.speed * delta;
    }
  }
}

class EnemyWaveSystem extends System {
  init() {
    this.currentWave = APP.waves[0];
  }
  execute(delta, elapsed) {
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
      const lane = APP.perfMode ? (i % 5) - 2 : THREE.Math.randInt(-2, 2);
      const mesh = enemy.getComponent(Mesh);
      mesh.mesh.position.x = lane;
      occupied[lane] = occupied[lane] === undefined ? 0 : occupied[lane] - 2;
      mesh.mesh.position.z = occupied[lane] - 5;
    }
  }
}

class GameOverSystem extends System {
  init() {
    this.tempBox = new THREE.Box3();
    this.collider = new THREE.Box3();
    this.collider.setFromCenterAndSize(new THREE.Vector3(0, 0, 6), new THREE.Vector3(5, 1, 1));
    return {
      queries: {
        entities: { components: [Enemy] }
      }
    };
  }
  execute(delta, elapsed) {
    if (!this.queries.entities.length && !APP.getCurrentWave(elapsed)) {
      scene.stop();
      APP.setInfo("You Win!");
      return;
    }
    for (const entity of this.queries.entities) {
      scene.updateBox(this.tempBox, entity.getComponent(Collider).collider, entity.getComponent(Mesh).mesh.matrixWorld);
      if (this.tempBox.intersectsBox(this.collider)) {
        scene.stop();
        APP.setInfo("Game Over");
        break;
      }
    }
  }
}

world.registerSystem(GravitySystem);
world.registerSystem(VelocitySystem);
world.registerSystem(CollisionSystem);
world.registerSystem(ExplosiveSystem);
world.registerSystem(OnboardRemover);
world.registerSystem(MeshRemover);
world.registerSystem(ResourceSystem);
world.registerSystem(PlacementSystem);
world.registerSystem(TurretSystem);
world.registerSystem(VehicleSystem);
world.registerSystem(EnemyWaveSystem);
if (!APP.perfMode) {
  world.registerSystem(GameOverSystem);
}

//
// Entity factories
//

function createEnemy() {
  const entity = world.createEntity();
  entity.addComponent(Enemy);
  const mesh = scene.createBox("green");
  entity.addComponent(Mesh, { mesh });
  entity.addComponent(Velocity, { z: 1.5 });
  entity.addComponent(Collider, { collides: null, collider: new THREE.Box3().setFromObject(mesh) });
  entity.addComponent(Explosive, { destructible: false });
  scene.add(mesh);
  return entity;
}

function createMine() {
  const entity = world.createEntity();
  const mesh = scene.createBox("red");
  entity.addComponent(Mesh, { mesh });
  entity.addComponent(Collider, { collides: Enemy, collider: new THREE.Box3().setFromObject(mesh) });
  entity.addComponent(Explosive);
  scene.add(mesh);
  return entity;
}

function createProjectile() {
  const entity = world.createEntity();
  entity.addComponent(Projectile);
  const mesh = scene.createBox("red", 0.2);
  entity.addComponent(Mesh, { mesh });
  entity.addComponent(Collider, { collides: Enemy, collider: new THREE.Box3().setFromObject(mesh) });
  entity.addComponent(Explosive);
  entity.addComponent(Gravity);
  entity.addComponent(Velocity, { z: -20 });
  scene.add(mesh);
  return entity;
}

function createTurret(withCollider = true, firingRate) {
  const entity = world.createEntity();
  let turret = {};
  if (firingRate) {
    turret.firingRate = firingRate;
    turret.timeUntilFire = 1 / firingRate;
  }
  entity.addComponent(Turret, turret);
  const mesh = scene.createBox("blue", 0.7);
  entity.addComponent(Mesh, { mesh });
  if (withCollider) {
    entity.addComponent(Collider, { collides: Enemy, collider: new THREE.Box3().setFromObject(mesh) });
  }
  scene.add(mesh);
  return entity;
}

function createTurretVehicle() {
  const entity = world.createEntity();
  const mesh = scene.createBox("yellow", 0.9);
  entity.addComponent(Mesh, { mesh });
  entity.addComponent(Collider, { collides: Enemy, collider: new THREE.Box3().setFromObject(mesh) });
  const turret = createTurret(false, 1);
  const turretMesh = turret.getComponent(Mesh).mesh;
  turretMesh.position.y = 0.5;
  mesh.add(turretMesh);
  entity.addComponent(Vehicle, { onboard: turret });
  scene.add(mesh);
  return entity;
}

function createCollector() {
  const entity = world.createEntity();
  entity.addComponent(Collector);
  const mesh = scene.createBox("orange");
  entity.addComponent(Mesh, { mesh });
  entity.addComponent(Collider, { collides: Enemy, collider: new THREE.Box3().setFromObject(mesh) });
  scene.add(mesh);
  return entity;
}

if (APP.perfMode) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const turret = createTurretVehicle();
      turret.getComponent(Mesh).mesh.position.set(i - 2, 0, j + 2);
    }
  }
}
