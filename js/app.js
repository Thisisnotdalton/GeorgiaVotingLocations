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

    async getPollingPlaces(geojson = false) {
        return this.#data.getPollingPlaces(this.#selectedScenarioName, this.#selectedDate, this.#selectedCounty, geojson);
    }

    async getCentroid() {
        let centroid = null;
        if (this.#selectedCounty === 'all_voting_locations') {
            centroid = await this.#data.getStateGeometry(true);
        } else {
            centroid = await this.#data.getCountyGeometry(this.#selectedCounty, true);
        }
        if (centroid) {
            centroid = centroid['features'][0]['geometry']['coordinates'];
        }
        return centroid;
    }

    async getCountyBoundaries() {
        return this.#data.getAllCountyGeometry(false);
    }

}

export async function Start() {
    const stateZoomLevel = 6.5;
    const countyZoomLevel = 7;
    let map = new Map("map", 'https://tiles.openfreemap.org/styles/liberty', [0, 0], 8);

    let scenarios = new ScenarioSelector();

    async function onSelectionChanged(selector) {
        let selection = await selector.getSelection();
        console.log(selection);
        let centroid = await selector.getCentroid();
        map.zoomTo(selection.county === 'all_voting_locations' ? stateZoomLevel : countyZoomLevel);
        map.centerMap(centroid[0], centroid[1]);
    }

    // Load county polling places (or state if no county selected)
    scenarios.appendCallSelectionChangedCallback(onSelectionChanged);
    await scenarios.initialize();
    // Load all county boundaries into layer.
    map.loadLayer(
        'county_boundaries', await scenarios.getCountyBoundaries());
    map.displayLayer('county_boundaries',
        {
            'type': 'line',
            'layout': {},
            'paint': {
                'line-color': '#333',
                'line-opacity': 0.8,
                'line-width': 1,
            }
        });
}

window.onload = async function () {
    await Start();
}