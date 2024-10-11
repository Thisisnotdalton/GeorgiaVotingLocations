import Map from "./map_utils.js";
import DataSet from "./dataset.js";

class ScenarioSelector {
    #data = null;
    #selectedCounty = null;
    #selectedScenarioName = null;
    #selectedDate = null;

    constructor() {
        this.#data = new DataSet();
    }

    async initialize() {
        this.#selectedCounty = (await this.#data.getCounties()).normalize();
        this.#selectedScenarioName = (await this.#data.getScenarioNames()).normalize();
        this.#selectedDate = (await this.#data.getScenarioDates(this.#selectedScenarioName)).normalize();
    }
}

export async function Start() {
    let map = new Map(
        "map",
        'https://demotiles.maplibre.org/style.json',
        [0, 0],
        1);
    let scenarios = new ScenarioSelector();
    await scenarios.initialize();
}

window.onload = async function () {
    await Start();
}