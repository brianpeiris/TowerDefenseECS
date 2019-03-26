//
// App Boilerplate
//

const THREE = require("three");
const ecs = require("js13k-ecs/src/ecs").default;
const App = require("../../common/app.js");

const APP = new App(update);

const createBox = (() => {
  const boxGeometry = new THREE.BoxBufferGeometry(1, 1, 1);
  const materials = {};
  return (color, size = 0.8) => {
    if (!materials[color]) {
      materials[color] = new THREE.MeshStandardMaterial({ color });
    }
    const mesh = new THREE.Mesh(boxGeometry, materials[color]);
    mesh.scale.setScalar(size);
    return mesh;
  };
})();

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

function Collider(collider) {
  this.collider = collider;
  this.collided = null;
}

function Explosive(explodes = null, destructible = true) {
  this.destructible = destructible;
  this.explodes = explodes;
}

function ToRemove() {}

function Enemy() {}

function Projectile() {}

function Turret() {
  this.firingRate = 1 / 2;
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
  update(delta) {
    ecs.select(Velocity, Gravity).iterate(entity => {
      entity.get(Velocity).y += entity.get(Gravity).force * delta;
    });
  }
}

class VelocitySystem {
  update(delta) {
    ecs.select(Velocity, Mesh).iterate(entity => {
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
    this.tempMatrix = new THREE.Matrix4();
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  }
  update() {
    const entities = ecs.select(Mesh, Collider);
    entities.iterate(entity => {
      entity.get(Collider).collided = null;
    });

    let e1n = entities.list;
    while (e1n) {
      const e1 = e1n.entity;
      const e1c = e1.get(Collider);
      const e1m = e1.get(Mesh);
      e1m.mesh.updateMatrixWorld();
      this.tempMatrix.copyPosition(e1m.mesh.matrixWorld);
      this.tempBox1.copy(e1c.collider);
      this.tempBox1.min.applyMatrix4(this.tempMatrix);
      this.tempBox1.max.applyMatrix4(this.tempMatrix);
      let e2n = e1n.next;
      while (e2n) {
        const e2 = e2n.entity;
        const e2c = e2.get(Collider);
        const e2m = e2.get(Mesh);
        e2m.mesh.updateMatrixWorld();
        this.tempMatrix.copyPosition(e2m.mesh.matrixWorld);
        this.tempBox2.copy(e2c.collider);
        this.tempBox2.min.applyMatrix4(this.tempMatrix);
        this.tempBox2.max.applyMatrix4(this.tempMatrix);
        if (this.tempBox1.intersectsBox(this.tempBox2)) {
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
  update() {
    ecs.select(Mesh, Explosive, Collider).iterate(entity => {
      const collider = entity.get(Collider);
      const { collided } = collider;
      const explosiveBelowFloor = entity.get(Mesh).mesh.position.y <= -0.5;
      const explosive = entity.get(Explosive);
      const shouldExplodeCollided = collided && (explosive.explodes === null || collided.has(explosive.explodes));
      if (explosiveBelowFloor || (shouldExplodeCollided && explosive.destructible)) {
        entity.add(new ToRemove());
      }
      if (shouldExplodeCollided) {
        collided.add(new ToRemove());
      }
    });
  }
}

class OnboardRemover {
  update() {
    ecs.select(Vehicle, ToRemove).iterate(entity => {
      entity.get(Vehicle).onboard.add(new ToRemove());
    });
  }
}

class MeshRemover {
  constructor() {
    this._entitiesToRemove = [];
  }
  update() {
    this._entitiesToRemove.length = 0;
    ecs.select(Mesh, ToRemove).iterate(entity => {
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
    this.power = 150;
    this.items = [
      { name: "mine", cost: 50 },
      { name: "turret", cost: 100 },
      { name: "vehicle", cost: 150 },
      { name: "collector", cost: 150 }
    ];
    this.itemsByName = {};
    for (const item of this.items) {
      const { name, cost } = item;
      this.itemsByName[name] = item;
      const itemEl = document.importNode(APP.ui.itemTemplate.content, true);

      const input = itemEl.querySelector("input");
      item.input = input;
      input.id = name;
      input.value = name;
      input.addEventListener("change", () => {
        if (input.checked) this.currentItem = item;
      });

      const label = itemEl.querySelector("label");
      label.setAttribute("for", name);
      label.textContent = `${name}\n${cost}`;
      label.addEventListener("mousedown", () => {
        if (input.disabled) return;
        input.checked = true;
        this.currentItem = item;
      });
      APP.ui.itemSelection.append(itemEl);
    }
    this.items[0].input.checked = true;
    this.currentItem = this.items[0];
  }
  update(delta) {
    ecs.select(Collector).iterate(entity => {
      this.power += entity.get(Collector).rate * delta;
    });
    APP.ui.power.textContent = this.power.toFixed();
    for (const item of this.items) {
      item.input.disabled = this.power < item.cost;
    }
  }
}

class PlacementSystem {
  constructor(resourceSystem) {
    this.resourceSystem = resourceSystem;
    this.mouse = null;
    this.intersections = [];
    this.raycaster = new THREE.Raycaster();
    this.placeholder = createBox("darkred", 1);
    this.placeholder.visible = false;
    this.worldPosition = new THREE.Vector3();
    APP.scene.add(this.placeholder);
    document.addEventListener("mousemove", e => {
      if (!this.mouse) this.mouse = new THREE.Vector2();
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = ((window.innerHeight - e.clientY) / window.innerHeight) * 2 - 1;
    });
    document.addEventListener("click", () => {
      if (!this.placeholder.visible) return;
      const itemName = this.resourceSystem.currentItem.name;
      let item;
      switch (itemName) {
        case "mine":
          item = createMine();
          break;
        case "turret":
          item = createTurret();
          break;
        case "vehicle":
          item = createTurretVehicle();
          break;
        case "collector":
          item = createCollector();
          break;
      }
      this.resourceSystem.power -= this.resourceSystem.itemsByName[itemName].cost;
      item.get(Mesh).mesh.position.copy(this.placeholder.position);
    });
  }
  update() {
    if (!this.mouse) return;
    this.raycaster.setFromCamera(this.mouse, APP.camera);
    this.intersections.length = 0;
    this.raycaster.intersectObject(floor, false, this.intersections);
    if (this.intersections.length) {
      const entities = ecs.select(Mesh);
      const [intersection] = this.intersections;
      const [x, z] = [Math.round(intersection.point.x), Math.round(intersection.point.z)];
      this.placeholder.visible = !this.resourceSystem.currentItem.input.disabled;
      entities.iterate(entity => {
        entity.get(Mesh).mesh.getWorldPosition(this.worldPosition);
        const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!entity.has(Projectile) && x === ex && z === ez) {
          this.placeholder.visible = false;
        }
      });
      this.placeholder.position.set(x, 0, z);
    } else {
      this.placeholder.visible = false;
    }
  }
}

class TurretSystem {
  update(delta) {
    ecs.select(Turret, Mesh).iterate(entity => {
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
  update(delta) {
    ecs.select(Vehicle, Mesh).iterate(entity => {
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
    if (APP.perfMode) {
      this.waves = [{ time: 0, enemies: 500 }];
    } else {
      this.waves = [
        { time: 10, enemies: 5 },
        { time: 30, enemies: 10 },
        { time: 60, enemies: 20 },
        { time: 90, enemies: 50 },
        { time: 120, enemies: 100 }
      ];
    }
    this.nextWaveIndex = 0;
    this.nextWave = this.waves[0];
    this.elapsed = 0;
  }
  update(delta) {
    this.elapsed += delta;
    this.nextWave = this.waves[this.nextWaveIndex];
    if (!this.nextWave) {
      APP.ui.info.textContent = "Final Wave!";
      return;
    }
    const nextWaveTime = this.nextWave.time;
    APP.ui.info.textContent = `Next wave in ${Math.abs(nextWaveTime - this.elapsed).toFixed(1)}`;
    if (this.elapsed < nextWaveTime) return;
    const occupied = {};
    for (let i = 0; i < this.nextWave.enemies; i++) {
      const enemy = createEnemy();
      const lane = THREE.Math.randInt(-2, 2);
      enemy.get(Mesh).mesh.position.x = lane;
      if (occupied[lane] === undefined) {
        occupied[lane] = 0;
      } else {
        occupied[lane] -= 2;
        enemy.get(Mesh).mesh.position.z = occupied[lane];
      }
      enemy.get(Mesh).mesh.position.z -= 5;
    }
    this.nextWaveIndex++;
  }
}

class GameOverSystem {
  constructor(enemyWaveSystem) {
    this.enemyWaveSystem = enemyWaveSystem;
    this.tempMatrix = new THREE.Matrix4();
    this.tempBox1 = new THREE.Box3();
    this.collider = new THREE.Box3();
    this.collider.setFromCenterAndSize(new THREE.Vector3(0, 0, 6), new THREE.Vector3(5, 1, 1));
  }
  update() {
    const entities = ecs.select(Enemy);
    if (!entities.length && !this.enemyWaveSystem.nextWave) {
      APP.playing = false;
      APP.ui.info.textContent = "You Win!";
      return;
    }
    let node = entities.list;
    while (node) {
      const { entity } = node;
      this.tempMatrix.copyPosition(entity.get(Mesh).mesh.matrixWorld);
      this.tempBox1.copy(entity.get(Collider).collider);
      this.tempBox1.min.applyMatrix4(this.tempMatrix);
      this.tempBox1.max.applyMatrix4(this.tempMatrix);
      if (this.tempBox1.intersectsBox(this.collider)) {
        APP.playing = false;
        APP.ui.info.textContent = "Game Over";
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
const resourceSystem = new ResourceSystem();
systems.push(resourceSystem);
systems.push(new PlacementSystem(resourceSystem));
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

function createFloor() {
  const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(5, 10), new THREE.MeshStandardMaterial());
  floor.position.y = -0.51;
  floor.position.z = 0.5;
  floor.rotation.x = -Math.PI / 2;
  APP.scene.add(floor);
  const frontGrid = new THREE.GridHelper(5, 5);
  frontGrid.position.z = 3;
  frontGrid.position.y = -0.5;
  APP.scene.add(frontGrid);
  const backGrid = new THREE.GridHelper(5, 5);
  backGrid.position.z = -2;
  backGrid.position.y = -0.5;
  APP.scene.add(backGrid);
  return floor;
}
const floor = createFloor();

function createEnemy() {
  const entity = ecs.create();
  entity.add(new Enemy());
  const mesh = new Mesh(createBox("green"));
  entity.add(mesh);
  entity.add(new Velocity(0, 0, 1.5));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh.mesh)));
  entity.add(new Explosive(null, false));
  APP.scene.add(mesh.mesh);
  return entity;
}

function createMine() {
  const entity = ecs.create();
  const mesh = createBox("red");
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh)));
  entity.add(new Explosive(Enemy));
  APP.scene.add(mesh);
  return entity;
}

function createProjectile() {
  const entity = ecs.create();
  const mesh = createBox("red", 0.2);
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh)));
  entity.add(new Explosive(Enemy));
  entity.add(new Gravity());
  entity.add(new Velocity(0, 0, -20));
  APP.scene.add(mesh);
  return entity;
}

function createTurret(withCollider = true) {
  const entity = ecs.create();
  entity.add(new Turret());
  const mesh = createBox("blue");
  entity.add(new Mesh(mesh));
  if (withCollider) {
    entity.add(new Collider(new THREE.Box3().setFromObject(mesh)));
  }
  APP.scene.add(mesh);
  return entity;
}

function createTurretVehicle() {
  const entity = ecs.create();
  const turret = createTurret(false);
  const turretMesh = turret.get(Mesh).mesh;
  turretMesh.position.y = 0.5;
  entity.add(new Vehicle(turret));
  const mesh = createBox("yellow", 0.9);
  mesh.add(turretMesh);
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh)));
  APP.scene.add(mesh);
  return entity;
}

function createCollector() {
  const entity = ecs.create();
  entity.add(new Collector());
  const mesh = createBox("orange");
  entity.add(new Mesh(mesh));
  entity.add(new Collider(new THREE.Box3().setFromObject(mesh)));
  APP.scene.add(mesh);
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
