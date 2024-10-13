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

    async selectCounty(countyName) {
        countyName = (await this.#data.getCounties()).normalize(countyName);
        if (countyName !== this.#selectedCounty) {
            this.#selectedCounty = countyName;
            this.#selectionChangedCallback();
        }
    }

    async selectScenarioName(scenarioName) {
        scenarioName = (await this.#data.getScenarioNames()).normalize(scenarioName);
        if (scenarioName !== this.#selectedScenarioName) {
            this.#selectedScenarioName = scenarioName;
            this.selectDate(this.#selectedDate);
        }
    }

    async selectDate(scenarioDate) {
        scenarioDate = (await this.#data.getScenarioDates(this.#selectedScenarioName)).normalize(scenarioDate);
        if (scenarioDate !== this.#selectedDate) {
            this.#selectedDate = scenarioDate;
            this.#selectionChangedCallback();
        }
    }

    async getPollingPlaces() {
        return this.#data.getPollingPlaces(this.#selectedScenarioName, this.#selectedDate, this.#selectedCounty);
    }

    async getCentroid() {
        let centroid = null;
        if (this.#selectedCounty === DataSet.AllCountiesID()) {
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
    const countyZoomLevel = 8.5;
    const boundariesLayerID = 'county_boundaries';
    let scenarios = new ScenarioSelector();

    const pollingLocationLayerID = 'polling_places';
    await scenarios.initialize();

    let map = new Map("map", 'https://tiles.openfreemap.org/styles/liberty',
        await scenarios.getCentroid(),
        stateZoomLevel);

    async function onSelectionChanged(selector) {
        let selection = await selector.getSelection();
        console.log(selection);
        let centroid = await selector.getCentroid();
        map.zoomTo(selection.county === DataSet.AllCountiesID() ? stateZoomLevel : countyZoomLevel);
        map.centerMap(centroid[0], centroid[1]);
        // Load county polling places (or state if no county selected)
        let pollingPlaces = await scenarios.getPollingPlaces();
        map.loadLayer(
            pollingLocationLayerID, pollingPlaces);
        map.displayLayer(pollingLocationLayerID,
            {
                'type': 'circle',
                'layout': {},
                'paint': {
                    'circle-color': '#3FF',
                    'circle-opacity': 0.8,
                    'circle-radius': 5,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#333'
                }
            });
        map.clickResponse(pollingLocationLayerID, (x) => {
            console.log(x['features'][0]['properties']);
        });
    }

    scenarios.appendCallSelectionChangedCallback(onSelectionChanged);
    // Load all county boundaries into layer.
    map.loadLayer(
        boundariesLayerID, await scenarios.getCountyBoundaries());
    map.displayLayer(boundariesLayerID,
        {
            'type': 'line',
            'layout': {},
            'paint': {
                'line-color': '#333',
                'line-opacity': 0.8,
                'line-width': 1,
            }
        });

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    await scenarios.initialize();
    const county = urlParams.get('county')
    if (county) {
        await scenarios.selectCounty(county);
    }
    const scenario = urlParams.get('scenario')
    if (scenario) {
        await scenarios.selectScenarioName(scenario);
    }
    const date = urlParams.get('date')
    if (date) {
        await scenarios.selectDate(date);
    }
}

window.onload = async function () {
    await Start();
}