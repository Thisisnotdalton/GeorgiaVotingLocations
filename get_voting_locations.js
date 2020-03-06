function status(response) {
    if (response.status >= 200 && response.status < 300) {
        return Promise.resolve(response)
    } else {
        console.log(response);
        console.log(response.error);
        return Promise.reject(new Error(response.statusText))
    }
}

function json(response) {
    return response.json()
}


async function get_voting_locations() {
    let map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: 33.247875, lng: -83.441162},
        zoom: 8,
        minZoom: 7,
        maxZoom: 18
    });
    let markers = []
    fetch('./geocode_place_id_cache.json')
        .then(status)
        .then(json)
        .then((data) => {
            console.log("Loaded temporary cache of " + data.length + " polling locations.");
            return data;
        })
        .then((data) => {
            for (let i = 0; i < data.length; i++) {
                let result = data[i];
                let latLng = new google.maps.LatLng(result['lat'], result['lng'])
                let marker = new google.maps.Marker({
                    position: latLng,
                    map: map,
                    label: result['pollPlaceName']
                });
                markers.push(marker);
            }
            let markerCluster = new MarkerClusterer(map, markers,
                {imagePath: './markerclustererplus/images/m',
                 maxZoom: map.maxZoom - 1});
            return markerCluster;
        });
}

