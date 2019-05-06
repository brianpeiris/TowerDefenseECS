const BABYLON = require("@babylonjs/core");
const rStats = require("rstatsjs/src/rStats.js");

class Scene {
  constructor(update) {
    const canvas = document.createElement("canvas");
    const engine = new BABYLON.Engine(canvas, true);
    this._scene = new BABYLON.Scene(engine);

    const camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(-15, 15, 15), this._scene);
    camera.fov = 0.872;
    camera.setTarget(new BABYLON.Vector3(0, 5, 0));

    new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), this._scene);

    const floor = BABYLON.MeshBuilder.CreateGround("floor", { height: 10, width: 5 }, this._scene);
    floor.position.set(0, -0.51, 0.5);

    let stats;
    this._playing = false;
    let elapsed = 0;
    engine.runRenderLoop(() => {
      if (!this._playing) return;
      const delta = engine.getDeltaTime() / 1000;
      elapsed += delta;
      update(delta, elapsed);
      this._scene.render();
      stats("frame").tick();
      stats().update();
    });

    document.addEventListener("DOMContentLoaded", () => {
      stats = new rStats({ values: { frame: { caption: "(ms)", average: true } } });
      stats().element.className = "tde-rs-base";
      document.body.appendChild(canvas);
      engine.resize();
      this._playing = true;
    });

    window.addEventListener("resize", () => engine.resize());
  }
  createBox = (() => {
    const materials = {};
    const colors = {
      green: new BABYLON.Color3(0, 1, 0),
      red: new BABYLON.Color3(1, 0, 0),
      blue: new BABYLON.Color3(0, 0, 1),
      yellow: new BABYLON.Color3(1, 1, 0),
      orange: new BABYLON.Color3(1, 0.65, 0),
      darkred: new BABYLON.Color3(0.55, 0, 0)
    };
    return (color, size = 0.8) => {
      if (!materials[color]) {
        const material = new BABYLON.StandardMaterial("boxMaterial", this._scene);
        material.diffuseColor = colors[color];
        materials[color] = material;
      }
      const box = BABYLON.MeshBuilder.CreateBox("box", { size }, this._scene);
      box.material = materials[color];
      return box;
    };
  })();
  add = () => {};
  remove = mesh => {
    this._scene.removeMesh(mesh);
  };
}
module.exports = Scene;
