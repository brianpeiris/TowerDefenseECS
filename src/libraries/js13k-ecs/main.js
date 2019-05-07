//
// App Boilerplate
//

const ecs = require("js13k-ecs/src/ecs").default;

const THREE = require("three");
const App = require("../../app.js");
const Scene = require("../../three-scene.js");

const APP = new App();
const scene = new Scene(update, APP.perfMode);

//
// Components
//

function Velocity(x = 0, y = 0, z = 0) {
  this.x = x;
  this.y = y;
  this.z = z;
}

function Gravity() {
  this.force = -9.8;
}

function Mesh(mesh) {
  this.mesh = mesh;
}

function Collider(collider, collides) {
  this.collider = collider;
  this.collides = collides;
  this.collided = null;
  this.offsetCollider = new THREE.Box3();
}

function Explosive(destructible = true) {
  this.destructible = destructible;
}

function ToRemove() {}

function Enemy() {}

function Projectile() {}

function Turret(firingRate = 1 / 2) {
  this.firingRate = firingRate;
  this.timeUntilFire = 1 / this.firingRate;
}

function Vehicle(onboard) {
  this.speed = 1;
  this.onboard = onboard;
}

function Collector() {
  this.rate = 20;
}

ecs.register(Velocity, Gravity, Mesh, Collider, Explosive, ToRemove, Enemy, Projectile, Turret, Vehicle, Collector);

//
// Systems
//

const systems = [];
function update(delta) {
  ecs.update(delta);
}

class GravitySystem {
  constructor() {
    this.query = ecs.select(Velocity, Gravity);
  }
  update(delta) {
    this.query.iterate(entity => {
      entity.get(Velocity).y += entity.get(Gravity).force * delta;
    });
  }
}

class VelocitySystem {
  constructor() {
    this.query = ecs.select(Velocity, Mesh);
  }
  update(delta) {
    this.query.iterate(entity => {
      const mesh = entity.get(Mesh);
      const velocity = entity.get(Velocity);
      mesh.mesh.position.x += velocity.x * delta;
      mesh.mesh.position.y += velocity.y * delta;
      mesh.mesh.position.z += velocity.z * delta;
    });
  }
}

class CollisionSystem {
  constructor() {
    this.query = ecs.select(Mesh, Collider);
  }
  update() {
    this.query.iterate(entity => {
      const ec = entity.get(Collider);
      ec.collided = null;
      const em = entity.get(Mesh).mesh;
      em.updateMatrixWorld();
      scene.updateBox(ec.offsetCollider, ec.collider, em.matrixWorld);
    });

    let e1n = this.query.list;
    while (e1n) {
      const e1 = e1n.entity;
      const e1c = e1.get(Collider);
      let e2n = e1n.next;
      while (e2n) {
        const e2 = e2n.entity;
        if (e1c.collides && !e2.has(e1c.collides)) {
          e2n = e2n.next;
          continue;
        }
        const e2c = e2.get(Collider);
        if (e1c.offsetCollider.intersectsBox(e2c.offsetCollider)) {
          e1c.collided = e2;
          e2c.collided = e1;
        }
        e2n = e2n.next;
      }
      e1n = e1n.next;
    }
  }
}

class ExplosiveSystem {
  constructor() {
    this.query = ecs.select(Mesh, Explosive, Collider);
  }
  update() {
    this.query.iterate(entity => {
      const collider = entity.get(Collider);
      const { collided } = collider;
      const explosiveBelowFloor = entity.get(Mesh).mesh.position.y <= -0.5;
      const explosive = entity.get(Explosive);
      if (explosiveBelowFloor || (collided && explosive.destructible)) {
        entity.add(new ToRemove());
      }
      if (collided) {
        collided.add(new ToRemove());
      }
    });
  }
}

class OnboardRemover {
  constructor() {
    this.query = ecs.select(Vehicle, ToRemove);
  }
  update() {
    this.query.iterate(entity => {
      entity.get(Vehicle).onboard.add(new ToRemove());
    });
  }
}

class MeshRemover {
  constructor() {
    this.query = ecs.select(Mesh, ToRemove);
    this._entitiesToRemove = [];
  }
  update() {
    this._entitiesToRemove.length = 0;
    this.query.iterate(entity => {
      this._entitiesToRemove.push(entity);
    });
    for (const entity of this._entitiesToRemove) {
      entity.get(Mesh).mesh.parent.remove(entity.get(Mesh).mesh);
      entity.eject();
    }
  }
}

class ResourceSystem {
  constructor() {
    this.query = ecs.select(Collector);
  }
  update(delta) {
    let power = 0;
    this.query.iterate(entity => {
      power += entity.get(Collector).rate * delta;
    });
    APP.updatePower(power);
  }
}

class PlacementSystem {
  constructor() {
    this.query = ecs.select(Mesh);
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
      item.get(Mesh).mesh.position.copy(scene.placeholder.position);
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
      this.query.iterate(entity => {
        entity.get(Mesh).mesh.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!entity.has(Projectile) && x === ex && z === ez) {
          this.placementValid = false;
        }
      });
    } else {
      this.placementValid = false;
    }
    scene.updatePlacement(APP.deviceSupportsHover && this.placementValid, x, z);
  }
}

class TurretSystem {
  constructor() {
    this.query = ecs.select(Turret, Mesh);
  }
  update(delta) {
    this.query.iterate(entity => {
      const turret = entity.get(Turret);
      turret.timeUntilFire -= delta;
      if (turret.timeUntilFire <= 0) {
        const projectile = createProjectile();
        entity.get(Mesh).mesh.getWorldPosition(projectile.get(Mesh).mesh.position);
        turret.timeUntilFire = 1 / turret.firingRate;
      }
    });
  }
}

class VehicleSystem {
  constructor() {
    this.query = ecs.select(Vehicle, Mesh);
  }
  update(delta) {
    this.query.iterate(entity => {
      const { position } = entity.get(Mesh).mesh;
      if (Math.abs(position.x) >= 2) {
        position.x = Math.sign(position.x) * 2;
        entity.get(Vehicle).speed *= -1;
      }
      position.x += entity.get(Vehicle).speed * delta;
    });
  }
}

class EnemyWaveSystem {
  constructor() {
    this.elapsed = 0;
    this.currentWave = APP.waves[0];
  }
  update(delta) {
    this.elapsed += delta;
    const currentWave = APP.getCurrentWave(this.elapsed);
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
      enemy.get(Mesh).mesh.position.x = lane;
      occupied[lane] = occupied[lane] === undefined ? 0 : occupied[lane] - 2;
      enemy.get(Mesh).mesh.position.z = occupied[lane] - 5;
    }
  }
}

class GameOverSystem {
  constructor(enemyWaveSystem) {
    this.enemyWaveSystem = enemyWaveSystem;
    this.query = ecs.select(Enemy);
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
    let node = this.query.list;
    while (node) {
      const { entity } = node;
      scene.updateBox(this.tempBox, entity.get(Collider).collider, entity.get(Mesh).mesh.matrixWorld);
      if (this.tempBox.intersectsBox(this.collider)) {
        scene.stop();
        APP.setInfo("Game Over");
        break;
      }
      node = node.next;
    }
  }
}

systems.push(new GravitySystem());
systems.push(new VelocitySystem());
systems.push(new CollisionSystem());
systems.push(new ExplosiveSystem());
systems.push(new OnboardRemover());
systems.push(new MeshRemover());
systems.push(new ResourceSystem());
systems.push(new PlacementSystem());
systems.push(new TurretSystem());
systems.push(new VehicleSystem());
const enemyWaveSystem = new EnemyWaveSystem();
systems.push(enemyWaveSystem);
if (!APP.perfMode) {
  systems.push(new GameOverSystem(enemyWaveSystem));
}
ecs.process(...systems);

//
// Entity factories
//

function createEnemy() {
  const entity = ecs.create();
  entity.add(new Enemy());
  const mesh = new Mesh(scene.createBox("green"));
  entity.add(mesh);
  entity.add(new Velocity(0, 0, 1.5));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh.mesh)));
  entity.add(new Explosive(false));
  scene.add(mesh.mesh);
  return entity;
}

function createMine() {
  const entity = ecs.create();
  const mesh = scene.createBox("red");
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh), Enemy));
  entity.add(new Explosive());
  scene.add(mesh);
  return entity;
}

function createProjectile() {
  const entity = ecs.create();
  const mesh = scene.createBox("red", 0.2);
  entity.add(new Projectile());
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh), Enemy));
  entity.add(new Explosive());
  entity.add(new Gravity());
  entity.add(new Velocity(0, 0, -20));
  scene.add(mesh);
  return entity;
}

function createTurret(withCollider = true, firingRate) {
  const entity = ecs.create();
  entity.add(new Turret(firingRate));
  const mesh = scene.createBox("blue");
  entity.add(new Mesh(mesh));
  if (withCollider) {
    entity.add(new Collider(new THREE.Box3().setFromObject(mesh), Enemy));
  }
  scene.add(mesh);
  return entity;
}

function createTurretVehicle() {
  const entity = ecs.create();
  const turret = createTurret(false, 1);
  const turretMesh = turret.get(Mesh).mesh;
  turretMesh.position.y = 0.5;
  entity.add(new Vehicle(turret));
  const mesh = scene.createBox("yellow", 0.9);
  mesh.add(turretMesh);
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh), Enemy));
  scene.add(mesh);
  return entity;
}

function createCollector() {
  const entity = ecs.create();
  entity.add(new Collector());
  const mesh = scene.createBox("orange");
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh), Enemy));
  scene.add(mesh);
  return entity;
}

if (APP.perfMode) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const turret = createTurretVehicle();
      turret.get(Mesh).mesh.position.set(i - 2, 0, j + 2);
    }
  }
}
