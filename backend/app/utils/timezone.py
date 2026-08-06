"""Timezone helpers for India Standard Time outputs."""

import os
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo


def _get_system_tz():
    tz_name = os.getenv("SYSTEM_TIMEZONE", "Asia/Kolkata")
    try:
        return ZoneInfo(tz_name)
    except Exception:
        # Fallback to IST if invalid timezone
        return timezone(timedelta(hours=5, minutes=30))


def to_india_time(value=None):
    """Convert a datetime-like value to system timezone (defaults to Asia/Kolkata)."""
    dt = value or datetime.now(timezone.utc)
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_get_system_tz())


def india_timestamp_token(value=None):
    """Return a filesystem-friendly IST timestamp token."""
    return to_india_time(value).strftime("%Y%m%d_%H%M%S")
