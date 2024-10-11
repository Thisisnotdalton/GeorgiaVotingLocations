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

    }

    unloadLayer(layerName) {

    }

    displayLayer(layerName, enabled = true) {

    }
}

export default Map;