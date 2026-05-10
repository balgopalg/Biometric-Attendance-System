import time
from collections import OrderedDict
from threading import Lock

from app.models.enrollment import get_profiles_for_paper

_MAX_CACHE_ENTRIES = 100
_profile_cache = OrderedDict()
_CACHE_TTL_SECONDS = 30
_CACHE_LOCK = Lock()


def get_profiles_for_paper_cached(paper_id):
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _profile_cache.get(paper_id)
        if entry and now - entry["ts"] < _CACHE_TTL_SECONDS:
            _profile_cache.move_to_end(paper_id)
            return entry["data"]

    data = get_profiles_for_paper(paper_id)

    with _CACHE_LOCK:
        _profile_cache[paper_id] = {"data": data, "ts": now}
        _profile_cache.move_to_end(paper_id)
        while len(_profile_cache) > _MAX_CACHE_ENTRIES:
            _profile_cache.popitem(last=False)

    return data


def invalidate_paper_cache(paper_id=None):
    """Bust the profile cache for a paper, or clear all entries.

    Call this from enrollment/unenrollment write paths so recognition
    picks up changes immediately instead of waiting for TTL expiry.
    """
    with _CACHE_LOCK:
        if paper_id is None:
            _profile_cache.clear()
        else:
            _profile_cache.pop(paper_id, None)
