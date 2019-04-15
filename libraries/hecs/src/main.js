//
// App Boilerplate
//

const THREE = require("three");
const { World, System, EntityId, Read, Write } = require("hecs");
const App = require("../../common/app.js");

const APP = new App(update);

//
// ECS Setup
//

const world = new World();

//
// Components
//

class Velocity {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}
world.registerComponent(Velocity);

class Gravity {
  constructor() {
    this.force = -9.8;
  }
}
world.registerComponent(Gravity);

class Mesh {
  constructor(mesh) {
    this.mesh = mesh;
  }
}
world.registerComponent(Mesh);

class Collider {
  constructor(collider) {
    this.collider = collider;
    this.collided = null;
  }
}
world.registerComponent(Collider);

class Explosive {
  constructor(explodes = null, destructible = true) {
    this.destructible = destructible;
    this.explodes = explodes;
  }
}
world.registerComponent(Explosive);

class ToRemove {}
world.registerComponent(ToRemove);

class Enemy {}
world.registerComponent(Enemy);

class Projectile {}
world.registerComponent(Projectile);

class Turret {
  constructor(firingRate = 1 / 2) {
    this.firingRate = firingRate;
    this.timeUntilFire = 1 / this.firingRate;
  }
}
world.registerComponent(Turret);

class Vehicle {
  constructor(onboard) {
    this.speed = 1;
    this.onboard = onboard;
  }
}
world.registerComponent(Vehicle);

class Collector {
  constructor() {
    this.rate = 20;
  }
}
world.registerComponent(Collector);

//
// Systems
//

function update() {
  world.update();
}

class GravitySystem extends System {
  setup() {
    return {
      entities: this.world.createQuery(Write(Velocity), Read(Gravity))
    };
  }
  update() {
    for (const [velocity, gravity] of this.ctx.entities) {
      velocity.y += gravity.force * APP.delta;
    }
  }
}

class VelocitySystem extends System {
  setup() {
    return {
      entities: this.world.createQuery(Read(Mesh), Read(Velocity))
    };
  }
  update() {
    for (const [mesh, velocity] of this.ctx.entities) {
      mesh.mesh.position.x += velocity.x * APP.delta;
      mesh.mesh.position.y += velocity.y * APP.delta;
      mesh.mesh.position.z += velocity.z * APP.delta;
    }
  }
}

class CollisionSystem extends System {
  constructor() {
    super();
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  }
  setup() {
    return {
      e1: this.world.createQuery(Write(Collider), EntityId, Read(Mesh)),
      e2: this.world.createQuery(Write(Collider), EntityId, Read(Mesh))
    };
  }
  update() {
    for (const [collider] of this.ctx.e1) {
      collider.collided = null;
    }
    let i = 0;
    let j = 0;
    for (const [c1, e1, m1] of this.ctx.e1) {
      m1.mesh.updateMatrixWorld();
      APP.updateBox(this.tempBox1, c1.collider, m1.mesh.matrixWorld);
      j = 0;
      for (const [c2, e2, m2] of this.ctx.e2) {
        if (j > i) {
          m2.mesh.updateMatrixWorld();
          APP.updateBox(this.tempBox2, c2.collider, m2.mesh.matrixWorld);
          if (this.tempBox1.intersectsBox(this.tempBox2)) {
            c1.collided = e2;
            c2.collided = e1;
          }
        }
        j++;
      }
      i++;
    }
  }
}

class ExplosiveSystem extends System {
  setup() {
    return {
      entities: this.world.createQuery(EntityId, Write(Collider), Read(Explosive), Read(Mesh))
    };
  }
  update() {
    for (const [entity, collider, explosive, mesh] of this.ctx.entities) {
      const { collided } = collider;
      const explosiveBelowFloor = mesh.mesh.position.y <= -0.5;
      const shouldExplodeCollided =
        collided && (explosive.explodes === null || world.hasComponent(collided, explosive.explodes));
      if (explosiveBelowFloor || (shouldExplodeCollided && explosive.destructible)) {
        world.addComponent(entity, new ToRemove());
      }
      if (shouldExplodeCollided) {
        world.addComponent(collider.collided, new ToRemove());
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
  setup() {
    return {
      entities: this.world.createQuery(EntityId, Read(Mesh), Read(ToRemove))
    };
  }
  update() {
    for (const [entity, mesh] of this.ctx.entities) {
      mesh.mesh.parent.remove(mesh.mesh);
      world.destroyEntity(entity);
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
  setup() {
    return {
      entities: this.world.createQuery(Write(Turret), Read(Mesh))
    };
  }
  update() {
    for (const [turret, mesh] of this.ctx.entities) {
      turret.timeUntilFire -= APP.delta;
      if (turret.timeUntilFire <= 0) {
        const projectile = createProjectile();
        const projectileMesh = world.getImmutableComponent(projectile, Mesh);
        mesh.mesh.getWorldPosition(projectileMesh.mesh.position);
        turret.timeUntilFire = 1 / turret.firingRate;
      }
    }
  }
}

class VehicleSystem extends System {
  setup() {
    return {
      entities: this.world.createQuery(Write(Vehicle), Read(Mesh))
    };
  }
  update() {
    for (const [vehicle, mesh] of this.ctx.entities) {
      const { position } = mesh.mesh;
      if (Math.abs(position.x) >= 2) {
        position.x = Math.sign(position.x) * 2;
        vehicle.speed *= -1;
      }
      position.x += vehicle.speed * APP.delta;
    }
  }
}

class EnemyWaveSystem extends System {
  constructor() {
    super();
    this.currentWave = APP.waves[0];
  }
  setup() {
    return null;
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
      const mesh = world.getImmutableComponent(enemy, Mesh);
      mesh.mesh.position.x = lane;
      occupied[lane] = occupied[lane] === undefined ? 0 : occupied[lane] - 2;
      mesh.mesh.position.z = occupied[lane] - 5;
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

world.registerSystem(new GravitySystem());
world.registerSystem(new VelocitySystem());
world.registerSystem(new CollisionSystem());
world.registerSystem(new ExplosiveSystem());
//world.registerSystem(new OnboardRemover());
world.registerSystem(new MeshRemover());
//const resourceSystem = new ResourceSystem();
//world.registerSystem(resourceSystem);
//world.registerSystem(new PlacementSystem(resourceSystem));
world.registerSystem(new TurretSystem());
world.registerSystem(new VehicleSystem());
const enemyWaveSystem = new EnemyWaveSystem();
world.registerSystem(enemyWaveSystem);
if (!APP.perfMode) {
  //world.registerSystem(new GameOverSystem(enemyWaveSystem));
}

//
// Entity factories
//

function createEnemy() {
  const entity = world.createEntity();
  world.addComponent(entity, new Enemy());
  const mesh = APP.createBox("green");
  world.addComponent(entity, new Mesh(mesh));
  world.addComponent(entity, new Velocity(0, 0, 1.5));
  world.addComponent(entity, new Collider(new THREE.Box3().setFromObject(mesh)));
  world.addComponent(entity, new Explosive(null, false));
  APP.scene.add(mesh);
  return entity;
}

function createMine() {
  const entity = entities.createEntity();
  entity.addComponent(Mesh);
  entity.mesh.mesh = APP.createBox("red");
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  entity.explosive.explodes = "enemy";
  APP.scene.add(entity.mesh.mesh);
  return entity;
}

function createProjectile() {
  const entity = world.createEntity();
  world.addComponent(entity, new Projectile());
  const mesh = APP.createBox("red", 0.2);
  world.addComponent(entity, new Mesh(mesh));
  world.addComponent(entity, new Collider(new THREE.Box3().setFromObject(mesh)));
  world.addComponent(entity, new Explosive(Enemy));
  world.addComponent(entity, new Gravity());
  world.addComponent(entity, new Velocity(0, 0, -20));
  APP.scene.add(mesh);
  return entity;
}

function createTurret(withCollider = true, firingRate) {
  const entity = world.createEntity();
  world.addComponent(entity, new Turret(firingRate));
  const mesh = APP.createBox("blue");
  world.addComponent(entity, new Mesh(mesh));
  if (withCollider) {
    world.addComponent(entity, new Collider(new THREE.Box3().setFromObject(mesh)));
  }
  APP.scene.add(mesh);
  return entity;
}

function createTurretVehicle() {
  const turret = createTurret(false, 1);
  const turretMesh = world.getImmutableComponent(turret, Mesh);
  turretMesh.mesh.position.y = 0.5;

  const entity = world.createEntity();
  world.addComponent(entity, new Vehicle(turret));
  const mesh = APP.createBox("yellow", 0.9);
  mesh.add(turretMesh.mesh);
  world.addComponent(entity, new Mesh(mesh));
  world.addComponent(entity, new Collider(new THREE.Box3().setFromObject(mesh)));

  APP.scene.add(mesh);
  return entity;
}

function createCollector() {
  const entity = entities.createEntity();
  entity.addComponent(Collector);
  entity.addComponent(Mesh);
  entity.mesh.mesh = APP.createBox("orange");
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  APP.scene.add(entity.mesh.mesh);
  return entity;
}

if (APP.perfMode) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const turret = createTurretVehicle();
      const turretMesh = world.getImmutableComponent(turret, Mesh);
      turretMesh.mesh.position.set(i - 2, 0, j + 2);
    }
  }
}
