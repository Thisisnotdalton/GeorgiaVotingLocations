import argparse
import time
import os
import json
import pickle
import hashlib
import requests
import pandas as pd
import tqdm
import geopandas as gpd
import bs4

voting_locations_url = 'https://www.mvp.sos.ga.gov/MVP/advancePollPlace.do?'
google_geocode_url = 'https://maps.googleapis.com/maps/api/geocode/json?'
google_places_url = 'https://maps.googleapis.com/maps/api/place/details/json?'
county_source = f"zip://{os.path.abspath('./Census_2010_Counties_Georgia-shp.zip')}!Census_2010_Counties_Georgia.shp"
# source: https://gisdata.fultoncountyga.gov/datasets/GARC::census-2010-counties-georgia


def stable_hash(item: str) -> str:
    hasher = hashlib.sha512()
    hasher.update(item.encode('utf-8'))
    return str(hasher.hexdigest())


def cache_google_place_ids(google_api_key, max_retries=3, delay=0.02):
    cache_directory = 'cache'
    os.makedirs(cache_directory, exist_ok=True)
    errors = []
    geocode_placeid_cache = []
    request_count = 0
    counties = gpd.read_file(county_source)
    counties['idTown'] = counties['OBJECTID_1'].apply(lambda _x: str(_x).zfill(3))
    counties.sort_values(by=['idTown'], inplace=True)
    polling_locations = []

    progress = tqdm.tqdm(counties.iterrows(), total=len(counties))
    for i, county in progress:
        progress.set_description(f"Fetching polling locations for {county['NAME']}.\t Errors:{len(errors)}")
        with requests.get(f'{voting_locations_url}idTown={county["idTown"]}') as response:
            if response.ok:
                places = response.json()
                sorted_places = list(sorted(places, key=lambda _place: _place['pollPlaceName']))
                simplified_places = [{k: v for k, v in place.items() if len(str(v)) > 0} for place in sorted_places]
                postal_sub = f', GA '
                for place in simplified_places:
                    street = place['address1'][:place['address1'].find(',')+1 if ',' in place['address1'] else len(place['address1'])].strip(',.')
                    city = place['address3'][:place['address3'].find(postal_sub)]
                    postal_code = place['address3'][place['address3'].rfind(postal_sub) + len(postal_sub):]
                    place['city'] = city
                    place['formatted_address'] = f'{street}, {city}, GA {postal_code}'

                    cache_file_path = os.path.join('cache', f"{stable_hash(place['pollPlaceName']+county['NAME'])}.pkl")
                    place_stats = None
                    try:
                        if os.path.isfile(cache_file_path):
                            with open(cache_file_path, 'rb') as response_file:
                                place_stats = pickle.load(response_file)
                                assert isinstance(place_stats, tuple) and len(place_stats) == 3
                                place_id, lat, lng = place_stats
                                assert isinstance(place_id, str) and isinstance(lat, float) and isinstance(lng, float)
                    finally:
                        if place_stats is None:
                            attempts = 0
                            geocode_params = dict(key=google_api_key, address=place['formatted_address'])
                            while attempts < max_retries and place_stats is None:
                                with requests.get(google_geocode_url, params=geocode_params) as google_geocode_response:
                                    if google_geocode_response.ok:
                                        request_count += 1
                                        google_geocode_response = google_geocode_response.json()
                                        if google_geocode_response['status'] == 'OK':
                                            results = google_geocode_response['results']
                                            if len(results) > 0:
                                                selected = 0
                                                if len(results) != 1:
                                                    print(f'Unexpected number of results found. Which place is correct for {place["pollPlaceName"]} at {place["formatted_address"]}:')
                                                    for i, result in enumerate(results):
                                                        print(i, '=>', result['geometry']['location'], result, sep='\t')
                                                    selected = input('\nPlease enter integer selection to manually enter a place id or a plus code:')
                                                    try:
                                                        selected = int(selected)
                                                    except:
                                                        if len(selected) > 0:
                                                            geocode_params['address'] = selected
                                                            continue
                                                if selected >= 0:
                                                    place_id = results[selected]['place_id']
                                                    lat = results[selected]['geometry']['location']['lat']
                                                    lng = results[selected]['geometry']['location']['lng']
                                                    place_stats = (place_id, lat, lng)
                                                    with open(cache_file_path, 'wb') as response_file:
                                                        pickle.dump(place_stats, response_file)
                                            time.sleep(delay)
                                if place_stats is None:
                                    print(google_geocode_response)
                                    errors.append(place)
                                    progress.set_description(f'errors:{len(errors)}')
                                    print(f'No place stats found for {place["formatted_address"]}.')
                                    manual = input('Would you like to manually enter a place id? y/n\n').lower()
                                    if 'y' in manual:
                                        place_id = input('Please enter the place id:\n')
                                        with requests.get(google_places_url, params=dict(key=google_api_key, place_id=place_id)) as google_geocode_response:
                                            if google_geocode_response.ok:
                                                request_count += 1
                                                google_geocode_response = google_geocode_response.json()
                                                if google_geocode_response['status'] == 'OK':
                                                    result = google_geocode_response['result']
                                                    lat = result['geometry']['location']['lat']
                                                    lng = result['geometry']['location']['lng']
                                                    place_stats = (place_id, lat, lng)
                                                    with open(cache_file_path, 'wb') as response_file:
                                                        pickle.dump(place_stats, response_file)
                                                    time.sleep(delay)
                                    elif 'n' in manual:
                                        manual = input('Would you like to manually enter an address? y/n\n').lower()
                                        if 'y' in manual:
                                            geocode_params['address'] = input('Please enter the address:\n')

                                attempts += 1

                    if place_stats is not None:
                        place['place_id'] = place_id
                        place['lat'] = lat
                        place['lng'] = lng
                        startEndDate = bs4.BeautifulSoup(place['startAndEndDate'], 'html.parser')
                        dates = list(map(lambda _soup: str(_soup.text) if isinstance(_soup, bs4.Tag) else _soup, startEndDate.children))
                        dates = list(filter(lambda _x: len(_x) > 0, map(lambda _date: _date.strip(' '), dates)))
                        geocode_placeid_cache.append(dict(pollPlaceName=place['pollPlaceName'], googlePlaceID=place_id, dates=dates,
                                                          county=county['NAME'], idTown=county['idTown'],
                                                          lat=lat, lng=lng, address=place['formatted_address'], url=place['googleAddress']))
                county_polling_locations = [place for place in simplified_places if place not in errors]
                print(f'Found {len(county_polling_locations)} for {county["NAME"]}.')
                polling_locations.extend(county_polling_locations)
    places_df = pd.DataFrame(polling_locations)
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

