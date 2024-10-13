import Map from "./map_utils.js";
import DataSet from "./dataset.js";

class ScenarioSelector {
    #data = null;
    #selectedCounty = null;
    #selectedScenarioName = null;
    #selectedDate = null;
    #callbacks = null;
    #countySelectElement;
    #scenarioSelectElement;
    #scenarioNameElement;
    #scenarioDescriptionElement;
    #dateSelectElement;


    constructor(
        countySelectElementID = 'countySelect',
        scenarioSelectElementID = 'scenarioSelect',
        dateSelectElementID = 'dateSelect',
        scenarioNameElementID = 'scenarioName',
        scenarioDescriptionElementID = 'scenarioDescription',) {
        this.#data = new DataSet();
        this.#callbacks = [];
        this.#countySelectElement = document.getElementById(countySelectElementID);
        this.#scenarioSelectElement = document.getElementById(scenarioSelectElementID);
        this.#dateSelectElement = document.getElementById(dateSelectElementID);
        this.#scenarioNameElement = document.getElementById(scenarioNameElementID);
        this.#scenarioDescriptionElement = document.getElementById(scenarioDescriptionElementID);
        if (this.#countySelectElement) {
            this.#countySelectElement.addEventListener('change', async (event) => {
                await this.selectCounty(this.#countySelectElement.value);
            })
        }
        if (this.#scenarioSelectElement) {
            this.#scenarioSelectElement.addEventListener('change', async (event) => {
                await this.selectScenarioName(this.#scenarioSelectElement.value);
            })
        }
        if (this.#dateSelectElement) {
            this.#dateSelectElement.addEventListener('change', async (event) => {
                await this.selectDate(this.#dateSelectElement.value);
            })
        }
    }

    getSelection() {
        return {
            "county": this.#selectedCounty,
            "scenarioName": this.#selectedScenarioName,
            "scenarioDate": this.#selectedDate
        }
    }

    async #selectionChangedCallback() {
        if (this.#countySelectElement) {
            for (const option of this.#countySelectElement.options) {
                if (option.value === this.#selectedCounty) {
                    option.selected = true;
                    break;
                }
            }
        }
        if (this.#scenarioSelectElement) {
            for (const option of this.#scenarioSelectElement.options) {
                if (option.value === this.#selectedScenarioName) {
                    option.selected = true;
                    break;
                }
            }
        }
        this.clearDateSelection();
        await this.#updateDateSelection().then(() => {
            if (this.#dateSelectElement) {
                for (const option of this.#dateSelectElement.options) {
                    if (option.value === this.#selectedDate) {
                        option.selected = true;
                        break;
                    }
                }
            }
        });
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
        if (this.#countySelectElement && !this.#countySelectElement.hasChildNodes()) {
            let opt = document.createElement('option')
            opt.value = (await this.#data.getCounties()).normalize();
            opt.innerHTML = "ALL COUNTIES";
            this.#countySelectElement.appendChild(opt);
            for (const county of (await this.#data.getCounties()).values()) {
                let opt = document.createElement('option')
                opt.value = county;
                opt.innerHTML = county;
                this.#countySelectElement.appendChild(opt);
            }
        }
        if (this.#scenarioSelectElement && !this.#scenarioSelectElement.hasChildNodes()) {
            for (const scenarioName of (await this.#data.getScenarioNames()).values()) {
                let opt = document.createElement('option')
                opt.value = scenarioName;
                let scenarioInfo = (await this.#data.getScenarioInfo(scenarioName));
                opt.innerHTML = scenarioInfo['name'];
                this.#scenarioSelectElement.appendChild(opt);
            }
        }
        await this.#selectionChangedCallback();
    }

    clearDateSelection() {
        this.#dateSelectElement.innerHTML = '';
    }

    async #updateDateSelection() {
        if (this.#dateSelectElement && !this.#dateSelectElement.hasChildNodes()) {
            for (const date of (await this.#data.getScenarioDates(this.#selectedScenarioName)).values()) {
                let availablePolls = await this.#data.getPollingPlaces(this.#selectedScenarioName, date, this.#selectedCounty);
                if (!('features' in availablePolls) || availablePolls['features'].length === 0) {
                    continue;
                }
                let opt = document.createElement('option')
                opt.value = date;
                opt.innerHTML = date.replace('2024-', '');
                this.#dateSelectElement.appendChild(opt);
            }
        }
    }

    async selectCounty(countyName) {
        countyName = (await this.#data.getCounties()).normalize(countyName);
        if (countyName !== this.#selectedCounty) {
            this.#selectedCounty = countyName;
            await this.#selectionChangedCallback();
        }
    }

    async selectScenarioName(scenarioName) {
        scenarioName = (await this.#data.getScenarioNames()).normalize(scenarioName);
        console.log(`New scenario ${this.#selectedScenarioName} -> ${scenarioName}`);
        if (scenarioName !== this.#selectedScenarioName) {
            this.#selectedScenarioName = scenarioName;
            let oldDate = this.#selectedDate;
            this.selectDate(this.#selectedDate);
            if (oldDate === this.#selectedDate) {
                await this.#selectionChangedCallback();
            }
        }
    }

    async selectDate(scenarioDate) {
        scenarioDate = (await this.#data.getScenarioDates(this.#selectedScenarioName)).normalize(scenarioDate);
        if (scenarioDate !== this.#selectedDate) {
            this.#selectedDate = scenarioDate;
            await this.#selectionChangedCallback();
        }
    }

    async getPollingPlaces() {
        return this.#data.getPollingPlaces(this.#selectedScenarioName, this.#selectedDate, this.#selectedCounty);
    }

    async getBoundingBox() {
        let boundingBox = null;
        if (this.#selectedCounty === DataSet.AllCountiesID()) {
            boundingBox = await this.#data.getStateBoundingBox();
        } else {
            boundingBox = await this.#data.getCountyBoundingBox(this.#selectedCounty);
        }
        return boundingBox;
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

function formatPollingPlacePopUpHTML(pollingPlaceProperties) {
    let pollingPlaceHTML = `
                    <h5>${pollingPlaceProperties.name}</h5>
                    <p>${pollingPlaceProperties.address}</p>
                    <em>Click to view hours of operation and directions!</em>
                `
    return pollingPlaceHTML;
}

function formatPollingPlaceSideBarHTML(pollingPlaceProperties) {
    let schedule = pollingPlaceProperties['schedule'].split('\n');
    let scheduleHTML = ''
    for (let line of schedule) {
        scheduleHTML += `<li>${line}</li>`;
    }
    let pollingPlaceHTML = `
                    <h4>${pollingPlaceProperties.name}</h4>
                    <h5>Address:</h5>
                    <p>${pollingPlaceProperties.address}</p>
                    <h5>Schedule:</h5>
                    <ol>
                        ${scheduleHTML}
                    </ol>
                    <h5>Directions:</h5>
                    <ul>
                        <li><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([pollingPlaceProperties.lat, pollingPlaceProperties.lng])}">Google Maps</a></li>
                        <li><a href="http://maps.apple.com/?ll=${encodeURIComponent([pollingPlaceProperties.lat, pollingPlaceProperties.lng])}">Apple Maps</a></li>
                    </ul>
                `
    return pollingPlaceHTML;
}

export async function Start() {
    const stateZoomLevel = 6.5;
    const countyZoomLevel = 8.5;
    const boundariesLayerID = 'county_boundaries';
    const pollingPlacePopUpID = 'pollingPlace';
    const pollingPlaceSideBarID = 'pollingPlaceInfo';
    let scenarios = new ScenarioSelector();

    const pollingLocationLayerID = 'polling_places';
    await scenarios.initialize();

    let map = new Map("map", 'https://tiles.openfreemap.org/styles/liberty',
        await scenarios.getCentroid(),
        stateZoomLevel);

    await map.waitForStyleLoaded();

    function extractFirstFeature(features, property = null) {
        if ('features' in features && features['features'].length > 0) {
            let result = features['features'][0];
            if (property && 'properties' in result) {
                return result['properties'][property];
            }
            return result;
        }
        return null;
    }

    async function clickFeature(features) {
        let selectedPollingPlace = extractFirstFeature(features);
        let pollingPlaceProperties = selectedPollingPlace['properties'];
        let pollingPlaceSideBar = document.getElementById(pollingPlaceSideBarID);
        if (pollingPlaceSideBar) {
            pollingPlaceSideBar.innerHTML = formatPollingPlaceSideBarHTML(pollingPlaceProperties);
        }
        // await scenarios.selectCounty(extractFirstFeature(features, 'county'));
    }

    function hoverFeature(features) {
        map.showCursor();
        let selectedPollingPlace = extractFirstFeature(features);
        if (selectedPollingPlace) {
            let pollingPlaceProperties = selectedPollingPlace['properties'];
            map.addPopUp(
                formatPollingPlacePopUpHTML(pollingPlaceProperties),
                pollingPlacePopUpID,
                selectedPollingPlace['geometry']['coordinates']);
        }
    }

    function stopHoverFeature(features) {
        map.hideCursor();
    }

    async function onSelectionChanged(selector) {
        let selection = await selector.getSelection();
        console.log(`Selected ${selection.county}\t${selection.scenarioName}\t${selection.scenarioDate}`);
        let centroid = await selector.getCentroid();
        // map.zoomTo(selection.county === DataSet.AllCountiesID() ? stateZoomLevel : countyZoomLevel);
        map.centerMap(centroid[0], centroid[1]);
        let boundingBox = await scenarios.getBoundingBox();
        map.fitBounds(boundingBox);
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
        map.registerLayerEventHandlers(pollingLocationLayerID, {
            'click': clickFeature,
            'mouseenter': hoverFeature,
            'mouseleave': stopHoverFeature,
        });
        map.closePopUp(pollingPlacePopUpID);
        // Get current URL parts
        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        const hash = window.location.hash;
        // Update query string values
        params.set('county', selection.county);
        params.set('scenario', selection.scenarioName);
        params.set('date', selection.scenarioDate);
        // Update URL
        window.history.replaceState({}, '', `${path}?${params.toString()}${hash}`);
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
    const date = urlParams.get('date')
    if (date) {
        await scenarios.selectDate(date);
    }
    const scenario = urlParams.get('scenario')
    if (scenario) {
        await scenarios.selectScenarioName(scenario);
    }
    const county = urlParams.get('county')
    if (county) {
        await scenarios.selectCounty(county);
    }
}

window.onload = async function () {
    await Start();
}