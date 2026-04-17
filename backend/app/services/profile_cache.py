import time
from app.models.enrollment import get_profiles_for_paper

_profile_cache = {}
_CACHE_TTL_SECONDS = 30

def get_profiles_for_paper_cached(paper_id):
    now = time.monotonic()
    entry = _profile_cache.get(paper_id)
    if entry and now - entry['ts'] < _CACHE_TTL_SECONDS:
        return entry['data']
    data = get_profiles_for_paper(paper_id)
    _profile_cache[paper_id] = {'data': data, 'ts': now}
    return data
