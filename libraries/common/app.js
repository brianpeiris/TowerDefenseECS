const Stats = require("stats.js");
const THREE = require("three");

class App {
  constructor(update) {
    this.scene = new THREE.Scene();
    const light = new THREE.DirectionalLight();
    light.position.x = 0.5;
    light.position.z = -1;
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight());

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    document.body.append(this._renderer.domElement);
    this.camera = new THREE.PerspectiveCamera();
    this.camera.position.set(15, 15, 15);
    this.camera.lookAt(new THREE.Vector3(0, 5, 0));

    this._setSize();
    window.addEventListener("resize", this._setSize.bind(this));

    const stats = new Stats();
    stats.showPanel(1);
    stats.dom.style.left = "auto";
    stats.dom.style.right = 0;
    document.body.append(stats.dom);
    const clock = new THREE.Clock();
    this.playing = true;
    this._renderer.setAnimationLoop(() => {
      if (!this.playing) return;
      stats.begin();
      update(clock.getDelta(), clock.elapsedTime);
      this._renderer.render(this.scene, this.camera);
      stats.end();
    });

    this.ui = {
      info: document.getElementById("info"),
      itemSelection: document.getElementById("itemSelection"),
      power: document.getElementById("power")
    };

    this.device = {
      supportsHover: !window.TouchEvent
    };

    this.perfMode = location.search.includes("perf");

    this.items = [
      { name: "mine", cost: 50 },
      { name: "turret", cost: 100 },
      { name: "vehicle", cost: 150 },
      { name: "collector", cost: 150 }
    ];
    this.itemsByName = {};
    const itemTemplate = document.getElementById("itemTemplate");
    for (const item of this.items) {
      const { name, cost } = item;
      this.itemsByName[name] = item;
      const itemEl = document.importNode(itemTemplate.content, true);

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
      label.addEventListener("mousedown", this._selectItem.bind(this, input, item));
      label.addEventListener("touchstart", this._selectItem.bind(this, input, item));
      label.addEventListener("touchend", e => e.stopPropagation());
      this.ui.itemSelection.append(itemEl);
    }
    this.items[0].input.checked = true;
    this.currentItem = this.items[0];

    this.floor = this._createFloor();
    this.raycaster = new THREE.Raycaster();
    this.intersections = [];
    this.mouse = null;
    document.addEventListener("mousemove", e => {
      if (!this.mouse) this.mouse = new THREE.Vector2();
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = ((window.innerHeight - e.clientY) / window.innerHeight) * 2 - 1;
    });

    this.placeholder = this.createBox("darkred", 1);
    this.placeholder.visible = this.device.supportsHover;
    this.scene.add(this.placeholder);
    this.onCreate = () => {};
    document.addEventListener("mouseup", this.createItem.bind(this));
    document.addEventListener("touchend", ({changedTouches}) => this.createItem(changedTouches[0]));

    if (this.perfMode) {
      this.waves = [
        { time: 0, enemies: 0 },
        { time: 0, enemies: 500 }
      ];
    } else {
      this.waves = [
        { time: 0, enemies: 0 },
        { time: 10, enemies: 5 },
        { time: 30, enemies: 10 },
        { time: 60, enemies: 20 },
        { time: 90, enemies: 50 },
        { time: 120, enemies: 100 }
      ];
    }
    this.nextWaveIndex = 0;
  }

  createItem(e) {
    if (!this.mouse) this.mouse = new THREE.Vector2();
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = ((window.innerHeight - e.clientY) / window.innerHeight) * 2 - 1;
    const itemName = this.currentItem.name;
    this.onCreate(itemName, this.itemsByName[itemName].cost);
  }

  getCurrentWave(elapsed) {
    const nextWave = this.waves[this.nextWaveIndex];

    const nextWaveTime = nextWave && nextWave.time;

    if (nextWave) {
      this.ui.info.textContent = `Next wave in ${Math.abs(nextWaveTime - elapsed).toFixed(1)}`;
    } else {
      this.ui.info.textContent = "Final Wave!";
    }

    const currentWave = this.waves[this.nextWaveIndex - 1];
    if (elapsed < nextWaveTime) return currentWave;

    this.nextWaveIndex++;
    return nextWave;
  }

  updatePlacement(placementValid, x, z) {
    this.placementValid = placementValid;
    this.placeholder.visible = this.device.supportsHover && placementValid;
    this.placeholder.position.set(x, 0, z);
  }

  createBox = (() => {
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

  getIntersection() {
    if (!this.mouse) return null;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.intersections.length = 0;
    this.raycaster.intersectObject(this.floor, false, this.intersections);
    if (this.intersections.length) {
      return this.intersections[0];
    } else {
      return null;
    }
  }

  updatePower(power) {
    this.ui.power.textContent = power.toFixed();
    for (const item of this.items) {
      item.input.disabled = power < item.cost;
    }
  }

  _selectItem(input, item) {
    if (input.disabled) return;
    input.checked = true;
    this.currentItem = item;
  }

  _createFloor() {
    const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(5, 10), new THREE.MeshStandardMaterial());
    floor.position.y = -0.51;
    floor.position.z = 0.5;
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const frontGrid = new THREE.GridHelper(5, 5);
    frontGrid.position.z = 3;
    frontGrid.position.y = -0.5;
    this.scene.add(frontGrid);
    const backGrid = new THREE.GridHelper(5, 5);
    backGrid.position.z = -2;
    backGrid.position.y = -0.5;
    this.scene.add(backGrid);
    return floor;
  }

  _setSize() {
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
module.exports = App;
