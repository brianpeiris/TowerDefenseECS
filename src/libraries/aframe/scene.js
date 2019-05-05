const AFRAME = require("aframe");
const THREE = AFRAME.THREE;
require("aframe-gridhelper-component");
const rStats = require("rstatsjs/src/rStats.js");

class Scene {
  constructor() {
    this._scene = document.createElement("a-scene");
    this._scene.setAttribute("renderer", "antialias: true");
    this._scene.setAttribute("background", "color: black");
    this._scene.setAttribute("vr-mode-ui", "enabled: false");
    this._scene.style.position = "absolute";

    const light = document.createElement("a-entity");
    light.setAttribute("light", "type: directional");
    light.setAttribute("position", "0.5 1 -1");
    this._scene.append(light);
    const ambient = document.createElement("a-entity");
    ambient.setAttribute("light", "type: ambient; intensity: 0.5;");
    this._scene.append(ambient);

    const camera = document.createElement("a-entity");
    camera.setAttribute("camera", "fov: 50");
    camera.setAttribute("position", "15 15 15");
    camera.setAttribute("rotation", "-25 45 -5");
    this._scene.append(camera);

    this._raycaster = document.createElement("a-entity");
    this._raycaster.setAttribute("raycaster", { objects: "#floor" });
    this._raycaster.setAttribute("cursor", { rayOrigin: "mouse" });
    this._scene.append(this._raycaster);

    this._floor = this._createFloor();

    this.placeholder = document.createElement("a-entity");
    this.placeholder.setAttribute("geometry", { primitive: "box", width: 1, height: 1, depth: 1 });
    this.placeholder.setAttribute("material", { color: "darkred" });
    this._scene.append(this.placeholder);

    let stats;
    AFRAME.registerComponent("rstats", {
      tick: () => {
        stats("frame").tick();
        stats().update();
      }
    });
    this._scene.setAttribute("rstats", "");

    document.addEventListener("DOMContentLoaded", () => {
      stats = new rStats({ values: { frame: { average: true } } });
      stats().element.className = "tde-rs-base";
      document.body.insertBefore(this._scene, document.body.children[0]);
    });
  }
  _createFloor = () => {
    const floor = document.createElement("a-plane");
    floor.id = "floor";
    floor.setAttribute("width", 5);
    floor.setAttribute("height", 10);
    floor.object3D.position.set(0, -0.51, 0.5);
    floor.object3D.rotation.x = -Math.PI / 2;
    this._scene.append(floor);
    const frontGrid = document.createElement("a-entity");
    frontGrid.object3D.position.set(0, -0.5, 3);
    frontGrid.setAttribute("gridhelper", { divisions: 5, colorGrid: 0x888888 });
    this._scene.append(frontGrid);
    const backGrid = document.createElement("a-entity");
    backGrid.object3D.position.set(0, -0.5, -2);
    backGrid.setAttribute("gridhelper", { divisions: 5, colorGrid: 0x888888 });
    this._scene.append(backGrid);
    return floor;
  };
  add = entity => {
    this._scene.append(entity);
  };
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
    return this._raycaster.components.raycaster.getIntersection(this._floor);
  };
  updatePlacement = (placementValid, x, z) => {
    this.placeholder.setAttribute("visible", placementValid);
    this.placeholder.object3D.position.set(x, 0, z);
  };
  stop = () => {
    this._scene.pause();
    this._scene.renderer.setAnimationLoop(null);
  };
}

module.exports = Scene;
