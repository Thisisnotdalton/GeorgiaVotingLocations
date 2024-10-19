import Map from "./map_utils.js";
import {DataSet} from "./dataset.js";
import getLastUpdated from "./last_updated.js";

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

    updateURLParameters() {
        // Get current URL parts
        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        const hash = window.location.hash;
        // Update query string values
        params.set('county', this.#selectedCounty);
        params.set('scenario', this.#selectedScenarioName);
        params.set('date', this.#selectedDate);
        // Update URL
        window.history.replaceState({}, '', `${path}?${params.toString()}${hash}`);
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

    #weekDays = [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ];

    async #updateDateSelection() {
        if (this.#dateSelectElement && !this.#dateSelectElement.hasChildNodes()) {
            for (const date of (await this.#data.getScenarioDates(this.#selectedScenarioName)).values()) {
                let availablePolls = await this.#data.getPollingPlaces(this.#selectedScenarioName, date, this.#selectedCounty);
                if (!('features' in availablePolls) || availablePolls['features'].length === 0) {
                    continue;
                }
                let opt = document.createElement('option')
                opt.value = date;
                let dayOfWeek = this.#weekDays[new Date(Date.parse(date)).getDay()];
                let dateText = date.replace('2024-', '');
                opt.innerHTML = `${dayOfWeek}, ${dateText}`;
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

    async getCountyBoundaries(centroid = false) {
        return this.#data.getAllCountyGeometry(centroid);
    }

    async getCoordinatesCountyName(coordinates) {
        let point = turf.point(coordinates);
        for (const countyName of (await this.#data.getCounties()).values()) {
            let countyBounds = await this.#data.getCountyGeometry(countyName);
            let bounds = countyBounds['features'][0]['geometry'];
            if (turf.booleanIntersects(point, bounds)) {
                return countyName;
            }
        }

        return (await this.#data.getCounties()).normalize();
    }
}

function infoPopUpHTML() {
    return `<div>
                <h1>Looking for an early voting location?</h1>
                <ol>
                    <li>Provide your location or select a county to view early voting locations in that county.</li>
                    <li>Select a time and day to filter early polling locations that are open.</li>
                    <li>Click on a polling place (gray circles) to view its name, address, and hours.</li>
                    <li>Click anywhere on the map to close this help message!</li>
                </ol>
            </div>
    `
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
        scheduleHTML += `<li style="color: white;">${line}</li>`;
    }

    const pollWrapper = document.getElementById('pollingPlaceInfo');
    pollWrapper.classList.remove('d-none');
    let encodedCoords = encodeURIComponent([pollingPlaceProperties.lat, pollingPlaceProperties.lng]);
    let pollingPlaceHTML = `
                    <h4>${pollingPlaceProperties.name}</h4>
                    <h5>Address:</h5>
                    <p style="font-weight: bold; color: white;">${pollingPlaceProperties.address}</p>
                    <h5>Schedule:</h5>
                    <ol>
                        ${scheduleHTML}
                    </ol>
                    <h5>Directions:</h5>
                    <ul>
                        <li><a href="https://www.google.com/maps/dir/?api=1&destination=${encodedCoords}">Google Maps</a></li>
                        <li><a href="http://maps.apple.com/?daddr=${encodedCoords}&ll=${encodedCoords}">Apple Maps</a></li>
                    </ul>
                `
    return pollingPlaceHTML;
}

class FeatureSelector {
    #maxSelected;
    #selected;
    #selectedHashMap;
    #selectCallBacks;
    #deselectCallBacks;

    constructor(maxSelected = 1) {
        this.#maxSelected = maxSelected;
        this.#selected = [];
        this.#selectedHashMap = {};
        this.#selectCallBacks = [];
        this.#deselectCallBacks = [];
    }

    #callSelectedCallBacks(feature, select = true) {
        const funcs = select ? this.#selectCallBacks : this.#deselectCallBacks;
        for (const func of funcs) {
            func(feature);
        }
    }

    AppendCallBack(callback, select = true) {
        if (select) {
            this.#selectCallBacks.push(callback);
        } else {
            this.#deselectCallBacks.push(callback);
        }
    }

    #hashFeature(feature) {
        let featureHash = feature.id.toString();
        if (!(typeof featureHash === 'string' || featureHash instanceof String)) {
            console.log(`feature hasher failed to produce a string for feature ${featureHash}`, feature);
        }
        return featureHash;
    }

    IsSelected(feature) {
        const featureHash = this.#hashFeature(feature);
        return featureHash in this.#selectedHashMap;
    }

    Deselect(feature) {
        if (this.IsSelected(feature)) {
            const featureHash = this.#hashFeature(feature);
            delete this.#selectedHashMap[featureHash];
            for (let i = 0; i < this.#selected.length; i++) {
                let index = this.#selected.indexOf(feature);
                if (index < 0) {
                    break;
                }
                this.#selected.splice(index, 1);
            }
            this.#callSelectedCallBacks(feature, false);
        }
    }

    Select(feature) {
        if (this.IsSelected(feature)) {
            return;
        }
        const featureHash = this.#hashFeature(feature);
        this.#selectedHashMap[featureHash] = feature;
        this.#selected.push(feature);
        this.#callSelectedCallBacks(feature);
        while (this.#maxSelected > 0 && this.#selected.length > this.#maxSelected) {
            this.Deselect(this.#selected[0]);
        }
    }

    DeselectAll() {
        while (this.#selected.length > this.#maxSelected) {
            this.Deselect(this.#selected[0]);
        }
    }

    ToggleSelection(feature) {
        if (this.IsSelected(feature)) {
            this.Deselect(feature);
        } else {
            this.Select(feature);
        }
    }
}

export async function Start() {
    const minZoomLevel = 6;
    const maxZoomLevel = 14;
    const boundariesLayerID = 'county_boundaries';
    const pollingPlacePopUpID = 'pollingPlace';
    const infoPopUpID = '\'infoPopUp\'';
    const pollingPlaceSideBarID = 'pollingPlaceInfo';
    let scenarios = new ScenarioSelector();
    const pollingLocationLayerID = 'polling_places';
    await scenarios.initialize();
    let clickedFeatureSelector = new FeatureSelector();
    const selectedFeatureStateKey = 'selectedFeature';
    clickedFeatureSelector.AppendCallBack((feature) => {
        let state = {};
        state[selectedFeatureStateKey] = true;
        map.setFeatureState(pollingLocationLayerID, feature.id, state);
        let pollingPlaceProperties = feature['properties'];
        let pollingPlaceSideBar = document.getElementById(pollingPlaceSideBarID);
        if (pollingPlaceSideBar) {
            pollingPlaceSideBar.innerHTML = formatPollingPlaceSideBarHTML(pollingPlaceProperties);
        }
    });
    clickedFeatureSelector.AppendCallBack((feature) => {
        let state = {};
        state[selectedFeatureStateKey] = false;
        map.setFeatureState(pollingLocationLayerID, feature.id, state);
    }, false);
    let hoveredFeatureSelector = new FeatureSelector();
    const hoveredFeatureStateKey = 'hoveredFeature';
    hoveredFeatureSelector.AppendCallBack((feature) => {
        let state = {};
        state[hoveredFeatureStateKey] = true;
        map.setFeatureState(pollingLocationLayerID, feature.id, state);
        let pollingPlaceProperties = feature['properties'];
        map.addPopUp(
            formatPollingPlacePopUpHTML(pollingPlaceProperties),
            pollingPlacePopUpID,
            feature['geometry']['coordinates']);
    });
    hoveredFeatureSelector.AppendCallBack((feature) => {
        let state = {};
        state[hoveredFeatureStateKey] = false;
        map.setFeatureState(pollingLocationLayerID, feature.id, state);
    }, false);

    let map = new Map("map", 'https://tiles.openfreemap.org/styles/liberty',
        await scenarios.getCentroid(),
        minZoomLevel);

    await map.waitForStyleLoaded();
    map.setZoomRange(minZoomLevel, maxZoomLevel);

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
        clickedFeatureSelector.Select(selectedPollingPlace);
    }

    function hoverFeature(features) {
        if (map.hasPopUp(infoPopUpID)){
            return;
        }
        map.showCursor();
        let selectedPollingPlace = extractFirstFeature(features);
        if (selectedPollingPlace) {
            hoveredFeatureSelector.Select(selectedPollingPlace);
        }
    }

    function stopHoverFeature(features) {
        map.hideCursor();
        let selectedPollingPlace = extractFirstFeature(features);
        if (selectedPollingPlace) {
            hoveredFeatureSelector.Deselect(selectedPollingPlace);
        }
    }

    let touchStartPosition;
    let touchEndPosition;

    async function touchClicked(point) {
        await clickFeature(map.selectFeaturesFromPoint(point));
    }

    function touchStartHover(point) {
        hoverFeature(map.selectFeaturesFromPoint(point));
    }

    function touchStopHover(point) {
        stopHoverFeature(map.selectFeaturesFromPoint(point));
    }

    async function touchStarted(event) {
        touchStartPosition = event.point;
        touchStartHover(touchStartPosition);
    }

    async function touchEnded(event) {
        touchEndPosition = event.point;
        touchStopHover(touchEndPosition);
        if (touchStartPosition.x === touchEndPosition.x &&
            touchStartPosition.y === touchEndPosition.y) {
            await touchClicked(touchEndPosition);
        }
    }
    async function selectClosestPollingLocation(coords){
        let point = turf.point(coords);
        let closest = null;
        let closestDistance = null;
        let features = map.getFeatures(pollingLocationLayerID);
        for(let feature of features) {
            let distance = turf.distance(point,  feature['geometry']);
            if (!closest || closestDistance > distance){
                closest = feature;
                closestDistance = distance;
            }
        }
        if (closest) {
            await clickFeature({features: [closest]});
            return closest;
        }
    }
    
    async function onSelectionChanged(selector) {
        let selection = await selector.getSelection();
        console.log(`Selected ${selection.county}\t${selection.scenarioName}\t${selection.scenarioDate}`);
        let centroid = await selector.getCentroid();
        // map.zoomTo(selection.county === DataSet.AllCountiesID() ? minZoomLevel : maxZoomLevel);
        map.centerMap(centroid[0], centroid[1]);
        let boundingBox = await scenarios.getBoundingBox();
        map.fitBounds(boundingBox);
        // Load county polling places (or state if no county selected)
        let pollingPlaces = await scenarios.getPollingPlaces();
        map.loadLayer(
            pollingLocationLayerID, pollingPlaces, {
                'generateId': true
            });
        await map.waitForDataLoaded(pollingLocationLayerID);
        map.displayLayer(pollingLocationLayerID,
            {
                'type': 'circle',
                'layout': {},
                'paint': {
                    'circle-color': [
                        'case',
                        ['boolean', ['feature-state', selectedFeatureStateKey], false],
                        '#3F3',
                        '#555'
                    ],
                    'circle-opacity': [
                        'case',
                        ['boolean', ['feature-state', selectedFeatureStateKey], false],
                        1,
                        [
                            'case',
                            ['boolean', ['feature-state', hoveredFeatureStateKey], false],
                            1,
                            0.5
                        ]
                    ],
                    'circle-radius': 10,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#333'
                }
            });
        map.registerLayerEventHandlers(pollingLocationLayerID, {
            'click': clickFeature,
            'mouseenter': hoverFeature,
            'mouseleave': stopHoverFeature,
            'touchstart': touchStarted,
            'touchend': touchEnded
        });
        map.closePopUp(pollingPlacePopUpID);
        clickedFeatureSelector.DeselectAll();
        hoveredFeatureSelector.DeselectAll();
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
    const labelsLayerID = `labels`;
    map.loadLayer(
        labelsLayerID, await scenarios.getCountyBoundaries(true));
    map.displayLayer(labelsLayerID,
        {
            'type': 'symbol',
            'layout': {
                'text-field': '{name}\nCounty',
                'text-font': ['Noto Sans Regular']
            },
            'minzoom': 8
        });
   /* map.addPopUp(
        infoPopUpHTML(),
        infoPopUpID,
        null,
        {
            maxWidth: 'none'
        }
    );*/

    async function updateFocusPosition(coords) {
        await map.waitForDataLoaded(pollingLocationLayerID);
        let closestPoll = await selectClosestPollingLocation(coords);
        if (closestPoll) {
            let closestCoords = closestPoll['geometry']['coordinates'];
            let midLng = (coords[0] + closestCoords[0]) / 2;
            let midLat = (coords[1] + closestCoords[1]) / 2;
            map.centerMap(midLng, midLat);
        } else {
            map.centerMap(coords[0], coords[1]);
        }
    }

    map.registerMoveHandler(async () => {
        /*if (map.hasPopUp(infoPopUpID)) {
            map.addPopUp(
                infoPopUpHTML(),
                infoPopUpID,
                null,
                {
                    maxWidth: 'none'
                }
            );
        }*/
    });

    map.registerGeoLocateHandler(async (geolocateData) => {
        let coords = geolocateData['coords'];
        coords = [coords.longitude, coords.latitude];
        let countyName = await scenarios.getCoordinatesCountyName(coords);
        console.log(`Determined county ${countyName} from geolocate. Coords: ${coords}`);
        await scenarios.selectCounty(countyName);
        await map.waitForDataLoaded(pollingLocationLayerID);
        await updateFocusPosition(coords);
    }, false);

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    await getLastUpdated();
    await scenarios.initialize();
    let date = urlParams.get('date')
    if (!date) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        date = `${yyyy}-${mm}-${dd}`;
        console.log(`Defaulting date to ${date}`);
    }
    await scenarios.selectDate(date);
    const scenario = urlParams.get('scenario')
    if (scenario) {
        await scenarios.selectScenarioName(scenario);
    }
    const county = urlParams.get('county')
    if (county) {
        await scenarios.selectCounty(county);
    }else{
        map.triggerGeolocate();
    }
    scenarios.updateURLParameters();
    scenarios.appendCallSelectionChangedCallback((x) => scenarios.updateURLParameters());
}

window.onload = async function () {
    await Start();
}