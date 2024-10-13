class Map {
    #layers = {};
    #layerEventHandlers = {};
    #map = null;
    #zoom = null;
    #popUps = {};

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
            this.registerLayerEventHandlers(layerName, null);
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
    
    showCursor(){
        this.#map.getCanvas().style.cursor = 'pointer';
    }
    
    hideCursor(){
        this.#map.getCanvas().style.cursor = '';
    }

    registerLayerEventHandlers(layerName, handlers) {
        if (handlers) {
            this.#layerEventHandlers[layerName] = handlers;
            for (let [key, value] of Object.entries(this.#layerEventHandlers[layerName])) {
                this.#map.on(key, layerName, value);
            }
        } else if (layerName in this.#layerEventHandlers) {
            for (let [key, value] of Object.entries(this.#layerEventHandlers[layerName])) {
                this.#map.off(key, value);
            }
        }
    }

    closePopUp(popUpID) {
        if (popUpID in this.#popUps) {
            let popUp = this.#popUps[popUpID];
            popUp.remove();
            // delete this.#popUps[popUpID];
            return popUp;
        }
    }

    addPopUp(htmlText, popUpID = 'popup', center = null) {
        let popUp = this.closePopUp(popUpID);
        if (!popUp) {
            popUp = new maplibregl.Popup({closeOnClick: true});
            this.#popUps[popUpID] = popUp;
        }
        popUp.setHTML(htmlText);
        popUp.setLngLat(center);
        popUp.addTo(this.#map);
    }
}

export default Map;