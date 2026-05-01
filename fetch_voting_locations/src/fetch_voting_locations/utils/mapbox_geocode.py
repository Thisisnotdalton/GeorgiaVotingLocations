import json
import os
import time
import typing
from configparser import ConfigParser
from argparse import ArgumentParser
from datetime import datetime, timedelta
from functools import lru_cache

import requests
import pandas as pd

from file_cached_function import FileCachedFunction, kwargs_hasher


@lru_cache
def get_mapbox_api_config(config_file: str = 'mapbox_config.ini') -> str:
    config = ConfigParser()
    config.add_section('mapbox')
    config.set('mapbox', 'token', '')
    config.set('mapbox', 'rate_limit_per_minute', '1000')
    if os.path.exists(config_file):
        print(f'Loaded MapBox configuration file: {config_file}')
        config.read(config_file)
    else:
        with open(config_file, 'w') as f:
            config.write(f)
        print(f'Created blank MapBox configuration file: {config_file}')
    return config


@lru_cache()
def get_mapbox_api_token():
    return get_mapbox_api_config()['mapbox']['token']


@lru_cache()
def get_mapbox_rate_limit():
    return 60 / float(get_mapbox_api_config()['mapbox']['rate_limit_per_minute'])


STRUCTURED_ADDRESS_KWARGS = [
    'address_number', 'street', 'block', 'place', 'region', 'postcode',
    'locality', 'neighborhood', 'country'
]


def mapbox_geocode_parameters_hasher(*args, **kwargs):
    assert len(args) == 0, f'Only kwargs are supported! Received unnamed args: {args}!'
    filtered_kwargs = {
        k: kwargs.get(k) for k in [
            'query', 'autocomplete', 'bbox', 'country', 'language', 'limit', 'proximity', 'types', 'worldview', 'url',
            *STRUCTURED_ADDRESS_KWARGS
        ]
    }
    return kwargs_hasher(**filtered_kwargs)


_next_request_time = datetime.now()


@FileCachedFunction.decorate('./mapbox_geocode_cache/', parameter_hasher=mapbox_geocode_parameters_hasher)
def mapbox_geocode(access_token: str = None, query: str = None, address_number: str = None, street: str = None,
                   block: str = None, place: str = None, region: str = None, postcode: str = None,
                   locality: str = None, neighborhood: str = None, country: str = None,
                   autocomplete: bool = False, bbox: typing.Tuple[float, float, float, float] = None,
                   language: str = None, limit: int = 5, proximity: str = None,
                   types: str = None, worldview: str = 'us', request_delay_seconds: float = None,
                   url='https://api.mapbox.com/search/geocode/v6/forward') -> dict:
    if access_token is None:
        access_token = get_mapbox_api_token()

    global _next_request_time
    while datetime.now() < _next_request_time:
        time.sleep((_next_request_time - datetime.now()).seconds)
    if request_delay_seconds is None:
        request_delay_seconds = get_mapbox_rate_limit()
    if request_delay_seconds > 0:
        _next_request_time = datetime.now() + timedelta(seconds=request_delay_seconds)
    assert isinstance(access_token, str) and len(access_token) > 0, \
        f'No access token provided for MapBox Geocoding API!'
    parameters = dict(access_token=access_token, permanent='true', format='geojson', types='address')
    if isinstance(query, str) and len(query) > 0:
        parameters['q'] = query
    else:
        parameters.update(
            address_number=address_number, street=street, block=block, place=place, region=region,
            postcode=postcode, locality=locality, neighborhood=neighborhood
        )
    parameters.update(
        autocomplete=str(autocomplete).lower(), bbox=bbox, country=country, language=language,
        limit=limit, proxy=proximity, types=types, worldview=worldview
    )

    with requests.get(url, params=parameters) as response:
        assert response.ok, f'Request not okay: {response.text}'
        result = response.json()
        return result


@FileCachedFunction.decorate('./manual_address_selections_cache/')
def manually_choose_geocode(address: str, results: list, comment: str = '') -> list:
    while len(results) > 1:
        print(f'Unable to determine single match for location at address: {address}.')
        if isinstance(comment, str) and len(comment) > 0:
            print(comment)
        for i, result in enumerate(results):
            position = result['geometry']['coordinates']
            url = f"https://www.latlong.net/c/?lat={position[1]}&long={position[0]}"
            match_code = result['properties'].get('match_code', {})
            match_str = ''
            if match_code:
                match_str = f"\tConfidence: {match_code.get('confidence', 'N/A')}. Matches: "
                matching_keys = []
                for key in sorted(match_code.keys()):
                    if match_code[key] == 'matched':
                        matching_keys.append(key)
                match_str += ','.join(matching_keys)
            full_address = result['properties'].get('full_address', 'MISSING!')
            print(f'{i}:\t{full_address}{match_str}:\t{url}')
        chosen = input(' Please pick an option as numbered (or -1 to manually enter a new address): ')
        try:
            chosen = int(chosen)
            if chosen >= 0:
                results = [results[chosen]]
                continue
            new_address = input('Please enter a new address: ')
            new_address = json.loads(new_address)
            results = [geocode_address(new_address, interactive=True)]
        except Exception as e:
            print(f'Error: {e}')
    return results

def geocode_address(address: typing.Union[str, dict], comment: str = None, interactive: bool = False) -> typing.Tuple[
    float, float]:
    if isinstance(address, dict):
        address = dict(address)
        if isinstance(address.get('postcode'), str):
            address['postcode'] = address['postcode'].replace(' ', '-')
            if len(address['postcode']) > 5 and address['postcode'].endswith('-0000'):
                address['postcode'] = address['postcode'][:-5]
        kwargs = {
            k: address.get(k) for k in set(address.keys()).intersection(STRUCTURED_ADDRESS_KWARGS)
        }
    elif isinstance(address, str):
        kwargs = dict(query=address)
    else:
        raise ValueError(f'Address must be a string query or a dictionary with keys: {STRUCTURED_ADDRESS_KWARGS}.')
    response = mapbox_geocode(**kwargs)
    assert isinstance(response, dict) and isinstance(response.get('features'),
                                                     list), f'Could not determine features from response: {response}'
    results = list(response['features'])
    assert len(results) > 0, f'Failed to find results for {address}.'
    if len(results) > 1:
        only_exact_results = list(
            filter(lambda _x: _x['properties'].get('match_code', {}).get('confidence', 'low') == 'exact', results))
        if 0 < len(only_exact_results) < len(results):
            print('Dropping non exact matches.')
            results = only_exact_results
    if len(results) > 1:
        keep_only_postcode_results = list(
            filter(lambda _x: _x['properties'].get('match_code', {}).get('postcode') == 'matched', results))
        if 0 < len(keep_only_postcode_results) < len(results):
            print('Dropping matches with postcode mismatch.')
            results = keep_only_postcode_results
    if len(results) > 1:
        dropped_low_confidence_results = list(
            filter(lambda _x: _x['properties'].get('match_code', {}).get('confidence', '') != 'low', results))
        if 0 < len(dropped_low_confidence_results) < len(results):
            print('Dropping low confidence matches.')
            results = dropped_low_confidence_results
    if len(results) > 1:
        keep_only_high_results = list(
            filter(lambda _x: _x['properties'].get('match_code', {}).get('confidence') != 'high', results))
        if 0 < len(keep_only_high_results) < len(results):
            print('Dropping matches with less than high confidence.')
            results = keep_only_high_results
    if interactive and len(results) > 1:
        if isinstance(address, dict):
            address_str = ''
            for k in sorted(address.keys()):
                address_str += f'{k}={address[k]},'
        else:
            address_str = str(address)
        results = manually_choose_geocode(address_str, results, comment)
    assert len(results) == 1, f'Failed to reduce results to 1 for {address}.'
    return results[0]


def main():
    arg_parser = ArgumentParser()
    arg_parser.add_argument('--input-file', type=str, default='',
                            help='Input csv file of addresses to geocode.')
    arg_parser.add_argument('--output-file', type=str, default='',
                            help='Output csv file to save geocoded addresses to.')
    arg_parser.add_argument('--address-column', type=str, default='address',
                            help='The column in the input csv which holds the address to geocode; defaults to "address"')
    arg_parser.add_argument('--lat-column', type=str, default='lat',
                            help='The column to store the geocoded latitude in; defaults to "lat".')
    arg_parser.add_argument('--lng-column', type=str, default='lng',
                            help='The column to store the geocoded longitude in; defaults to "lng".')
    args = arg_parser.parse_args()
    assert len(args.input_file) > 0, 'Input csv file path is empty!'
    assert os.path.isfile(args.input_file), 'Input csv file does not exist!'

    addresses = pd.read_csv(args.input_file)
    assert isinstance(addresses, pd.DataFrame) and len(addresses) > 0, 'No addresses in input file!'
    assert (isinstance(args.address_column, str) and len(args.address_column) > 0
            and args.address_column in addresses.columns), f'Address column is invalid!'
    assert len(args.output_file) > 0, f'Output csv file path is empty!'
    for row_index, row in addresses.iterrows():
        result = geocode_address(row[args.address_column])
        addresses.at[row_index, args.lat_column] = result[0]
        addresses.at[row_index, args.lng_column] = result[1]
    addresses.to_csv(args.output_file, index=False)


if __name__ == '__main__':
    main()
