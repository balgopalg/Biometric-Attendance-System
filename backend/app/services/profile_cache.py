import time
from collections import OrderedDict
from app.models.enrollment import get_profiles_for_paper

_MAX_CACHE_ENTRIES = 100
_profile_cache = OrderedDict()
_CACHE_TTL_SECONDS = 30


def get_profiles_for_paper_cached(paper_id):
    now = time.monotonic()
    entry = _profile_cache.get(paper_id)
    if entry and now - entry['ts'] < _CACHE_TTL_SECONDS:
        _profile_cache.move_to_end(paper_id)
        return entry['data']
    data = get_profiles_for_paper(paper_id)
    _profile_cache[paper_id] = {'data': data, 'ts': now}
    _profile_cache.move_to_end(paper_id)
    while len(_profile_cache) > _MAX_CACHE_ENTRIES:
        _profile_cache.popitem(last=False)
    return data
