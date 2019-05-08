class App {
  constructor() {
    document.addEventListener("touchstart", () => {
      this.deviceSupportsHover = false;
    });

    this.power = 150;

    document.addEventListener("DOMContentLoaded", () => {
      this.ui = {
        info: document.getElementById("info"),
        itemSelection: document.getElementById("itemSelection"),
        power: document.getElementById("power"),
        continue: document.getElementById("continue")
      };
      this._generateItemsUI();
      this.items[0].input.checked = true;
      this.updatePower(0);
      if (this.perfMode) {
        this.ui.info.textContent =
          "Perf mode runs at a fixed time step, for a fixed number of frames, with 2000 enemy entities";
        this.ui.info.style.fontSize = "10pt";
        if (!location.search.includes("continue")){ 
          this.ui.continue.style.display = "inline";
          this.ui.continue.href = "/" + location.search + "&continue";
        }
      }
    });

    this.items = [
      { name: "mine", cost: 50 },
      { name: "turret", cost: 100 },
      { name: "vehicle", cost: 150 },
      { name: "collector", cost: 150 }
    ];
    this.itemsByName = {};
    this.currentItem = this.items[0];

    this.deviceSupportsHover = true;
    this.onCreate = () => {};
    document.addEventListener("mouseup", e => {
      if (e.target.nodeName !== "CANVAS") return;
      this._createItem(e);
    });
    document.addEventListener("touchend", ({ target, changedTouches }) => {
      if (target.nodeName !== "CANVAS") return;
      this._createItem(changedTouches[0]);
    });

    this.PERF_ENEMIES = 2000;
    this.perfMode = location.search.includes("perf");
    if (this.perfMode) {
      this.waves = [{ time: 0, enemies: 0 }, { time: 0, enemies: this.PERF_ENEMIES }];
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

  getCurrentWave(elapsed) {
    const nextWave = this.waves[this.nextWaveIndex];

    const nextWaveTime = nextWave && nextWave.time;

    if (nextWave) {
      this.setInfo(`Next wave in ${Math.abs(nextWaveTime - elapsed).toFixed(1)}`);
    } else {
      this.setInfo("Final Wave!");
    }

    const currentWave = this.waves[this.nextWaveIndex - 1];
    if (elapsed < nextWaveTime) return currentWave;

    this.nextWaveIndex++;
    return nextWave;
  }

  updatePower(power) {
    this.power += power;
    this.ui.power.textContent = this.power.toFixed();
    for (const item of this.items) {
      if (item.input) item.input.disabled = this.power < item.cost;
    }
  }

  setInfo(info) {
    if (this.perfMode) return;
    this.ui.info.textContent = info;
  }

  _createItem(e) {
    const itemName = this.currentItem.name;
    this.onCreate(itemName, this.itemsByName[itemName].cost, e);
  }

  _selectItem(input, item) {
    if (input.disabled) return;
    input.checked = true;
    this.currentItem = item;
  }

  _generateItemsUI() {
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
  }
}
module.exports = App;
