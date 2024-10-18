class Map {
    #layers = {};
    #layerEventHandlers = {};
    #map = null;
    #zoom = null;
    #popUps = {};
    #styleLoaded = false;
    #geolocate;

    constructor(containerID, stylesheetLocation, center, zoom) {
        this.#map = new maplibregl.Map({
            container: containerID,
            style: stylesheetLocation, // stylesheet location
            center: center, // starting position [lng, lat]
            zoom: zoom // starting zoom
        })
        this.#map.on('style.load', () => {
                const waiting = () => {
                    if (!this.#map.isStyleLoaded()) {
                        setTimeout(waiting, 200);
                    } else {
                        this.#styleLoaded = true;
                    }
                };
                waiting();
            }
        );
        // Add zoom and rotation controls to the map.
        this.#map.addControl(new maplibregl.NavigationControl());
        // Add geolocate control to the map.
        this.#geolocate = new maplibregl.GeolocateControl({
            positionOptions: {
                enableHighAccuracy: true
            }
        });
        this.#map.addControl(this.#geolocate);
    }

    setZoomRange(minZoom, maxZoom) {
        this.#map.setMaxZoom(maxZoom);
        this.#map.setMinZoom(minZoom);
    }

    async waitForStyleLoaded() {
        while (!this.#styleLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async waitForDataLoaded(sourceLayerID, loaded=true) {
        while (this.#map.isSourceLoaded(sourceLayerID) !== loaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    centerMap(lng, lat, zoom=null) {
        let options =  {
            center: [
                lng,
                lat
            ],
            essential: true
        };
        if (zoom){
            options['zoom'] = zoom;
        }
        this.#map.flyTo(options);
    }

    zoomTo(zoom) {
        this.#zoom = zoom;
        this.#map.zoomTo(zoom, {
            duration: 2000
        });
    }

    setFeatureState(layerID, featureID, state, update=true) {
        if (update){
            let updatedState = structuredClone(this.#map.getFeatureState({
                source: layerID, id: featureID
            }));
            for (const [key, value] of Object.entries(state)) {
                updatedState[key] = value;
            }
            state= updatedState;
        }
        this.#map.setFeatureState({
                source: layerID, id: featureID
            }, state
        );
    }

    loadLayer(layerName, geojson, additionalOptions = null) {
        this.unloadLayer(layerName);
        let source = {
            type: 'geojson',
            data: geojson
        };
        if (additionalOptions) {
            for (let [key, value] of Object.entries(additionalOptions)) {
                source[key] = value;
            }
        }
        this.#map.addSource(layerName, source);
        this.#layers[layerName] = geojson;
    }

    unloadLayer(layerName) {
        if (layerName in this.#layers) {
            if (this.#map.getLayer(layerName)) {
                this.#map.removeLayer(layerName);
            }
            if (this.#map.getSource(layerName)) {
                this.#map.removeSource(layerName);
            }
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
            if (!this.#map.getLayer(layerName)) {
                this.#map.addLayer(layer);
            }
        } else if (this.#layers[layerName]) {
            if (this.#map.getLayer(layerName)) {
                this.#map.removeLayer(layerName);
            }
        }
    }

    fitBounds(bounds) {
        this.#map.fitBounds(bounds);
    }
    
    extendToFit(coordinates) {
        let bounds = this.#map.getBounds();
        bounds = bounds.extend(coordinates);
        this.fitBounds(bounds);
    }
    
    showCursor() {
        this.#map.getCanvas().style.cursor = 'pointer';
    }

    hideCursor() {
        this.#map.getCanvas().style.cursor = '';
    }


    selectFeaturesFromPoint(point) {
        const features = this.#map.queryRenderedFeatures(point);
        return features;
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
    
    getCenter(){
        return this.#map.getCenter();
    }
    
    getFeatures(layerID){
        return this.#map.querySourceFeatures(layerID, {
            'sourceLayer': layerID
        });
    }

    registerGeoLocateHandler(handler, once=true) {
        if (once){
            this.#geolocate.once('geolocate', handler);
        }
        else{
            this.#geolocate.on('geolocate', handler);
        }
    }
    
    registerMoveHandler(handler){
        this.#map.on('move', handler);
    }
    
    triggerGeolocate(){
        this.#geolocate.trigger();
    }

    hasPopUp(popUpID){
        return popUpID in this.#popUps && this.#popUps[popUpID].isOpen();
    }
    
    closePopUp(popUpID) {
        if (this.hasPopUp(popUpID)) {
            let popUp = this.#popUps[popUpID];
            popUp.remove();
            delete this.#popUps[popUpID];
            return popUp;
        }
    }

    addPopUp(htmlText, popUpID = 'popup', center = null, popUpOptions = null) {
        let popUp = this.closePopUp(popUpID);
        if (!popUp) {
            let options = {closeOnClick: true};
            if (popUpOptions){
                for (let [key, value] of Object.entries(popUpOptions)) {
                    options[key] = value;
                }
            }
            popUp = new maplibregl.Popup(options);
        }
        this.#popUps[popUpID] = popUp;
        if (center === null){
            center = this.#map.getCenter();
        }
        popUp.setHTML(htmlText);
        popUp.setLngLat(center);
        popUp.addTo(this.#map);
    }
}

export default Map;