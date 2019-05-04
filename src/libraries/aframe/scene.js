const AFRAME = require("aframe");
const THREE = AFRAME.THREE;

const scene = document.createElement("a-scene");
scene.setAttribute("background", "color: black");
scene.setAttribute("debug", "");
scene.style.position = "absolute";
const camera = document.createElement("a-entity");
camera.setAttribute("camera", "");
camera.setAttribute("position", "15 15 15");
camera.setAttribute("rotation", "-20 52 -5");
scene.append(camera);

const floor = document.createElement("a-plane");
floor.id = "floor";
floor.setAttribute("width", 5);
floor.setAttribute("height", 10);
floor.object3D.position.set(0, -0.51, 0.5);
floor.object3D.rotation.x = -Math.PI / 2;
scene.append(floor);
const frontGrid = document.createElement("a-entity");
frontGrid.object3D.position.set(0, -0.5, 3);
frontGrid.setAttribute("gridhelper", { divisions: 5 });
scene.append(frontGrid);
const backGrid = document.createElement("a-entity");
backGrid.object3D.position.set(0, -0.5, -2);
backGrid.setAttribute("gridhelper", { divisions: 5 });
scene.append(backGrid);

const raycaster = document.createElement("a-entity");
raycaster.setAttribute("raycaster", { objects: "#floor" });
raycaster.setAttribute("cursor", { rayOrigin: "mouse" });
scene.append(raycaster);

const placeholder = document.createElement("a-entity");
placeholder.setAttribute("geometry", { primitive: "box", width: 1, height: 1, depth: 1 });
placeholder.setAttribute("material", { color: "darkred" });
scene.append(placeholder);

document.addEventListener("DOMContentLoaded", () => document.body.insertBefore(scene, document.body.children[0]));

export const ascene = {
  add: entity => {
    scene.append(entity);
  },
  placeholder,
  getIntersection: () => {
    return raycaster.components.raycaster.getIntersection(floor);
  },
  updatePlacement: (placementValid, x, z) => {
    placeholder.setAttribute("visible", placementValid);
    placeholder.object3D.position.set(x, 0, z);
  },
  updateBox: (() => {
    const tempMatrix = new THREE.Matrix4();
    return (box, collider, matrix) => {
      tempMatrix.copyPosition(matrix);
      box.copy(collider);
      box.min.applyMatrix4(tempMatrix);
      box.max.applyMatrix4(tempMatrix);
    };
  })(),
  stop: () => {
    scene.pause();
  }
};
