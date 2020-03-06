import argparse
import time
import os
import json
import pickle
import hashlib
import requests
import pandas as pd
import tqdm
import bs4

voting_locations_url = 'https://www.mvp.sos.ga.gov/MVP/advancePollPlace.do?'
google_geocode_url = 'https://maps.googleapis.com/maps/api/geocode/json?'


def stable_hash(item: str) -> str:
    hasher = hashlib.sha512()
    hasher.update(item.encode('utf-8'))
    return str(hasher.hexdigest())


def cache_google_place_ids(google_api_key):
    cache_directory = 'cache'
    os.makedirs(cache_directory, exist_ok=True)
    errors = []
    geocode_placeid_cache = []
    request_count = 0
    with requests.get(voting_locations_url) as response:
        if response.ok:
            places = response.json()
            sorted_places = list(sorted(places, key=lambda _place: _place['idTown']))
            simplified_places = [{k: v for k, v in place.items() if len(str(v)) > 0} for place in sorted_places]
            postal_sub = f', GA '
            progress = tqdm.tqdm(simplified_places, desc=f'errors:{len(errors)}')
            for place in progress:
                street = place['address1'][:place['address1'].find(',')+1 if ',' in place['address1'] else len(place['address1'])].strip(',.')
                city = place['address3'][:place['address3'].find(postal_sub)]
                postal_code = place['address3'][place['address3'].rfind(postal_sub) + len(postal_sub):]
                place['city'] = city
                place['formatted_address'] = f'{street}, {city}, GA {postal_code}'

                cache_file_path = os.path.join('cache', f"{stable_hash(place['pollPlaceName'])}.pkl")
                place_id = None
                try:
                    if os.path.isfile(cache_file_path):
                        with open(cache_file_path, 'rb') as response_file:
                            place_id = pickle.load(response_file)
                            assert isinstance(place_id, str)
                finally:
                    if place_id is None:
                        with requests.get(google_geocode_url, params=dict(key=google_api_key, address=place['formatted_address'])) as google_geocode_response:
                            request_count += 1
                            response = google_geocode_response.json()
                            if response['status'] == 'OK':
                                place_id = response['results'][0]['place_id']
                                with open(cache_file_path, 'wb') as response_file:
                                    pickle.dump(place_id, response_file)
                                time.sleep(1/40)
                            else:
                                print(response)
                                errors.append(place)
                                progress.set_description(f'errors:{len(errors)}')

                if place_id is not None:
                    place['place_id'] = place_id
                    startEndDate = place['startAndEndDate']
                    startEndDate = bs4.BeautifulSoup(startEndDate, 'html.parser')
                    dates = list(map(lambda _soup: str(_soup.text) if isinstance(_soup, bs4.Tag) else _soup, startEndDate.children))
                    dates = list(filter(lambda _x: len(_x) > 0, map(lambda _date: _date.strip(' '), dates)))
                    geocode_placeid_cache.append(dict(pollPlaceName=place['pollPlaceName'], googlePlaceID=place_id, dates=dates))

            places_df = pd.DataFrame([place for place in simplified_places if place not in errors])
            places_df.to_csv('places.csv')
            print(f'Fetched {len(places_df)} results using {request_count} new placeId requests.')
            geocode_cache_df = pd.DataFrame(geocode_placeid_cache)
            geocode_cache_df.to_csv('geocode_place_id_cache.csv')
            with open('geocode_place_id_cache.json', 'wt') as json_out:
                json.dump(geocode_placeid_cache, json_out, indent=4)

            for error in errors:
                print(f'Cannot find location for {error}.')
            errors = pd.DataFrame(errors)
            errors.to_csv('errors.csv')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('google_api_key', help='Required Google Maps API key for fetching/caching placeIds for later use.')
    args = parser.parse_args()
    cache_google_place_ids(google_api_key=args.google_api_key)
