import Map from "./map_utils.js";
import DataSet from "./dataset.js";

export async function Start(){
    let map = new Map(
        "map", 
        'https://demotiles.maplibre.org/style.json', 
        [0, 0],
        1);
    let data = new DataSet();
    console.log(await data.getCounties());
}

window.onload = async function() {
    await Start();
}