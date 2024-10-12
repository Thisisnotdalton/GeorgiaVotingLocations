class Map {
    #layers = {};
    #layerClickResponses = {};
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
            this.clickResponse(layerName, null);
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

    clickResponse(layerName, handler, hoverPointer = true) {
        if (handler) {
            let handlers = {
                'click': handler
            };
            if (hoverPointer) {
                handlers['mouseenter'] = () => {
                    this.#map.getCanvas().style.cursor = 'pointer';
                };
                handlers['mouseleave'] = () => {
                    this.#map.getCanvas().style.cursor = '';
                };
            }
            this.#layerClickResponses[layerName] = handlers;
            for (let [key, value] of Object.entries(handlers)) {
                this.#map.on(key, layerName, value);
            }
        } else if (layerName in this.#layerClickResponses) {
            for (let [key, value] of Object.entries(this.#layerClickResponses[layerName])) {
                this.#map.off(key, value);
            }
        }
    }
}

export default Map;