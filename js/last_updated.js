import {JSONCache} from "./dataset.js";

const github_repo_owner = 'thisisnotdalton';
const github_repo_name = 'GeorgiaVotingLocations';
const url = `https://api.github.com/repos/${github_repo_owner}/${github_repo_name}/branches/master`;
const lastUpdatedElementID = "lastUpdated";

export async function getLastUpdated() {
    let cache = new JSONCache();
    let commitProperties = await cache.getJSON(url);
    let lastUpdatedElement = document.getElementById(lastUpdatedElementID);
    if (lastUpdatedElement) {
        let commitURL = commitProperties.commit.html_url;
        let commitDate = commitProperties.commit.commit.author.date;
        commitDate = new Date(Date.parse(commitDate));
        commitDate = commitDate.toDateString();
        lastUpdatedElement.innerHTML = commitDate;
        lastUpdatedElement.href = commitURL;
    }
}

export default getLastUpdated;