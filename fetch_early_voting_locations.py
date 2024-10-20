import json
import os
import time
import typing
import datetime
from functools import lru_cache
import re

from tqdm import tqdm
from selenium.common import StaleElementReferenceException
from selenium.webdriver import ActionChains
from selenium.webdriver.common.by import By
import pandas as pd
import geopandas as gpd
from shapely import box

from mapbox_geocode import geocode_address


@lru_cache()
def get_driver(browser: str = 'firefox'):
    if browser == 'chromium':
        from selenium import webdriver
        from selenium.webdriver.chrome.service import Service as ChromiumService
        from webdriver_manager.chrome import ChromeDriverManager
        from webdriver_manager.core.os_manager import ChromeType

        driver = webdriver.Chrome(
            service=ChromiumService(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install()))
    elif browser == 'firefox':
        from selenium import webdriver
        from selenium.webdriver.firefox.service import Service as FirefoxService
        from webdriver_manager.firefox import GeckoDriverManager

        driver = webdriver.Firefox(service=FirefoxService(GeckoDriverManager().install()))
    else:
        from selenium import webdriver
        from selenium.webdriver.chrome.service import Service as ChromeService
        from webdriver_manager.chrome import ChromeDriverManager
        driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()))
    import atexit
    atexit.register(driver.close)
    return driver


def extract_results_from_page(driver) -> typing.List[dict]:
    wait_for_back_button(driver)
    locations = fetch_location_elements(driver)
    return locations


def get_buttons(driver):
    return driver.find_elements(by=By.CLASS_NAME, value="slds-button")


def get_button_with_text(driver, text: str = 'NEXT', ignore_disabled: bool = True):
    for button in get_buttons(driver):
        try:
            if button.text == text:
                if ignore_disabled and button.get_attribute('aria-disabled') == 'true':
                    continue
                return button
        except StaleElementReferenceException:
            return None


def get_enabled_next_button(driver):
    return get_button_with_text(driver, text='NEXT')


def get_enabled_back_button(driver):
    return get_button_with_text(driver, text='BACK')


def is_element_visible_in_viewpoint(driver, element) -> bool:
    return element.is_displayed()


def advance_to_next_page(driver):
    button = None
    while button is None:
        button = get_enabled_next_button(driver)
        if not page_has_more_results(driver):
            print('No more results can be found')
            return
    assert button is not None, f'No next page button found!'
    while not is_element_visible_in_viewpoint(driver, button):
        ActionChains(driver).move_to_element(button).perform()
    for attempt in range(3):
        try:
            button.click()
            return
        except:
            pass


def wait_for_back_button(driver):
    found_back_button_enabled = False
    while not found_back_button_enabled:
        time.sleep(1)
        found_back_button_enabled = get_enabled_back_button(driver) is not None


def page_has_more_results(driver) -> bool:
    try:
        next_button = get_enabled_next_button(driver)
        back_button = get_enabled_back_button(driver)
        return back_button is None or next_button is not None
    except Exception as e:
        return True  # still loading


def fetch_location_elements(driver) -> typing.List[dict]:
    location_elements = []
    property_names = {
        'County': 'county',
        'Election': 'election',
        'LOCATION NAME': 'name',
        'LOCATION ADDRESS': 'address',
        'LOCATION HOURS OF OPERATION': 'schedule'
    }
    polling_place_results = driver.find_elements(by=By.TAG_NAME, value='c-vr-wi-adv-polling-place-result')
    assert len(polling_place_results) == 1, f'{len(polling_place_results)} polling place results found!'
    potential_location_elements = polling_place_results[0].find_elements(by=By.CLASS_NAME, value="slds-button")
    potential_location_elements = list(
        filter(lambda _x: _x.text == 'DIRECTIONS TO POLLING PLACE', potential_location_elements))
    for element in tqdm(potential_location_elements):
        potential_element = element
        for parent_attempt in range(3):
            if potential_element.get_attribute('class') != 'slds-card':
                potential_element = potential_element.find_element(By.XPATH, "..")
            else:
                break
        location = dict()
        element = potential_element
        for property_element in element.find_elements(by=By.CLASS_NAME, value='text-muted'):
            output_property_name = property_names.get(property_element.text)
            if output_property_name is not None:
                value_elements = property_element.find_elements(By.XPATH, "following-sibling::*")
                if len(value_elements) == 1 and output_property_name != 'schedule':
                    location[output_property_name] = value_elements[0].text
                else:
                    location[output_property_name] = list(map(lambda _x: _x.text, value_elements))
        if len(location) == len(property_names):
            location_name = location['name']
            location_elements.append(location)
            print(f'Location #{len(location_elements)}: {location_name} found!')
    return location_elements


@lru_cache()
def get_list_of_counties(cache_file: str = 'counties.json') -> typing.List[str]:
    result = ['FULTON']
    if os.path.isfile(cache_file):
        with open(cache_file, 'r') as f:
            result = json.load(f)
        if len(result) > 0:
            return result
    try:
        locations_url = 'https://mvp.sos.ga.gov/s/advanced-voting-location-information'
        driver = get_driver()
        driver.implicitly_wait(10)
        driver.get(locations_url)
        polling_places = driver.find_element(by=By.TAG_NAME, value='c-vr-wi-adv-voting-location-info')
        for attempt in range(3):
            try:
                county_dropdown_button = polling_places.find_element(by=By.XPATH,
                                                                     value='//button[@aria-label="County Name"]')
                county_dropdown_button.click()
                break
            except Exception as e:
                time.sleep(3)
        county_dropdown_element = polling_places.find_element(by=By.XPATH, value='//div[@aria-label="County Name"]')
        for attempt in range(3):
            if len(county_dropdown_element.text) == 0:
                time.sleep(3)
        result = county_dropdown_element.text.split('\n')
        with open(cache_file, 'w') as f:
            json.dump(result, f)
    except Exception as e:
        print(f'Failed to get list of counties: {e}. Defaulting to {result}')
    return result


def fetch_early_voting_locations(
        election_id='',
        county='FULTON'):
    parameters = f'page=advpollingplace&election={election_id}&countyName={county}'
    locations_url = f'https://mvp.sos.ga.gov/s/advanced-voting-location-information?{parameters}'
    driver = get_driver()
    driver.implicitly_wait(10)
    driver.get(locations_url)
    time.sleep(3)
    locations = []
    more_results = True
    pages = 0
    while more_results:
        wait_for_back_button(driver)
        new_locations = extract_results_from_page(driver)
        locations.extend(new_locations)
        more_results = page_has_more_results(driver)
        pages += 1
        print(f'Scanned {pages} pages for county {county}')
        if more_results:
            print(f'Advancing to next page for county {county}')
            advance_to_next_page(driver)
    locations_dict = {}
    for i, location in enumerate(locations):
        locations_dict[f'{i}-{location["name"]}'] = location
    return locations


address_re = re.compile(r'(?P<address_number>[\da-zA-Z]*)\s+(?P<street>[^,]+)((,[^,]+,)|,)\s*(?P<place>[A-Za-z\s.]+)$')
postcode_re = re.compile(r'\s+(\d+[- ]?\d*)$')


def geocode_location(location: dict):
    address = location['address'].strip().replace('\n', ', ')
    postcode = postcode_re.search(address).group(1)
    assert len(postcode) > 0, f'Failed to parse postcode: {address}'
    address = address[:-len(postcode)].strip()
    while address.endswith(','):
        address = address.rstrip(',')
    assert str(address).lower().endswith(' ga'), f'Failed to parse state for address: {address}!'
    region = 'GA'
    address = address[:-len(region)].strip()
    while address.endswith(','):
        address = address.rstrip(',')
    address_components = address_re.search(address)
    address += f', {region}, {postcode}'
    if address_components:
        address_query = dict(
            address_number=address_components.group('address_number'),
            street=address_components.group('street'),
            place=address_components.group('place'),
            postcode=postcode,
            country='United States',
            region=region
        )
    else:
        address_query = address
    location['address'] = address
    result = geocode_address(address_query, f'Geocoding polling location "{location["name"]}".', interactive=True)
    if isinstance(result, dict) and result.get('geometry', {}).get('coordinates'):
        coordinates = result['geometry']['coordinates']
        location['lng'] = coordinates[0]
        location['lat'] = coordinates[1]


def geocode_locations(locations: typing.List[dict], county_name: str = '', max_attempts: int = 3,
                      retry_delay: float = 3) -> bool:
    updated_geocodes = False
    needs_geocode = list(range(len(locations)))
    for i in tqdm(needs_geocode, desc=f'Geocoding locations for {county_name}'):
        location = locations[i]
        needs_geocode = 'lat' not in location or 'lng' not in location
        if needs_geocode:
            for attempt in range(max_attempts):
                try:
                    geocode_location(location)
                    if 'lat' in location and 'lng' in location:
                        updated_geocodes = True
                        break
                except Exception as e:
                    print(f'Failed to geocode {location["name"]} due to exception: {e}')
                time.sleep(retry_delay)
    return updated_geocodes


def fetch_and_cache_voting_locations(
        election_id='a0p3d00000LWdF5AAL',
        county='FULTON', output_directory: str = 'voting_locations'):
    os.makedirs(output_directory, exist_ok=True)
    json_directory = os.path.join(output_directory, 'json')
    output_file = os.path.join(json_directory, f'{county}.json')
    locations = None
    if os.path.exists(output_file):
        try:
            with open(output_file, 'rt') as in_file:
                locations = json.load(in_file)
        except Exception as e:
            print(f'Failed to load cached locations file for county {county} due to exception: {e}')
    if locations is None or len(locations) == 0:
        locations = fetch_early_voting_locations(election_id, county)
    updated_dataset = geocode_locations(locations, county) or locations is None
    if updated_dataset:
        with open(output_file, 'wt') as out_file:
            json.dump(locations, out_file, indent=4, sort_keys=True)
    return locations


ALL_LOCATIONS_ID = 'ALL_COUNTIES'


def aggregate_county_voting_locations(election_id='',
                                      output_directory: str = 'voting_locations'):
    os.makedirs(output_directory, exist_ok=True)
    all_locations_file = os.path.join(output_directory, 'json', f'{ALL_LOCATIONS_ID}.json')
    all_locations = {}
    if os.path.exists(all_locations_file):
        try:
            with open(all_locations_file, 'rt') as in_file:
                all_locations = json.load(in_file)
        except Exception as e:
            print(f'Failed to load all voting locations for election {election_id} due to exception: {e}')
    if len(all_locations) == 0:
        for county in get_list_of_counties(os.path.join(output_directory, 'counties.json')):
            all_locations[county] = fetch_and_cache_voting_locations(election_id, county, output_directory)
        with open(all_locations_file, 'wt') as out_file:
            json.dump(all_locations, out_file, indent=4, sort_keys=True)
    geojson_directory = os.path.join(output_directory, 'geojson')
    all_locations_geojson_file = os.path.join(geojson_directory, f'{ALL_LOCATIONS_ID}.geojson')
    all_locations_list = []
    for county in get_list_of_counties(os.path.join(output_directory, 'counties.json')):
        all_locations_list.extend(all_locations[county])
    os.makedirs(geojson_directory, exist_ok=True)
    all_locations_gdf = []
    for county in get_list_of_counties(os.path.join(output_directory, 'counties.json')):
        county_locations_gdf = generate_polling_place_gdf(all_locations[county])
        if len(county_locations_gdf) > 0:
            county_geojson_file = os.path.join(geojson_directory, f'{county}.geojson')
            county_locations_gdf.to_file(county_geojson_file, driver='GeoJSON')
            all_locations_gdf.append(county_locations_gdf)
    all_locations_gdf = gpd.GeoDataFrame(pd.concat(all_locations_gdf))
    all_locations_gdf.to_file(all_locations_geojson_file, driver='GeoJSON')
    all_locations[ALL_LOCATIONS_ID] = all_locations_list
    return all_locations


schedule_regex = re.compile(r'(?P<start>\d\d/\d\d/\d{4})\s*-\s*(?P<end>\d\d/\d\d/\d{4})\s*'
                            r'(?P<start_time>\d+:\d+\s*[APap][Mm])'
                            r'\s*-\s*'
                            r'(?P<end_time>\d+:\d+\s*[APap][Mm])')


def parse_date(date_string: str) -> datetime.date:
    month, day, year = list(map(int, date_string.split('/')))
    return datetime.date(year, month, day)


def parse_time(time_string: str) -> datetime.time:
    hour = int(time_string.split(':')[0])
    if hour != 12 and 'pm' in time_string.lower():
        hour += 12
    minute = int(time_string.split(':')[1][:2])
    result = datetime.time(hour=hour, minute=minute)
    return result


def is_location_open_on_datetime(location: dict, day: datetime.date, time_filter: datetime.time) -> bool:
    assert isinstance(location.get('schedule'), list), f'No schedule found for location: {location["name"]}'
    for time_span_text in location['schedule']:
        schedule = schedule_regex.search(time_span_text)
        start = parse_date(schedule.group('start'))
        end = parse_date(schedule.group('end'))
        if not (start <= day <= end):
            continue
        if time_filter is None:
            return True
        start_time = parse_time(schedule.group('start_time'))
        end_time = parse_time(schedule.group('end_time'))
        if start_time <= time_filter <= end_time:
            return True
    return False


def filter_voting_locations_by_datetime(all_county_voting_locations: dict,
                                        day: datetime.date, out_file_path: str, time_filter: datetime.time = None):
    results = {}
    file_exists = False
    if os.path.isfile(out_file_path):
        try:
            with open(out_file_path, 'rt') as in_file:
                results = json.load(in_file)
            file_exists = True
        except Exception as e:
            print(f'Failed to load cached filtered locations from {out_file_path} due to exception: {e}')
    if len(results) == 0:
        for county, locations in all_county_voting_locations.items():
            county_results = []
            for i, location_data in enumerate(locations):
                if is_location_open_on_datetime(location_data, day, time_filter):
                    county_results.append(i)
            if len(county_results) > 0:
                results[county] = county_results
    if not file_exists:
        with open(out_file_path, 'wt') as out_file:
            json.dump(results, out_file, indent=4, sort_keys=True)
    return results


def generate_voting_location_subsets(all_county_voting_locations: dict, scenarios: dict, output_directory: str):
    results = {}
    os.makedirs(output_directory, exist_ok=True)
    for scenario_name, scenario_options in scenarios.items():
        results[scenario_name] = {}
        scenario_directory = os.path.join(output_directory, scenario_name)
        os.makedirs(scenario_directory, exist_ok=True)
        start_date = datetime.date.fromisoformat(scenario_options['start_date'])
        end_date = datetime.date.fromisoformat(scenario_options['end_date'])
        time_filter = scenario_options.get('time_filter')
        if isinstance(time_filter, str):
            time_filter = parse_time(time_filter)
        scenario_times = {}
        while start_date <= end_date:
            open_polls = filter_voting_locations_by_datetime(
                all_county_voting_locations, start_date,
                os.path.join(scenario_directory, f'{start_date.isoformat()}.json'), time_filter
            )
            if len(open_polls) > 0:
                scenario_times[start_date.isoformat()] = open_polls
            start_date += datetime.timedelta(days=1)
        results[scenario_name]['times'] = scenario_times
        results[scenario_name]['info'] = scenario_options['info']
    with open(os.path.join(output_directory, 'scenarios.json'), 'wt') as out_file:
        json.dump(results, out_file, indent=4)
    return results


def generate_polling_place_gdf(county_voting_locations: list) -> gpd.GeoDataFrame:
    data = {}
    expected_columns = ['address', 'county', 'election', 'lat', 'lng', 'name', 'schedule']
    for i, location in enumerate(county_voting_locations):
        data[i] = {
            k: location.get(k) for k in expected_columns
        }
        schedule_line_indices = {}
        schedule_lines = []
        for j, line in enumerate(data[i]['schedule']):
            if schedule_line_indices.get(line) is None:
                schedule_line_indices[line] = j
                schedule_lines.append(line)
        data[i]['schedule'] = '\n'.join(schedule_lines)
    data = pd.DataFrame.from_dict(data, orient='index')
    if len(county_voting_locations) > 0:
        for column in expected_columns:
            if column not in data:
                data.loc[:, column] = None
        data = gpd.GeoDataFrame(data, geometry=gpd.points_from_xy(data.lng, data.lat), crs='EPSG:4326')
    else:
        data = gpd.GeoDataFrame()
    return data


@lru_cache()
def get_state_fips_codes(state_name_column='Name', usps_column='Official USPS Code',
                         state_fips_column='FIPS State Numeric Code'):
    # data fetched from https://www.census.gov/library/reference/code-lists/ansi/ansi-codes-for-states.html
    state_fips_codes = pd.read_csv('./inputs/states_fips_codes.csv')
    for column in [state_name_column, usps_column, state_fips_column]:
        assert column in state_fips_codes.columns, f'Missing column {column}'
    state_name_lookup_table = {}
    usps_lookup_table = {}
    for _, row in state_fips_codes.iterrows():
        state_name_lookup_table[row[state_name_column].lower()] = row[state_fips_column]
        usps_lookup_table[row[usps_column].lower()] = row[state_fips_column]
    return state_name_lookup_table, usps_lookup_table


@lru_cache()
def get_state_fips(state_name: str = None, state_usps: str = None) -> dict:
    assert state_name or state_usps, 'State name or USPS code must be specified!'
    result = None
    state_name_lookup_table, usps_lookup_table = get_state_fips_codes()
    if state_name is not None:
        state_name = state_name.lower()
        assert state_name in state_name_lookup_table, f'No state could be found with name {state_name}!'
        result = state_name_lookup_table[state_name]
    if state_usps is not None:
        state_usps = state_usps.lower()
        assert state_usps in usps_lookup_table, f'No state could be found with USPS {state_usps}!'
        if result is None:
            result = usps_lookup_table[state_usps]
        else:
            assert usps_lookup_table[state_usps] == result, \
                f'Received conflicting state FIPS codes for name {state_name} and USPS code {state_usps}!'
    return result


def get_state_county_boundaries(state: str = 'Georgia') -> gpd.GeoDataFrame:
    # data fetched from https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html
    national_county_boundary_file = './inputs/cb_2018_us_county_500k.zip' #!cb_2018_us_county_500k.shp'
    assert os.path.isfile(national_county_boundary_file), 'Cannot find national county boundary file!'
    statefp_filter = str(get_state_fips(state_name=state))
    gdf = gpd.read_file(national_county_boundary_file)
    gdf = gdf.loc[gdf['STATEFP'] == statefp_filter, ['NAME', 'geometry']]
    gdf.loc[:, 'name'] = gdf.loc[:, 'NAME']
    gdf.loc[:, 'NAME'] = gdf.loc[:, 'NAME'].apply(lambda _x: str(_x).upper().replace(' ',''))
    state_bounds = gpd.GeoDataFrame(pd.DataFrame(data=[dict(NAME='', geometry=gdf.geometry.union_all())]))
    gdf = gpd.GeoDataFrame(pd.concat([gdf, state_bounds]))
    gdf.loc[:, 'lng'] = gdf.geometry.centroid.x
    gdf.loc[:, 'lat'] = gdf.geometry.centroid.y
    return gdf


def save_state_county_boundaries(state: str = 'Georgia', output_directory: str = 'data'):
    county_boundaries_directory = os.path.join(output_directory, 'county_boundaries')
    os.makedirs(county_boundaries_directory, exist_ok=True)
    output_file = os.path.join(county_boundaries_directory, f'{state}.geojson')
    if not os.path.isfile(output_file):
        state_counties = get_state_county_boundaries(state)
        state_counties.to_file(output_file)
    state_counties = get_state_county_boundaries(state)
    output_file = os.path.join(county_boundaries_directory, f'{state}_bounds.json')
    if not os.path.isfile(output_file):
        state_bounding_boxes = state_counties.apply(lambda _x: {_x['NAME']: box(*_x['geometry'].bounds).bounds}, axis=1)
        state_bounds = {}
        for bbox in state_bounding_boxes:
            state_bounds.update(bbox)
        with open(output_file, 'w') as f:
            json.dump(state_bounds, f, indent=4)
    output_file = os.path.join(county_boundaries_directory, f'{state}_centroids.geojson')
    if not os.path.isfile(output_file):
        state_counties = state_counties.set_geometry(state_counties.geometry.centroid)
        state_counties.to_file(output_file)


def check_polling_locations_against_boundaries(polling_places: gpd.GeoDataFrame, boundaries: gpd.GeoDataFrame) -> dict:
    errors = {}
    counties = list(sorted(polling_places['county'].unique()))
    for county in counties:
        points = polling_places.loc[polling_places.county == county]
        boundary = boundaries.loc[boundaries.NAME == county].union_all()
        error_points = points.loc[~points.geometry.intersects(boundary)]
        if len(error_points) > 0:
            print(f'There are {len(error_points)} points for county {county} that fall outside of the county bounds!')
            errors[county] = error_points
    return errors


def spatially_check_polling_places(output_directory: str = 'data', state: str = 'Georgia'):
    all_counties_gdf = gpd.read_file(os.path.join(output_directory, 'geojson', f'{ALL_LOCATIONS_ID}.geojson'))
    all_counties_boundaries_gdf = gpd.read_file(os.path.join(output_directory, 'county_boundaries', f'{state}.geojson'))
    errors = check_polling_locations_against_boundaries(all_counties_gdf, all_counties_boundaries_gdf)
    errors_file_path = os.path.join(output_directory, f'errors.geojson')
    if len(errors) > 0:
        all_errors = []
        for county in sorted(errors.keys()):
            all_errors.append(errors[county])
        all_errors = pd.concat(all_errors)
        all_errors = gpd.GeoDataFrame(all_errors)
        all_errors.to_file(errors_file_path)
        print(f'There were {len(all_errors)} polling places which did not intersect with their county bounds!')
    else:
        if os.path.isfile(errors_file_path):
            os.remove(errors_file_path)
        print('All polling places intersect their county bounds.')




def main(scenarios_file_path: str = 'scenarios.json', state='Georgia',
         election_id='a0p3d00000LWdF5AAL', output_directory: str = 'data'):
    election_output_directory = os.path.join(output_directory, election_id)
    all_county_voting_locations = aggregate_county_voting_locations(election_id=election_id,
                                                                    output_directory=election_output_directory)
    with open(scenarios_file_path, 'rt') as in_file:
        scenarios = json.load(in_file)
    scenarios = generate_voting_location_subsets(all_county_voting_locations, scenarios,
                                                 output_directory=os.path.join(election_output_directory, 'scenarios'))
    save_state_county_boundaries(output_directory=election_output_directory, state=state)
    spatially_check_polling_places(output_directory=election_output_directory, state=state)


if __name__ == '__main__':
    main()
