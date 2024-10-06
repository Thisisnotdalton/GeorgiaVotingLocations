import json
import os
import time
import typing
import datetime
from functools import lru_cache
import re

from tqdm import tqdm
from selenium import webdriver
from selenium.common import StaleElementReferenceException
from selenium.webdriver import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys


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

    return driver


def extract_results_from_page(driver) -> dict:
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


def fetch_location_elements(driver):
    location_elements = {}
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
            if location_name in location_elements:
                same_element = True
                for key, value in location_elements[location_name].items():
                    if key == 'schedule':
                        missing_items = set(value).difference(location[key])
                        new_items = set(location[key]).difference(value)
                        if len(missing_items) == 0 and len(new_items) == 0:
                            continue
                        else:
                            location[key] = list(sorted(set(location[key]).union(value)))
                            print(f'Missing in previous: {missing_items}\t New: {new_items}')
                    if value != location[key]:
                        same_element = False
                        print(f'Difference in {location_name} with {key}: \"{value}\" != \"{location[key]}\"')
                        break
                if same_element:
                    print(f'Found duplicate entry for {location_name}')
                    continue
            location_elements[location_name] = location
            print(f'Location #{len(location_elements)}: {location_name} found!')
    return location_elements


@lru_cache()
def get_list_of_counties() -> typing.List[str]:
    result = ['FULTON']
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
    except Exception as e:
        print(f'Failed to get list of counties: {e}. Defaulting to {result}')
    return result


def fetch_early_voting_locations(
        election_id='a0p3d00000LWdF5AAL',
        county='FULTON'):
    parameters = f'page=advpollingplace&election={election_id}&countyName={county}'
    locations_url = f'https://mvp.sos.ga.gov/s/advanced-voting-location-information?{parameters}'
    driver = get_driver()
    driver.implicitly_wait(10)
    driver.get(locations_url)
    time.sleep(3)
    locations = {}
    more_results = True
    pages = 0
    while more_results:
        wait_for_back_button(driver)
        new_locations = extract_results_from_page(driver)
        for k, v in new_locations.items():
            assert k not in locations, f'Duplicate location data found for {k}!'
            locations[k] = v
        more_results = page_has_more_results(driver)
        pages += 1
        print(f'Scanned {pages} pages for county {county}')
        if more_results:
            print(f'Advancing to next page for county {county}')
            advance_to_next_page(driver)
    return locations


def fetch_and_cache_voting_locations(
        election_id='a0p3d00000LWdF5AAL',
        county='FULTON', output_directory: str = 'voting_locations'):
    election_directory = os.path.join(output_directory, election_id)
    os.makedirs(election_directory, exist_ok=True)
    output_file = os.path.join(election_directory, f'voting_locations_{county}.json')
    locations = None
    if os.path.exists(output_file):
        try:
            with open(output_file, 'rt') as in_file:
                locations = json.load(in_file)
        except Exception as e:
            print(f'Failed to load cached locations file for county {county} due to exception: {e}')
    if locations is None:
        locations = fetch_early_voting_locations(election_id, county)
        with open(output_file, 'wt') as out_file:
            json.dump(locations, out_file, indent=4, sort_keys=True)
    return locations


def aggregate_county_voting_locations(election_id='a0p3d00000LWdF5AAL',
                                      output_directory: str = 'voting_locations'):
    election_directory = os.path.join(output_directory, election_id)
    os.makedirs(election_directory, exist_ok=True)
    all_locations_file = os.path.join(election_directory, 'all_voting_locations.json')
    all_locations = {}
    if os.path.exists(all_locations_file):
        try:
            with open(all_locations_file, 'rt') as in_file:
                all_locations = json.load(in_file)
        except Exception as e:
            print(f'Failed to load all voting locations for election {election_id} due to exception: {e}')
    if len(all_locations) == 0:
        for county in get_list_of_counties():
            all_locations[county] = fetch_and_cache_voting_locations(election_id, county, output_directory)
        with open(all_locations_file, 'wt') as out_file:
            json.dump(all_locations, out_file, indent=4, sort_keys=True)
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
            for location_name, location_data in locations.items():
                if is_location_open_on_datetime(location_data, day, time_filter):
                    county_results.append(location_name)
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
        while start_date <= end_date:
            results[scenario_name][start_date.isoformat()] = filter_voting_locations_by_datetime(
                all_county_voting_locations, start_date, os.path.join(scenario_directory, f'{start_date.isoformat()}.json'), time_filter
            )
            start_date += datetime.timedelta(days=1)
    return results


def main(scenarios_file_path: str = 'scenarios.json', output_directory: str = 'voting_location_scenarios'):
    all_county_voting_locations = aggregate_county_voting_locations()
    with open(scenarios_file_path, 'rt') as in_file:
        scenarios = json.load(in_file)
    generate_voting_location_subsets(all_county_voting_locations, scenarios, output_directory)


if __name__ == '__main__':
    main()
