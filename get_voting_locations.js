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
let markerCluster = null;
let locationMarker = null;
let counties = null;
let markersByCounty = null;
let countyFilter = null;

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
    markers = [];
    counties = [];
    markersByCounty = {};
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
                let county = result['county'];
                let countyIndex = counties.length;
                for (let j = counties.length - 1; j >= 0; j--) {
                    if (counties[j] <= county) {
                        if (counties[j] == county) {
                            countyIndex = -1;
                        }
                        break;
                    }
                    countyIndex = j;
                }
                if (countyIndex >= 0) {
                    counties.splice(countyIndex, 0, county);
                    markersByCounty[county] = [];
                }

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
                markersByCounty[county].push(marker);
            }
            markerCluster = new MarkerClusterer(map, markers,
            {
                imagePath: './markerclustererplus/images/m',
                maxZoom: map.maxZoom - 1
            });
        }).then(() => {
        for (let i = 0; i < counties.length; i++) {
            let opt = document.createElement('option')
            opt.value = counties[i];
            opt.innerHTML = counties[i];
            document.getElementById("countySelect").appendChild(opt);
        }
    });
}

function get_coordinates() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
            document.getElementById("latitude").value = position.coords.latitude;
            document.getElementById("longitude").value = position.coords.longitude;
            moveMap();
        });
    }
}

function filterMarkersByCounty(county = 'Any') {
    if (county != 'Any') {
        console.log("Filtering out markers which do not match county " + county);
    }else{
        console.log("Removing county filter.");
    }
    countyFilter = county;
    for (let i = 0; i < counties.length; i++) {
        for (let j = 0; j < markersByCounty[counties[i]].length; j++) {
            markersByCounty[counties[i]][j].setMap((county == counties[i] || county == 'Any') ? map : null);
        }
    }
    markerCluster.clearMarkers();
    markerCluster = new MarkerClusterer(map, county == 'Any'? markers : markersByCounty[county],
    {
        imagePath: './markerclustererplus/images/m',
        maxZoom: map.maxZoom - 1
    });
}

function findNearestPollingPlaceBounds(location, count = 3) {
    let pollingPlaces = [];
    let distances = [];
    for (let i = 0; i < markers.length; i++) {
        let distance = google.maps.geometry.spherical.computeDistanceBetween(location, markers[i].getPosition());
        if (distances.length < count || distance < distances[distances.length - 1]) {
            let insertion_point = 0;
            for (let j = 0; j < distances.length; j++) {
                insertion_point = j;
                if (distance < distances[j]) {
                    break;
                }
            }
            distances.splice(insertion_point, 0, distance);
            pollingPlaces.splice(insertion_point, 0, i);

            if (distances.length > count) {
                distances.pop();
                pollingPlaces.pop();
            }
        }
    }
    let bounds = new google.maps.LatLngBounds();
    bounds.extend(location);
    for (let i = 0; i < pollingPlaces.length; i++) {
        console.log("Nearest location " + (pollingPlaces[i]) + ": " + markers[pollingPlaces[i]].getPosition());
        bounds.extend(markers[pollingPlaces[i]].getPosition());
    }

    return bounds;
}

function moveMap() {
    let lat = parseFloat(document.getElementById("latitude").value);
    let lng = parseFloat(document.getElementById("longitude").value);
    let position = new google.maps.LatLng(lat, lng)
    if (locationMarker == null) {
        locationMarker = new google.maps.Marker({
            position: position,
            map: map,
            label: 'You are here!',
            icon: './markerclustererplus/images/people35.png'
        });
    }
    locationMarker.setPosition(position);
    map.setZoom(18);
    map.panTo(position);
    map.fitBounds(findNearestPollingPlaceBounds(position), 100);


    console.log(lat + ',' + lng);
}

let optionsEnabled = true;

function toggleOptions() {
    if (optionsEnabled) {
        document.getElementById("options").style.display = "none";
        document.getElementById("options-button").style.display = "flex";
    } else {

        document.getElementById("options").style.display = "flex";
        document.getElementById("options-button").style.display = "none";
    }

    optionsEnabled = !optionsEnabled;
}
