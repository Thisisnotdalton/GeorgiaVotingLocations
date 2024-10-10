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

    static #applyCase(setCase) {
        if (setCase != undefined) {
            if (setCase == 'upper') {
                return (x) => x.toUpperCase();
            } else if (setCase == 'lower') {
                return (x) => x.toLowerCase();
            }
        }
        return (x) => x;
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
    #dataPath;
    #counties = null;
    #scenarioNames = null;
    #scenarioDates = null;

    constructor() {
        this.#jsonCache = new JSONCache();
        this.#dataPath = `./data/${this.#electionID}/`
    }

    async getCounties() {
        if (this.#counties == null) {
            let values = await this.#jsonCache.getJSON(`${this.#dataPath}/counties.json`);
            this.#counties = new StringValueSet(values, 'County', 'all_voting_locations', 'upper')
        }
        return this.#counties.values();
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
            this.#scenarioNames = new StringValueSet(values, 'Scenario Name');
        }
        return this.#scenarioNames.values();
    }

    async #getAllScenariosData(scenarioName) {
        await this.getCounties();
        await this.getScenarioNames();
        return (await this.#getScenariosJSON())[this.#scenarioNames.normalize(scenarioName)];
    }

    async getScenarioDates(scenarioName) {
        if (this.#scenarioDates == null) {
            this.#scenarioDates = {};
        }
        if (!(scenarioName in this.#scenarioDates)) {
            let values = Object.keys(await this.#getAllScenariosData(scenarioName));
            this.#scenarioDates[scenarioName] = new StringValueSet(values, 'Scenario Date');
        }
        return this.#scenarioDates[scenarioName].values();
    }

    async #getScenarioData(scenarioName, scenarioDate, countyName = '') {
        await this.getScenarioDates(scenarioName);
        scenarioName = this.#scenarioNames.normalize(scenarioName);
        scenarioDate = this.#scenarioDates[scenarioName].normalize(scenarioDate);
        countyName = this.#counties.normalize(countyName);
        return Promise.resolve((await this.#getAllScenariosData(scenarioName))[scenarioDate][countyName]);
    }

    async getPollingPlaces(scenarioName, scenarioDate, countyName, geojson = false) {
        let pollingPlaces = [];
        const countyJSON = await (geojson ? this.#getGeoJSON(countyName) : this.#getJSON(countyName));
        const availablePollingPlaces = await this.#getScenarioData(scenarioName, scenarioDate, countyName);
        for (let pollingPlaceIndex of availablePollingPlaces) {
            pollingPlaces.push(countyJSON[pollingPlaceIndex]);
        }
        return Promise.resolve(pollingPlaces);
    }
}

export default DataSet;