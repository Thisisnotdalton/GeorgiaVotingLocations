import time
from functools import lru_cache

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
    result = {}
    wait_for_back_button(driver)
    locations = fetch_location_elements(driver)
    return result


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
    for element in driver.find_elements(by=By.CLASS_NAME, value="slds-card"):
        location = dict()
        for property_element in element.find_elements(by=By.CLASS_NAME, value='text-muted'):
            for property_label, property_name in {
                'County': 'county',
                'Election': 'election',
                'LOCATION NAME': 'name',
                'LOCATION ADDRESS': 'address',
                'LOCATION HOURS OF OPERATION': 'schedule'
            }.items():
                if property_label == property_element.text:
                    value_elements = property_element.find_elements(By.XPATH, "following-sibling::*")
                    if len(value_elements) == 1:
                        location[property_name] = value_elements[0].text
                    else:
                        location[property_name] = list(map(lambda _x: _x.text, value_elements))
                    break
        if len(location) > 0:
            location_elements[location['name']] = location
    return location_elements


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


if __name__ == '__main__':
    fetch_early_voting_locations()
