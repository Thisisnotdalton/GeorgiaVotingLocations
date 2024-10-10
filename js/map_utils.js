class Map {
    #layers = {};
    #map;
    
    constructor(containerID, stylesheetLocation, center, zoom) {
        map = new maplibregl.Map({
            container: containerID,
            style: stylesheetLocation, // stylesheet location
            center: center, // starting position [lng, lat]
            zoom: zoom // starting zoom
        }) 
    }

    centerMap(lat, lng) {

    }

    loadLayer(layerName, geojson) {

    }

    unloadLayer(layerName) {

    }

    displayLayer(layerName, enabled = true) {

    }
}

export default Map;