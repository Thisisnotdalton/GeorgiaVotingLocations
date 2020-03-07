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

let map = null;
let markers = null;
let locationMarker = null;

async function get_voting_locations() {
    if ("geolocation" in navigator) {
      /* geolocation is available */
    } else {
      let location_button = document.getElementById("GetLocation");
      location_button.parentElement.removeChild(location_button);
    }

    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: 33.247875, lng: -83.441162},
        zoom: 8,
        minZoom: 7,
        maxZoom: 18,
        streetViewControl: false
    });
    markers = []
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
                let latLng = new google.maps.LatLng(result['lat'], result['lng']);
                let marker = new google.maps.Marker({
                    position: latLng,
                    map: map,
                    label: ''
                });
                let infoContents = '<h2>' + result['pollPlaceName'] + '</h2><br><h3>Address:</h3><br> <a href="' + result['url'] + '">' + result['address'] + '</a>' + "<br><h3>Availability:</h3><br>";
                for (let j = 0; j < result['dates'].length; j++) {
                    infoContents += result['dates'][j] + "<br>";
                }
                let infoWindow = new google.maps.InfoWindow({content: infoContents});
                marker.addListener('click', () => {
                    map.panTo(marker.getPosition());
                    infoWindow.open(map, marker);
                });
                marker.addListener('mouseover', () => {
                    marker.setLabel('Click me!');
                });
                marker.addListener('mouseout', () => {
                    marker.setLabel('');
                });
                infoWindow.addListener('closeclick', () => {
                    infoWindow.close();
                });
                markers.push(marker);
            }
            let markerCluster = new MarkerClusterer(map, markers,
                {
                    imagePath: './markerclustererplus/images/m',
                    maxZoom: map.maxZoom - 1
                });
            return markerCluster;
        });
}

function get_coordinates(){
    if ("geolocation" in navigator){
        navigator.geolocation.getCurrentPosition((position) => {
            document.getElementById("latitude").value = position.coords.latitude;
            document.getElementById("longitude").value = position.coords.longitude;
            moveMap();
        });
    }
}

function moveMap(){
    let lat = parseFloat(document.getElementById("latitude").value);
    let lng = parseFloat(document.getElementById("longitude").value);
    let position = new google.maps.LatLng(lat, lng)
    if (locationMarker == null){
        locationMarker = new google.maps.Marker({
            position: position,
            map: map,
            label: 'You are here!',
            icon: './markerclustererplus/images/people35.png'
        });
    }
    locationMarker.setPosition(position);
    map.panTo(position);
    console.log(lat +','+lng);
}