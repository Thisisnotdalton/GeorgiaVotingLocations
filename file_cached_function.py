import os
import pickle
import json
from typing import Callable, Literal
import atexit
from hashlib import sha512


def args_hasher(*args) -> str:
    hasher = sha512()
    for arg in args:
        hasher.update(str(arg).encode('utf-8'))
    return hasher.hexdigest()


def kwargs_hasher(**kwargs) -> str:
    args = [(arg, kwargs.get(arg)) for arg in sorted(kwargs.keys())]
    return args_hasher(*args)


def default_hasher(*args, **kwargs) -> str:
    result = args_hasher(args_hasher(args), kwargs_hasher(**kwargs))
    return result


class FileCachedFunction:
    def __init__(self,
                 function: Callable = None,
                 cache_directory: str = 'cache',
                 parameter_hasher: Callable = default_hasher,
                 cache_format: Literal['json', 'pickle'] = 'json',
                 cache_schedule: Literal['atexit', 'immediate'] = 'immediate',
                 ):
        self.cache_directory = cache_directory
        self.parameter_hasher = parameter_hasher
        self._cache = {}
        self.cache_format = cache_format
        self._modified_cache_queue = []
        self.cache_schedule = cache_schedule
        self.function = function
        if self.cache_schedule == 'atexit':
            atexit.register(self._save_modified_cache_queue)

    def _get_cache_file(self, key: str):
        file_path = os.path.join(self.cache_directory, f'{key}.{self.cache_format}')
        return file_path

    def _load_cache_file(self, file_path: str):
        if self.cache_format == 'pickle':
            with open(file_path, 'rb') as f:
                return pickle.load(f)
        elif self.cache_format == 'json':
            with open(file_path, 'r') as f:
                return json.load(f)

    def _load_cache(self, key: str):
        cache_file_path = self._get_cache_file(key)
        if os.path.isfile(cache_file_path):
            cache = self._load_cache_file(cache_file_path)
            return cache

    def _save_cache_file(self, file_path: str, data):
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        if self.cache_format == 'pickle':
            with open(file_path, 'wb') as f:
                pickle.dump(data, f)
        elif self.cache_format == 'json':
            with open(file_path, 'w') as f:
                json.dump(data, f)

    def _save_cache(self, key: str, value):
        self._cache[key] = value
        cache_file_path = self._get_cache_file(key)
        self._save_cache_file(cache_file_path, value)

    def _save_modified_cache_queue(self):
        while len(self._modified_cache_queue) > 0:
            key = self._modified_cache_queue.pop()
            self._save_cache(key, self[key])

    def __delitem__(self, key: str):
        del self._cache[key]

    def __contains__(self, key: str):
        cache_file_path = self._get_cache_file(key)
        return key in self._cache or os.path.isfile(cache_file_path)

    def __getitem__(self, key: str):
        if key not in self._cache:
            cache_file_path = self._get_cache_file(key)
            if os.path.isfile(cache_file_path):
                self._cache[key] = self._load_cache_file(cache_file_path)
        return self._cache[key]

    def get_key(self, *args, **kwargs) -> str:
        return self.parameter_hasher(*args, **kwargs)

    def clear_cache(self, *args, **kwargs):
        key = self.get_key(*args, **kwargs)
        if key in self:
            del self[key]
        cache_file_path = self._get_cache_file(key)
        if os.path.isfile(cache_file_path):
            os.remove(cache_file_path)

    def __call__(self, *args, **kwargs):
        key = self.parameter_hasher(*args, **kwargs)
        if key not in self:
            result = self.function(*args, **kwargs)
            self._save_cache(key, result)
            self._modified_cache_queue.append(key)
            if self.cache_schedule == 'immediate':
                self._save_modified_cache_queue()
            return result
        return self[key]

    @staticmethod
    def decorate(cache_directory: str = 'cache',
                 parameter_hasher: Callable = default_hasher,
                 cache_format: Literal['json', 'pickle'] = 'json',
                 cache_schedule: Literal['atexit', 'immediate'] = 'immediate'):
        def decorator(function):
            decorated_kwargs = dict(cache_directory=cache_directory, parameter_hasher=parameter_hasher,
                                    cache_format=cache_format, cache_schedule=cache_schedule)
            decorated_kwargs.update(function=function)
            decorated_function = FileCachedFunction(**decorated_kwargs)
            return decorated_function

        return decorator


def main():
    def test_fun(*args, **kwargs):
        result = dict(args=args, **kwargs)
        print(f'Ran function with result: {result}')
        return result

    cached_test_function = FileCachedFunction(test_fun, './cache/test_fun')
    print(cached_test_function('foo'))
    print(cached_test_function('foo', bar='baz'))
    print(cached_test_function(foo='foo', bar='baz'))

    @FileCachedFunction.decorate('./cache/test_fun2')
    def test_fun2(*args, **kwargs):
        result = dict(args=args, **kwargs)
        print(f'Ran other function with result: {result}')
        return result

    print(test_fun2('foo'))
    print(test_fun2('foo', bar='baz'))
    print(test_fun2(foo='foo', bar='baz'))


if __name__ == '__main__':
    main()
