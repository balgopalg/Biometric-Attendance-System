"""Timezone helpers for India Standard Time outputs."""

from datetime import datetime, timezone, timedelta


INDIA_TZ = timezone(timedelta(hours=5, minutes=30))


def to_india_time(value=None):
    """Convert a datetime-like value to IST, defaulting to current UTC time."""
    dt = value or datetime.now(timezone.utc)
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(INDIA_TZ)


def india_timestamp_token(value=None):
    """Return a filesystem-friendly IST timestamp token."""
    return to_india_time(value).strftime("%Y%m%d_%H%M%S")
