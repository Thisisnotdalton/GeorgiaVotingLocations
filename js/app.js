import Map from "./map_utils.js";
import DataSet from "./dataset.js";

class ScenarioSelector {
    #data = null;
    #selectedCounty = null;
    #selectedScenarioName = null;
    #selectedDate = null;
    #callbacks = null;

    constructor() {
        this.#data = new DataSet();
        this.#callbacks = [];
    }

    getSelection() {
        return {
            "county": this.#selectedCounty,
            "scenarioName": this.#selectedScenarioName,
            "scenarioDate": this.#selectedDate
        }
    }

    #selectionChangedCallback() {
        for (const callback of this.#callbacks) {
            callback(this);
        }
    }

    appendCallSelectionChangedCallback(callback) {
        this.#callbacks.push(callback);
    }

    async initialize() {
        this.#selectedCounty = (await this.#data.getCounties()).normalize();
        this.#selectedScenarioName = (await this.#data.getScenarioNames()).normalize();
        this.#selectedDate = (await this.#data.getScenarioDates(this.#selectedScenarioName)).normalize();
        this.#selectionChangedCallback();
    }

    selectCounty(countyName) {
        countyName = this.#data.getCounties().normalize(countyName);
        if (countyName !== this.#selectedCounty) {
            this.#selectedCounty = countyName;
            this.#selectionChangedCallback();
        }
    }

    selectScenarioName(scenarioName) {
        scenarioName = this.#data.getScenarioNames().normalize(scenarioName);
        if (scenarioName !== this.#selectedScenarioName) {
            this.#selectedScenarioName = scenarioName;
            this.selectScenarioDate(this.#selectedDate);
        }
    }

    selectDate(scenarioDate) {
        scenarioDate = this.#data.getScenarioDates(this.#selectedScenarioName).normalize(scenarioDate);
        if (scenarioDate !== this.#selectedDate) {
            this.#selectedDate = scenarioDate;
            this.#selectionChangedCallback();
        }
    }

    async getData(geojson = false) {
        return this.#data.getPollingPlaces(this.#selectedScenarioName, this.#selectedDate, this.#selectedCounty, geojson);
    }
}

export async function Start() {
    let map = new Map(
        "map",
        'https://demotiles.maplibre.org/style.json',
        [0, 0],
        1);

    let scenarios = new ScenarioSelector();

    async function onSelectionChanged(selector) {
        console.log(await selector.getData());
    }

    scenarios.appendCallSelectionChangedCallback(onSelectionChanged);
    await scenarios.initialize();
}

window.onload = async function () {
    await Start();
}