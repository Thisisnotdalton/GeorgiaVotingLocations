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

    constructor() {
        this.#jsonCache = new JSONCache();
    }

    async getCounties() {
        return this.#jsonCache.getJSON('./counties.json');
    }

}

export default DataSet;