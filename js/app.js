import Map from "./map_utils.js";
import DataSet from "./dataset.js";

export async function Start() {
    let map = new Map(
        "map",
        'https://demotiles.maplibre.org/style.json',
        [0, 0],
        1);
    let data = new DataSet();
    let counties = await data.getCounties();
    let scenarioNames = await data.getScenarioNames();
    console.log(scenarioNames);
    for (const countyName of counties) {
        for (let scenarioName of scenarioNames) {
            let availableDates = await data.getScenarioDates(scenarioName);
            for (let scenarioDate of availableDates) {
                let availablePollingPlaces = await data.getPollingPlaces(scenarioName, scenarioDate, countyName);
                if (availablePollingPlaces.length == 0) {
                    availablePollingPlaces = 'None.'
                }else{
                    availablePollingPlaces = availablePollingPlaces.map((x)=>`"${x['name']}"`);
                }
                console.log(`Scenario ${scenarioName}, ${scenarioDate}, ${countyName}: ${availablePollingPlaces}`);
            }
        }
    }
}

window.onload = async function () {
    await Start();
}