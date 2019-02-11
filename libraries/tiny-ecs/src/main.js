

// THREE Boilerplate


const THREE = require('three');
const scene = new THREE.Scene();
const light = new THREE.DirectionalLight();
light.position.x = 0.5;
light.position.z = -1;
scene.add(light);
scene.add(new THREE.AmbientLight());

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera();
camera.position.set(10, 10, 10);
camera.lookAt(scene.position);

function setSize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
setSize();
window.addEventListener('resize', setSize);

const clock = new THREE.Clock();
let playing = true;
renderer.setAnimationLoop(() => {
  if (!playing) return;
  update(clock.getDelta(), clock.elapsedTime);
  renderer.render(scene, camera);
});

const createBox = (() => {
  const boxGeometry = new THREE.BoxBufferGeometry(1, 1, 1);
  const materials = {};
  return (color, size=0.8) => {
    if (!materials[color]) {
      materials[color] = new THREE.MeshStandardMaterial({color})
    }
    const mesh = new THREE.Mesh(boxGeometry, materials[color]);
    mesh.scale.setScalar(size);
    return mesh;
  }
})();

const info = document.getElementById("info");
const itemTemplate = document.getElementById("itemTemplate");
const itemSelection = document.getElementById("itemSelection");
const power = document.getElementById("power");


// ECS Setup


const EntityManager = require('tiny-ecs').EntityManager;
const entities = new EntityManager();


// Components


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
  this.collided = null;
}

function Explosive() {
  this.destructible = true;
  this.explodes = null;
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


// Systems


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
    this.tempMatrix = new THREE.Matrix4();
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
      e1.mesh.mesh.updateMatrixWorld();
      this.tempMatrix.copyPosition(e1.mesh.mesh.matrixWorld);
      this.tempBox1.copy(e1c.collider);
      this.tempBox1.min.applyMatrix4(this.tempMatrix);
      this.tempBox1.max.applyMatrix4(this.tempMatrix);
      for (let j = i + 1; j < entities.length; j++) {
        const e2 = entities[j];
        const e2c = e2.collider;
        e2.mesh.mesh.updateMatrixWorld();
        this.tempMatrix.copyPosition(e2.mesh.mesh.matrixWorld);
        this.tempBox2.copy(e2c.collider);
        this.tempBox2.min.applyMatrix4(this.tempMatrix);
        this.tempBox2.max.applyMatrix4(this.tempMatrix);
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
      const explosiveBelowFloor = entity.mesh.mesh.position.y <= -0.5
      const shouldExplodeCollided = collided && (collided.hasTag(entity.explosive.explodes) || entity.explosive.explodes === null);
      if (explosiveBelowFloor || (shouldExplodeCollided && entity.explosive.destructible)) {
        entity.addComponent(ToRemove);
      }
      if (shouldExplodeCollided) {
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

class EnemyWaveSystem extends System {
  constructor(entities) {
    super(entities);
    this.waves = [
      {time: 10, enemies: 5},
      {time: 30, enemies: 10},
      {time: 60, enemies: 20},
      {time: 90, enemies: 50},
      {time: 120, enemies: 100},
    ];
    this.nextWaveIndex = 0;
    this.nextWave = this.waves[0];
  }
  update(delta, elapsed) {
    this.nextWave = this.waves[this.nextWaveIndex];
    if (!this.nextWave) {
      info.textContent = 'Final Wave!'
      return;
    }
    const nextWaveTime = this.nextWave.time;
    info.textContent = `Next wave in ${Math.abs(nextWaveTime - elapsed).toFixed(1)}`
    if (elapsed < nextWaveTime) return;
    const occupied = {};
    for (let i = 0; i < this.nextWave.enemies; i++) {
      const enemy = createEnemy();
      const lane = THREE.Math.randInt(-2, 2);
      enemy.mesh.mesh.position.x = lane;
      if (occupied[lane] === undefined) {
        occupied[lane] = 0;
      } else {
        occupied[lane] -= 2;
        enemy.mesh.mesh.position.z = occupied[lane];
      }
      enemy.mesh.mesh.position.z -= 5;
    }
    this.nextWaveIndex++;
  }
}

class ResourceSystem extends System {
  constructor(entities) {
    super(entities);
    this.power = 150;
    this.items = [
      {name: 'mine', cost: 50},
      {name: 'turret', cost: 100},
      {name: 'vehicle', cost: 150},
      {name: 'collector', cost: 150},
    ];
    this.itemsByName = {};
    for (const item of this.items) {
      const {name, cost} = item;
      this.itemsByName[name] = item;
      const itemEl = document.importNode(itemTemplate.content, true);

      const input = itemEl.querySelector('input');
      item.input = input;
      input.id = name;
      input.value = name;
      input.addEventListener('change', () => {
        if (input.checked) this.currentItem = item;
      });

      const label = itemEl.querySelector('label');
      label.setAttribute('for', name);
      label.textContent = `${name}\n${cost}`;
      label.addEventListener('mousedown', () => {
        if (input.disabled) return;
        input.checked = true;
        this.currentItem = item;
      });
      itemSelection.append(itemEl);
    }
    this.items[0].input.checked = true;
    this.currentItem = this.items[0];
  }
  update(delta) {
    const entities = this.entities.queryComponents([Collector]);
    for (const entity of entities) {
      this.power += entity.collector.rate * delta;
    }
    power.textContent = this.power.toFixed();
    for (const item of this.items) {
      item.input.disabled = this.power < item.cost;
    }
  }
}

class PlacementSystem extends System {
  constructor(entities, resourceSystem) {
    super(entities);
    this.resourceSystem = resourceSystem;
    this.mouse = null;
    this.intersections = [];
    this.raycaster = new THREE.Raycaster();
    this.placeholder = createBox('darkred', 1);
    this.placeholder.visible = false;
    this.worldPosition = new THREE.Vector3();
    scene.add(this.placeholder);
    document.addEventListener('mousemove', e => {
      if (!this.mouse) this.mouse = new THREE.Vector2();
      this.mouse.x = e.clientX / window.innerWidth * 2 - 1;
      this.mouse.y = (window.innerHeight - e.clientY) / window.innerHeight * 2 - 1;
    });
    document.addEventListener('click', e => {
      if (!this.placeholder.visible) return;
      const itemName = this.resourceSystem.currentItem.name;
      let item;
      switch(itemName) {
        case 'mine':
          item = createMine();
          break;
        case 'turret':
          item = createTurret();
          break;
        case 'vehicle':
          item = createTurretVehicle();
          break;
        case 'collector':
          item = createCollector();
          break;
      }
      this.resourceSystem.power -= this.resourceSystem.itemsByName[itemName].cost;
      item.mesh.mesh.position.copy(this.placeholder.position);
    });
  }
  update() {
    if (!this.mouse) return;
    this.raycaster.setFromCamera(this.mouse, camera);
    this.intersections.length = 0;
    this.raycaster.intersectObject(floor, false, this.intersections);
    if (this.intersections.length) {
      const entities = this.entities.queryComponents([Mesh]);
      const [intersection] = this.intersections;
      const [x, z] = [Math.round(intersection.point.x), Math.round(intersection.point.z)];
      this.placeholder.visible = !this.resourceSystem.currentItem.input.disabled;
      for (const entity of entities) {
        entity.mesh.mesh.getWorldPosition(this.worldPosition);
        const [ex,  ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
        if (!entity.hasTag('projectile') && x === ex && z === ez) {
          this.placeholder.visible = false;
        }
      }
      this.placeholder.position.set(x, 0, z);
    } else {
      this.placeholder.visible = false;
    }
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

class GameOverSystem extends System {
  constructor(entities, enemyWaveSystem) {
    super(entities);
    this.enemyWaveSystem = enemyWaveSystem;
    this.tempMatrix = new THREE.Matrix4();
    this.tempBox1 = new THREE.Box3();
    this.collider = new THREE.Box3();
    this.collider.setFromCenterAndSize(
      new THREE.Vector3(0, 0, 6),
      new THREE.Vector3(5, 1, 1)
    );
  }
  update() {
    const entities = this.entities.queryTag('enemy');
    if (!entities.length && !this.enemyWaveSystem.nextWave) {
      playing = false;
      info.textContent = "You Win!";
      return;
    }
    for (const entity of entities) {
      this.tempMatrix.copyPosition(entity.mesh.mesh.matrixWorld);
      this.tempBox1.copy(entity.collider.collider);
      this.tempBox1.min.applyMatrix4(this.tempMatrix);
      this.tempBox1.max.applyMatrix4(this.tempMatrix);
      if (this.tempBox1.intersectsBox(this.collider)) {
        playing = false;
        info.textContent = "Game Over";
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
const enemyWaveSystem = new EnemyWaveSystem(entities);
systems.push(enemyWaveSystem);
const resourceSystem = new ResourceSystem(entities);
systems.push(resourceSystem);
systems.push(new PlacementSystem(entities, resourceSystem));
systems.push(new TurretSystem(entities));
systems.push(new VehicleSystem(entities));
systems.push(new GameOverSystem(entities, enemyWaveSystem));


// Entity factories


function createFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(5, 10),
    new THREE.MeshStandardMaterial()
  );
  floor.position.y = -0.51
  floor.position.z = 0.5;
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const frontGrid = new THREE.GridHelper(5, 5)
  frontGrid.position.z = 3;
  frontGrid.position.y = -0.5;
  scene.add(frontGrid);
  const backGrid = new THREE.GridHelper(5, 5)
  backGrid.position.z = -2;
  backGrid.position.y = -0.5;
  scene.add(backGrid);
  return floor;
}
const floor = createFloor();

function createEnemy() {
  const entity = entities.createEntity();
  entity.addTag('enemy');
  entity.addComponent(Mesh);
  entity.mesh.mesh = createBox('green');
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
  entity.mesh.mesh = createBox('red');
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  entity.explosive.explodes = 'enemy';
  scene.add(entity.mesh.mesh);
  return entity;
}

function createProjectile() {
  const entity = entities.createEntity();
  entity.addTag('projectile');
  entity.addComponent(Mesh);
  entity.mesh.mesh = createBox('red', 0.2);
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  entity.addComponent(Explosive);
  entity.explosive.explodes = 'enemy';
  entity.addComponent(Gravity);
  entity.addComponent(Velocity);
  entity.velocity.z = -20.0;
  scene.add(entity.mesh.mesh);
  return entity;
}

function createTurret(withCollider=true) {
  const entity = entities.createEntity();
  entity.addComponent(Turret);
  entity.addComponent(Mesh);
  entity.mesh.mesh = createBox('blue');
  if (withCollider) {
    entity.addComponent(Collider);
    entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  }
  scene.add(entity.mesh.mesh);
  return entity;
}

function createTurretVehicle() {
  const entity = entities.createEntity();
  entity.addComponent(Vehicle);
  entity.addComponent(Mesh);
  entity.mesh.mesh = createBox('yellow', 0.9);
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  const turret = createTurret(false);
  turret.firingRate = 1;
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
  entity.mesh.mesh = createBox('orange');
  entity.addComponent(Collider);
  entity.collider.collider = new THREE.Box3().setFromObject(entity.mesh.mesh);
  scene.add(entity.mesh.mesh);
  return entity;
}
