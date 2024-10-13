class JSONCache {
    #cache = {};

    static async #status(response) {
        if (response.status >= 200 && response.status < 300) {
            return Promise.resolve(response)
        } else {
            console.log(response);
            console.log(response.error);
            return Promise.reject(new Error(response.statusText))
        }
    }

    static async #json(response) {
        return Promise.resolve(response.json());
    }

    static async #loadJSON(filePath) {
        return fetch(filePath).then(JSONCache.#status).then(JSONCache.#json);
    }

    async getJSON(filePath) {
        if (!(filePath in this.#cache)) {
            this.#cache[filePath] = await JSONCache.#loadJSON(filePath);
        }
        return this.#cache[filePath];
    }
}

class StringValueSet {
    #validValues = null;
    #valueIndices = null;
    #defaultValue = null;
    #setDescription = null;
    #setCase = null;

    constructor(values, setDescription, defaultValue = null, setCase = undefined) {
        this.#setDescription = setDescription;
        this.#setCase = StringValueSet.#applyCase(setCase);
        this.#validValues = values.map(this.#setCase);
        this.#defaultValue = defaultValue == null ? this.#validValues[0] : defaultValue;
        this.#valueIndices = {};
        for (const index in this.#validValues) {
            this.#valueIndices[this.#validValues[index]] = index;
        }
    }

    static #toUpperCase(value) {
        return value ? value.toUpperCase() : value;
    }

    static #toLowerCase(value) {
        return value ? value.toLowerCase() : value;
    }

    static #noCaseChange(value) {
        return value;
    }

    static #applyCase(setCase) {
        if (setCase !== undefined && setCase !== null) {
            if (setCase === 'upper') {
                return StringValueSet.#toUpperCase;
            } else if (setCase === 'lower') {
                return StringValueSet.#toLowerCase;
            }
        }
        return StringValueSet.#noCaseChange;
    }

    normalize(value) {
        value = this.#setCase(value);
        if (value in this.#valueIndices) {
            return value;
        }
        console.log(`Failed to validate ${this.#setDescription} "${value}". Defaulting to "${this.#defaultValue}".`);
        return this.#defaultValue;
    }

    values() {
        return Array.from(this.#validValues);
    }
}


class DataSet {
    #jsonCache;
    #electionID = 'a0p3d00000LWdF5AAL';
    #stateName = 'Georgia';
    #dataPath;
    #counties = null;
    #scenarioNames = null;
    #scenarioDates = null;
    static #allCountiesID = 'ALL_COUNTIES'

    static AllCountiesID() {
        return this.#allCountiesID;
    }

    constructor() {
        this.#jsonCache = new JSONCache();
        this.#dataPath = `./data/${this.#electionID}/`
    }

    async getCounties() {
        if (this.#counties == null) {
            let values = await this.#jsonCache.getJSON(`${this.#dataPath}/counties.json`);
            this.#counties = new StringValueSet(values, 'County', DataSet.AllCountiesID(), 'upper')
        }
        return this.#counties;
    }

    async #getCountyBoundaries() {
        return await this.#jsonCache.getJSON(`${this.#dataPath}/county_boundaries/${this.#stateName}.geojson`);
    }

    async #getCountyCentroids() {
        return await this.#jsonCache.getJSON(`${this.#dataPath}/county_boundaries/${this.#stateName}_centroids.geojson`);
    }

    async #getCountyBoundingBoxes() {
        return await this.#jsonCache.getJSON(`${this.#dataPath}/county_boundaries/${this.#stateName}_bounds.json`);
    }

    async #filterCountyGeometry(countyName, centroids = false, mustMatch = true) {
        let matches = [];
        let data = await (centroids ? this.#getCountyCentroids() : this.#getCountyBoundaries());
        for (const feature of data['features']) {
            if ((feature['properties']['NAME'] === countyName) === mustMatch) {
                matches.push(feature);
            }
        }
        let results = structuredClone(data);
        results['features'] = matches;
        return Promise.resolve(results);
    }

    async getCountyGeometry(countyName, centroid = false) {
        return this.#filterCountyGeometry(countyName, centroid);
    }

    async getCountyBoundingBox(countyName) {
        return Promise.resolve((await this.#getCountyBoundingBoxes())[countyName]);
    }

    async getStateBoundingBox() {
        return this.getCountyBoundingBox('');
    }

    async getAllCountyGeometry(centroid = false) {
        return this.#filterCountyGeometry('', centroid, false);
    }

    async getStateGeometry(centroid = false) {
        return this.#filterCountyGeometry('', centroid);
    }

    async #getGeoJSON(countyName) {
        return this.#jsonCache.getJSON(`${this.#dataPath}/geojson/${countyName}.geojson`);
    }

    async #getJSON(countyName) {
        return this.#jsonCache.getJSON(`${this.#dataPath}/json/${countyName}.json`)
    }

    async #getScenariosJSON() {
        return this.#jsonCache.getJSON(`${this.#dataPath}/scenarios/scenarios.json`);
    }

    async getScenarioNames() {
        if (this.#scenarioNames == null) {
            let values = Object.keys(await this.#getScenariosJSON());
            this.#scenarioNames = new StringValueSet(values, 'Scenario Name', 'any_time');
        }
        return this.#scenarioNames;
    }

    async #getAllScenariosData(scenarioName) {
        await this.getCounties();
        await this.getScenarioNames();
        return (await this.#getScenariosJSON())[this.#scenarioNames.normalize(scenarioName)];
    }
    
    async getScenarioInfo(scenarioName){
        let scenariosData = await this.#getAllScenariosData(scenarioName);
        return scenariosData['info'];
    }
    
    async getScenarioDates(scenarioName) {
        if (this.#scenarioDates == null) {
            this.#scenarioDates = {};
        }
        if (!(scenarioName in this.#scenarioDates)) {
            let values = Object.keys((await this.#getAllScenariosData(scenarioName))['times']);
            this.#scenarioDates[scenarioName] = new StringValueSet(values, 'Scenario Date');
        }
        return this.#scenarioDates[scenarioName];
    }

    async #getScenarioData(scenarioName, scenarioDate, countyName = '') {
        await this.getScenarioDates(scenarioName);
        scenarioName = this.#scenarioNames.normalize(scenarioName);
        scenarioDate = this.#scenarioDates[scenarioName].normalize(scenarioDate);
        countyName = this.#counties.normalize(countyName);
        let scenariosData = await this.#getAllScenariosData(scenarioName);
        scenariosData = scenariosData['times'][scenarioDate];
        scenariosData = scenariosData[countyName];
        return Promise.resolve(scenariosData);
    }

    async getPollingPlaces(scenarioName, scenarioDate, countyName) {
        let pollingPlaces = [];
        const countyJSON = await this.#getGeoJSON(countyName);
        const availablePollingPlaces = await this.#getScenarioData(scenarioName, scenarioDate, countyName);
        let result = structuredClone(countyJSON);
        for (let pollingPlaceIndex of availablePollingPlaces) {
            let pollingPlace = countyJSON['features'][pollingPlaceIndex];
            if (pollingPlace) {
                pollingPlaces.push(pollingPlace);
            } else {
                console.log(`Missing polling place at index: [${countyName}][${pollingPlaceIndex}]`);
            }
        }
        result['features'] = pollingPlaces;
        return Promise.resolve(result);
    }
}

export default DataSet;