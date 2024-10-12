class Map {
    #layers = {};
    #map = null;
    #zoom = null;

    constructor(containerID, stylesheetLocation, center, zoom) {
        this.#map = new maplibregl.Map({
            container: containerID,
            style: stylesheetLocation, // stylesheet location
            center: center, // starting position [lng, lat]
            zoom: zoom // starting zoom
        })
    }

    centerMap(lng, lat) {
        this.#map.flyTo({
            center: [
                lng,
                lat
            ],
            zoom: this.#zoom,
            essential: true
        });
    }

    zoomTo(zoom) {
        this.#zoom = zoom;
        this.#map.zoomTo(zoom, {
            duration: 2000
        });
    }

    loadLayer(layerName, geojson) {
        this.unloadLayer(layerName);
        this.#map.addSource(layerName, {
            type: 'geojson',
            data: geojson
        });
        this.#layers[layerName] = geojson;
    }

    unloadLayer(layerName) {
        if (layerName in this.#layers) {
            this.#map.removeLayer(layerName);
            this.#map.removeSource(layerName);
            delete this.#layers[layerName];
        }
    }

    displayLayer(layerName, style_options, enabled = true) {
        let layer = {
            id: layerName,
            source: layerName,
        };
        for (let [key, value] of Object.entries(style_options)) {
            layer[key] = value;
        }
        if (enabled) {
            this.#map.addLayer(layer);
        } else if (this.#layers[layerName]) {
            this.#map.removeLayer(layerName);
        }
    }
}

export default Map;