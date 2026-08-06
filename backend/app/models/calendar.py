"""Academic calendar persistence helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.extensions import get_collection
from bson import ObjectId
from bson.errors import InvalidId

VALID_CALENDAR_STATUSES = {"draft", "published", "archived"}


def _to_object_id(value: Any) -> Optional[ObjectId]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return ObjectId(text)
    except (InvalidId, Exception):
        return None


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_status(status: Any) -> str:
    value = _to_text(status).lower() or "draft"
    return value if value in VALID_CALENDAR_STATUSES else "draft"


def create_calendar(doc: Dict[str, Any]) -> dict:
    calendars = get_collection("academic", "calendars")
    payload = dict(doc or {})
    payload["status"] = _normalize_status(payload.get("status"))
    now = datetime.now(timezone.utc)
    payload["created_at"] = now
    payload["updated_at"] = now
    result = calendars.insert_one(payload)
    payload["_id"] = result.inserted_id
    return payload


def update_calendar(
    calendar_id: str, fields: Dict[str, Any]
) -> Optional[dict]:
    oid = _to_object_id(calendar_id)
    if not oid:
        return None

    updates = dict(fields or {})
    if "status" in updates:
        updates["status"] = _normalize_status(updates.get("status"))
    updates["updated_at"] = datetime.now(timezone.utc)

    calendars = get_collection("academic", "calendars")
    calendars.update_one({"_id": oid}, {"$set": updates})
    return get_calendar_by_id(calendar_id)


def get_calendar_by_id(calendar_id: str) -> Optional[dict]:
    oid = _to_object_id(calendar_id)
    if not oid:
        return None
    calendars = get_collection("academic", "calendars")
    return calendars.find_one({"_id": oid})


def list_calendars(
    *, department_id: Any = None, year: Any = None, status: Any = None
) -> List[dict]:
    calendars = get_collection("academic", "calendars")
    query: Dict[str, Any] = {}

    dep_oid = _to_object_id(department_id)
    if dep_oid:
        query["department_id"] = dep_oid

    year_text = _to_text(year)
    if year_text:
        try:
            query["year"] = int(year_text)
        except Exception:
            query["year"] = year_text

    status_text = _to_text(status).lower()
    if status_text in VALID_CALENDAR_STATUSES:
        query["status"] = status_text

    return list(
        calendars.find(query).sort([("updated_at", -1), ("created_at", -1)])
    )


def get_current_calendar(
    *, department_id: Any, year: Any = None
) -> Optional[dict]:
    calendars = get_collection("academic", "calendars")
    query: Dict[str, Any] = {"status": "published"}

    dep_oid = _to_object_id(department_id)
    if dep_oid:
        query["department_id"] = dep_oid

    year_text = _to_text(year)
    if year_text:
        try:
            query["year"] = int(year_text)
        except Exception:
            query["year"] = year_text

    return calendars.find_one(
        query,
        sort=[("published_at", -1), ("updated_at", -1), ("created_at", -1)],
    )


def archive_existing_calendars(*, department_id: Any, year: Any = None) -> int:
    calendars = get_collection("academic", "calendars")
    query: Dict[str, Any] = {"status": "published"}

    dep_oid = _to_object_id(department_id)
    if dep_oid:
        query["department_id"] = dep_oid

    year_text = _to_text(year)
    if year_text:
        try:
            query["year"] = int(year_text)
        except Exception:
            query["year"] = year_text

    result = calendars.update_many(
        query,
        {
            "$set": {
                "status": "archived",
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return int(result.modified_count or 0)


def serialize_calendar(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None

    payload = dict(doc)
    payload["_id"] = str(payload.get("_id"))
    for key in ("department_id", "created_by", "updated_by", "verified_by"):
        if payload.get(key) is not None:
            payload[key] = str(payload.get(key))
    return payload
