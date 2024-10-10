import Map from "./map_utils.js";

export function Start(){
    let map = new Map(
        "map", 
        'https://demotiles.maplibre.org/style.json', 
        [0, 0],
        1);
    
}

window.onload = function() {
    Start();
}