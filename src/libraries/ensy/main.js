//
// App Boilerplate
//

const EntityManager = require("ensy");

const THREE = require("three");
const App = require("../../app.js");
const Scene = require("../../three-scene.js");

const APP = new App();
const scene = new Scene(update);

//
// ECS Setup
//

const manager = new EntityManager();

//
// Components
//

manager.addComponent("Velocity", {
  state: {
    x: 0,
    y: 0,
    z: 0
  }
});

manager.addComponent("Gravity", {
  state: {
    force: -9.8
  }
});

manager.addComponent("Mesh", {
  state: {
    mesh: null
  }
});

manager.addComponent("Collider", {
  state: {
    collider: null,
    collides: null,
    collided: null,
    offsetCollider: null
  }
});

manager.addComponent("Explosive", {
  state: {
    destructible: true
  }
});

manager.addComponent("ToRemove", { state: {} });

manager.addComponent("Enemy", { state: {} });

manager.addComponent("Projectile", { state: {} });

manager.addComponent("Turret", {
  state: {
    firingRate: 1 / 2,
    timeUntilFire: 2
  }
});

manager.addComponent("Vehicle", {
  state: {
    speed: 1,
    onboard: null
  }
});

manager.addComponent("Collector", {
  state: {
    rate: 20
  }
});

//
// Processors
//

class Processor {
  constructor(manager) {
    this.manager = manager;
  }
}

function update(delta) {
  manager.update(delta);
}

class GravityProcessor extends Processor {
  update(delta) {
    const entities = this.manager.getComponentsData("Gravity");
    for (const entityId in entities) {
      this.manager.getComponentDataForEntity("Velocity", entityId).y += entities[entityId].force * delta;
    }
  }
}

class VelocityProcessor extends Processor {
  update(delta) {
    const entities = this.manager.getComponentsData("Velocity");
    for (const entityId in entities) {
      const mesh = this.manager.getComponentDataForEntity("Mesh", entityId).mesh;
      if (!mesh) continue;
      mesh.position.x += entities[entityId].x * delta;
      mesh.position.y += entities[entityId].y * delta;
      mesh.position.z += entities[entityId].z * delta;
    }
  }
}

class CollisionProcessor extends Processor {
  constructor(entities) {
    super(entities);
  }
  update() {
    const entities = this.manager.getComponentsData("Collider");
    if (!entities) return;
    const entityIds = Object.keys(entities);
    for (const entityId in entities) {
      const ec = entities[entityId];
      ec.collided = null;
      const em = this.manager.getComponentDataForEntity("Mesh", entityId).mesh;
      em.updateMatrixWorld();
      scene.updateBox(ec.offsetCollider, ec.collider, em.matrixWorld);
    }
    for (let i = 0; i < entityIds.length; i++) {
      const e1 = entityIds[i];
      const e1c = entities[e1];
      for (let j = i + 1; j < entityIds.length; j++) {
        const e2 = entityIds[j];
        if (e1c.collides && !this.manager.entityHasComponent(e2, e1c.collides)) continue;
        const e2c = entities[e2];
        if (!e1c.offsetCollider.intersectsBox(e2c.offsetCollider)) continue;
        e1c.collided = e2;
        e2c.collided = e1;
      }
    }
  }
}

class ExplosiveProcessor extends Processor {
  update() {
    const entities = this.manager.getComponentsData("Explosive");
    for (const entityId in entities) {
      const { collided } = this.manager.getComponentDataForEntity("Collider", entityId);
      const explosiveBelowFloor = this.manager.getComponentDataForEntity("Mesh", entityId).mesh.position.y <= -0.5;
      if (explosiveBelowFloor || (collided && entities[entityId].destructible)) {
        this.manager.addComponentsToEntity(["ToRemove"], entityId);
      }
      if (collided) {
        this.manager.addComponentsToEntity(["ToRemove"], collided);
      }
    }
  }
}

class OnboardRemover extends Processor {
  update() {
    const entities = this.manager.getComponentsData("Vehicle");
    for (const entityId in entities) {
      if (this.manager.entityHasComponent(entityId, "ToRemove")) {
        this.manager.addComponentsToEntity(["ToRemove"], entities[entityId].onboard);
      }
    }
  }
}

class MeshRemover extends Processor {
  constructor(manager) {
    super(manager);
    this._entitiesToRemove = [];
  }
  update() {
    this._entitiesToRemove.length = 0;
    const entities = this.manager.getComponentsData("ToRemove");
    for (const entityId in entities) {
      this._entitiesToRemove.push(entityId);
    }
    for (const entityId of this._entitiesToRemove) {
      const mesh = this.manager.getComponentDataForEntity("Mesh", entityId).mesh;
      mesh.parent.remove(mesh);
      this.manager.removeEntity(entityId);
    }
  }
}

class ResourceProcessor extends Processor {
  constructor(manager) {
    super(manager);
  }
  update(delta) {
    let power = 0;
    const entities = this.manager.getComponentsData("Collector");
    for (const entityId in entities) {
      power += entities[entityId].rate * delta;
    }
    APP.updatePower(power);
  }
}

class PlacementProcessor extends Processor {
  constructor(manager, resourceProcessor) {
    super(manager);
    this.resourceProcessor = resourceProcessor;
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
      this.manager.getComponentDataForEntity("Mesh", item).mesh.position.copy(scene.placeholder.position);
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
      const entities = this.manager.getComponentsData("Mesh");
      x = Math.round(intersection.point.x);
      z = Math.round(intersection.point.z);
      for (const entityId in entities) {
        entities[entityId].mesh.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!this.manager.entityHasComponent(entityId, "Projectile") && x === ex && z === ez) {
          this.placementValid = false;
        }
      }
    } else {
      this.placementValid = false;
    }
    scene.updatePlacement(APP.deviceSupportsHover && this.placementValid, x, z);
  }
}

class TurretProcessor extends Processor {
  update(delta) {
    const entities = this.manager.getComponentsData("Turret");
    for (const entityId in entities) {
      entities[entityId].timeUntilFire -= delta;
      if (entities[entityId].timeUntilFire <= 0) {
        const projectile = createProjectile();
        const projectileMesh = this.manager.getComponentDataForEntity("Mesh", projectile);
        this.manager.getComponentDataForEntity("Mesh", entityId).mesh.getWorldPosition(projectileMesh.mesh.position);
        entities[entityId].timeUntilFire = 1 / entities[entityId].firingRate;
      }
    }
  }
}

class VehicleProcessor extends Processor {
  update(delta) {
    const entities = this.manager.getComponentsData("Vehicle");
    for (const entityId in entities) {
      const { position } = this.manager.getComponentDataForEntity("Mesh", entityId).mesh;
      if (Math.abs(position.x) >= 2) {
        position.x = Math.sign(position.x) * 2;
        entities[entityId].speed *= -1;
      }
      position.x += entities[entityId].speed * delta;
    }
  }
}

class EnemyWaveProcessor extends Processor {
  constructor(manager) {
    super(manager);
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
      const mesh = this.manager.getComponentDataForEntity("Mesh", enemy).mesh;
      mesh.position.x = lane;
      occupied[lane] = occupied[lane] === undefined ? 0 : occupied[lane] - 2;
      mesh.position.z = occupied[lane] - 5;
    }
  }
}

class GameOverProcessor extends Processor {
  constructor(manager, enemyWaveProcessor) {
    super(manager);
    this.enemyWaveProcessor = enemyWaveProcessor;
    this.tempBox = new THREE.Box3();
    this.collider = new THREE.Box3();
    this.collider.setFromCenterAndSize(new THREE.Vector3(0, 0, 6), new THREE.Vector3(5, 1, 1));
  }
  update() {
    const entities = this.manager.getComponentsData("Enemy");
    if (!entities) return;
    if (!Object.keys(entities).length && !this.enemyWaveProcessor.currentWave) {
      scene.stop();
      APP.setInfo("You Win!");
      return;
    }
    for (const entityId in entities) {
      scene.updateBox(
        this.tempBox,
        this.manager.getComponentDataForEntity("Collider", entityId).collider,
        this.manager.getComponentDataForEntity("Mesh", entityId).mesh.matrixWorld
      );
      if (this.tempBox.intersectsBox(this.collider)) {
        scene.stop();
        APP.setInfo("Game Over");
        break;
      }
    }
  }
}

manager.addProcessor(new GravityProcessor(manager));
manager.addProcessor(new VelocityProcessor(manager));
manager.addProcessor(new CollisionProcessor(manager));
manager.addProcessor(new ExplosiveProcessor(manager));
manager.addProcessor(new OnboardRemover(manager));
manager.addProcessor(new MeshRemover(manager));
const resourceProcessor = new ResourceProcessor(manager);
manager.addProcessor(resourceProcessor);
manager.addProcessor(new PlacementProcessor(manager, resourceProcessor));
manager.addProcessor(new TurretProcessor(manager));
manager.addProcessor(new VehicleProcessor(manager));
const enemyWaveProcessor = new EnemyWaveProcessor(manager);
manager.addProcessor(enemyWaveProcessor);
if (!APP.perfMode) {
  manager.addProcessor(new GameOverProcessor(manager, enemyWaveProcessor));
}

//
// Entity factories
//

function createEnemy() {
  const entityId = manager.createEntity(["Enemy", "Mesh", "Velocity", "Collider", "Explosive"]);
  const mesh = scene.createBox("green");
  manager.updateComponentDataForEntity("Mesh", entityId, { mesh });
  manager.updateComponentDataForEntity("Velocity", entityId, { z: 1.5 });
  manager.updateComponentDataForEntity("Collider", entityId, {
    collider: new THREE.Box3().setFromObject(mesh),
    offsetCollider: new THREE.Box3()
  });
  manager.updateComponentDataForEntity("Explosive", entityId, { destructible: false });
  scene.add(mesh);
  return entityId;
}

function createMine() {
  const entityId = manager.createEntity(["Mesh", "Collider", "Explosive"]);
  const mesh = scene.createBox("red");
  manager.updateComponentDataForEntity("Mesh", entityId, { mesh });
  manager.updateComponentDataForEntity("Collider", entityId, {
    collider: new THREE.Box3().setFromObject(mesh),
    offsetCollider: new THREE.Box3(),
    collides: "Enemy"
  });
  manager.updateComponentDataForEntity("Explosive", entityId);
  scene.add(mesh);
  return entityId;
}

function createProjectile() {
  const entityId = manager.createEntity(["Projectile", "Mesh", "Velocity", "Gravity", "Explosive", "Collider"]);
  const mesh = scene.createBox("red", 0.2);
  manager.updateComponentDataForEntity("Mesh", entityId, { mesh });
  manager.updateComponentDataForEntity("Collider", entityId, {
    collider: new THREE.Box3().setFromObject(mesh),
    offsetCollider: new THREE.Box3(),
    collides: "Enemy"
  });
  manager.updateComponentDataForEntity("Explosive", entityId);
  manager.updateComponentDataForEntity("Velocity", entityId, { z: -20.0 });
  scene.add(mesh);
  return entityId;
}

function createTurret(withCollider = true, firingRate) {
  const entityId = manager.createEntity(["Turret", "Mesh"]);
  if (firingRate) {
    manager.updateComponentDataForEntity("Turret", entityId, { firingRate: firingRate, timeUntilFire: 1 / firingRate });
  }
  const mesh = scene.createBox("blue");
  manager.updateComponentDataForEntity("Mesh", entityId, { mesh });
  if (withCollider) {
    manager.addComponentsToEntity(["Collider"], entityId);
    manager.updateComponentDataForEntity("Collider", entityId, {
      collider: new THREE.Box3().setFromObject(mesh),
      offsetCollider: new THREE.Box3(),
      collides: "Enemy"
    });
  }
  scene.add(mesh);
  return entityId;
}

function createTurretVehicle() {
  const entityId = manager.createEntity(["Vehicle", "Mesh", "Collider"]);
  const mesh = scene.createBox("yellow", 0.9);
  manager.updateComponentDataForEntity("Mesh", entityId, { mesh });
  manager.updateComponentDataForEntity("Collider", entityId, {
    collider: new THREE.Box3().setFromObject(mesh),
    offsetCollider: new THREE.Box3(),
    collides: "Enemy"
  });
  const turret = createTurret(false, 1);
  const turretMesh = manager.getComponentDataForEntity("Mesh", turret).mesh;
  turretMesh.position.y = 0.5;
  mesh.add(turretMesh);
  manager.updateComponentDataForEntity("Vehicle", entityId, { onboard: turret });
  scene.add(mesh);
  return entityId;
}

function createCollector() {
  const entityId = manager.createEntity(["Collector", "Mesh", "Collider"]);
  const mesh = scene.createBox("orange");
  manager.updateComponentDataForEntity("Mesh", entityId, { mesh });
  manager.updateComponentDataForEntity("Collider", entityId, {
    collider: new THREE.Box3().setFromObject(mesh),
    offsetCollider: new THREE.Box3(),
    collides: "Enemy"
  });
  scene.add(mesh);
  return entityId;
}

if (APP.perfMode) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const turret = createTurretVehicle();
      manager.getComponentDataForEntity("Mesh", turret).mesh.position.set(i - 2, 0, j + 2);
    }
  }
}
