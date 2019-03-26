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
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(this.scene.position);

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
      itemTemplate: document.getElementById("itemTemplate"),
      itemSelection: document.getElementById("itemSelection"),
      power: document.getElementById("power")
    };

    this.perfMode = location.search.includes("perf");
  }
  _setSize() {
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
module.exports = App;
