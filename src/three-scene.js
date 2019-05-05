const THREE = require("three");
const rStats = require("rstatsjs/src/rStats.js");

class Scene {
  constructor(update) {
    this._scene = new THREE.Scene();

    const light = new THREE.DirectionalLight();
    light.position.x = 0.5;
    light.position.z = -1;
    this._scene.add(light);
    this._scene.add(new THREE.AmbientLight());

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);

    this._camera = new THREE.PerspectiveCamera();
    this._camera.position.set(15, 15, 15);
    this._camera.lookAt(new THREE.Vector3(0, 5, 0));

    this._raycaster = new THREE.Raycaster();
    this._intersections = [];
    this._mouse = null;

    this._floor = this._createFloor();

    this.placeholder = this.createBox("darkred", 1);
    this.placeholder.visible = false;
    this._scene.add(this.placeholder);

    let stats;

    const clock = new THREE.Clock();
    this.delta = 0;
    this.elapsed = 0;
    this._playing = false;
    this._renderer.setAnimationLoop(() => {
      if (!this._playing) return;
      this.delta = clock.getDelta();
      this.elapsed = clock.elapsedTime;
      update(this.delta, this.elapsed);
      this._renderer.render(this._scene, this._camera);
      stats("frame").tick();
      stats().update();
    });

    this._setSize();
    document.addEventListener("mousemove", this._updateMouse.bind(this));
    document.addEventListener("DOMContentLoaded", () => {
      stats = new rStats({ values: { frame: { average: true } } });
      stats().element.className = "tde-rs-base";
      document.body.append(this._renderer.domElement);
      this._playing = true;
    });
    window.addEventListener("resize", this._setSize);
  }
  _createFloor = () => {
    const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(5, 10), new THREE.MeshStandardMaterial());
    floor.position.y = -0.51;
    floor.position.z = 0.5;
    floor.rotation.x = -Math.PI / 2;
    this._scene.add(floor);
    const frontGrid = new THREE.GridHelper(5, 5);
    frontGrid.position.z = 3;
    frontGrid.position.y = -0.5;
    this._scene.add(frontGrid);
    const backGrid = new THREE.GridHelper(5, 5);
    backGrid.position.z = -2;
    backGrid.position.y = -0.5;
    this._scene.add(backGrid);
    return floor;
  };
  _setSize = () => {
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
  };
  _updateMouse = e => {
    if (!this._mouse) this._mouse = new THREE.Vector2();
    this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this._mouse.y = ((window.innerHeight - e.clientY) / window.innerHeight) * 2 - 1;
  };
  add = obj => {
    this._scene.add(obj);
  };
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
  updateBox = (() => {
    const tempMatrix = new THREE.Matrix4();
    return (box, collider, matrix) => {
      tempMatrix.copyPosition(matrix);
      box.copy(collider);
      box.min.applyMatrix4(tempMatrix);
      box.max.applyMatrix4(tempMatrix);
    };
  })();
  getIntersection = () => {
    if (!this._mouse) return null;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    this._intersections.length = 0;
    this._raycaster.intersectObject(this._floor, false, this._intersections);
    if (this._intersections.length) {
      return this._intersections[0];
    } else {
      return null;
    }
  };
  updatePlacement = (placementValid, x, z) => {
    this.placeholder.visible = placementValid;
    this.placeholder.position.set(x, 0, z);
  };
  stop = () => {
    this._playing = false;
  };
}
module.exports = Scene;
