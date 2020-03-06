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


async function get_voting_locations(){
    let result = fetch('./geocode_place_id_cache.json')
        .then(status)
        .then(json)
        .then((data) => {
            console.log(data);
            return data;
        });
    return result;
}

let data = get_voting_locations();
