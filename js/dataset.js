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


class DataSet {
    #jsonCache;
    #electionID = 'a0p3d00000LWdF5AAL';
    #dataPath;

    constructor() {
        this.#jsonCache = new JSONCache();
        this.#dataPath = `./data/${this.#electionID}/`
    }

    async getCounties() {
        return this.#jsonCache.getJSON(`${this.#dataPath}/counties.json`);
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
        return Object.keys(await this.#getScenariosJSON());
    }

    async #getAllScenariosData(scenarioName) {
        return (await this.#getScenariosJSON())[scenarioName];
    }

    async getScenarioDates(scenarioName) {
        return Object.keys((await this.#getAllScenariosData(scenarioName)));
    }

    async #getScenarioData(scenarioName, scenarioDate, countyName = '') {
        let scenarioData = (await this.#getAllScenariosData(scenarioName))[scenarioDate];
        if (countyName.length > 0) {
            scenarioData = scenarioData[countyName];
        }
        return scenarioData;
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