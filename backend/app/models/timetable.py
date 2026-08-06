"""Timetable and timetable-slot model helpers."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.extensions import get_collection
from bson import ObjectId
from bson.errors import InvalidId

VALID_TIMETABLE_STATUSES = {"draft", "active", "archived"}


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
    return value if value in VALID_TIMETABLE_STATUSES else "draft"


def create_timetable(doc: Dict[str, Any]) -> dict:
    timetables = get_collection("academic", "timetables")
    payload = dict(doc or {})
    payload["status"] = _normalize_status(payload.get("status"))
    payload["created_at"] = datetime.now(timezone.utc)
    payload["updated_at"] = datetime.now(timezone.utc)
    result = timetables.insert_one(payload)
    payload["_id"] = result.inserted_id
    return payload


def get_timetable_by_id(timetable_id: str) -> Optional[dict]:
    oid = _to_object_id(timetable_id)
    if not oid:
        return None
    timetables = get_collection("academic", "timetables")
    return timetables.find_one({"_id": oid})


def list_timetables(
    *,
    department_id: Any = None,
    course_id: Any = None,
    semester: Any = None,
    status: Any = None,
    academic_session: Any = None,
) -> List[dict]:
    timetables = get_collection("academic", "timetables")
    query: Dict[str, Any] = {}

    dep_oid = _to_object_id(department_id)
    if dep_oid:
        query["department_id"] = dep_oid

    course_oid = _to_object_id(course_id)
    if course_oid:
        query["course_id"] = course_oid

    sem_text = _to_text(semester)
    if sem_text:
        try:
            query["semester"] = int(sem_text)
        except Exception:
            query["semester"] = sem_text

    status_text = _to_text(status).lower()
    if status_text in VALID_TIMETABLE_STATUSES:
        query["status"] = status_text

    session_text = _to_text(academic_session)
    if session_text:
        query["academic_session"] = session_text

    return list(
        timetables.find(query).sort([("updated_at", -1), ("created_at", -1)])
    )


def update_timetable(
    timetable_id: str, fields: Dict[str, Any]
) -> Optional[dict]:
    oid = _to_object_id(timetable_id)
    if not oid:
        return None

    updates = dict(fields or {})
    if "status" in updates:
        updates["status"] = _normalize_status(updates.get("status"))
    updates["updated_at"] = datetime.now(timezone.utc)

    timetables = get_collection("academic", "timetables")
    timetables.update_one({"_id": oid}, {"$set": updates})
    return get_timetable_by_id(timetable_id)


def create_timeslots(slots: List[Dict[str, Any]]) -> List[dict]:
    slots_col = get_collection("academic", "timetable_slots")
    if not slots:
        return []

    payloads = []
    now = datetime.now(timezone.utc)
    for slot in slots:
        doc = dict(slot or {})
        doc["created_at"] = now
        doc["updated_at"] = now
        payloads.append(doc)

    result = slots_col.insert_many(payloads)
    for idx, inserted_id in enumerate(result.inserted_ids):
        payloads[idx]["_id"] = inserted_id

    return payloads


def list_timeslots_for_timetable(timetable_id: str) -> List[dict]:
    oid = _to_object_id(timetable_id)
    if not oid:
        return []

    slots_col = get_collection("academic", "timetable_slots")
    return list(
        slots_col.find({"timetable_id": oid}).sort(
            [
                ("day_index", 1),
                ("start_minutes", 1),
            ]
        )
    )


def delete_timeslots_for_timetable(timetable_id: str) -> int:
    oid = _to_object_id(timetable_id)
    if not oid:
        return 0

    slots_col = get_collection("academic", "timetable_slots")
    result = slots_col.delete_many({"timetable_id": oid})
    return int(result.deleted_count or 0)


def update_timeslot(slot_id: str, fields: Dict[str, Any]) -> Optional[dict]:
    oid = _to_object_id(slot_id)
    if not oid:
        return None

    updates = dict(fields or {})
    updates["updated_at"] = datetime.now(timezone.utc)

    slots_col = get_collection("academic", "timetable_slots")
    slots_col.update_one({"_id": oid}, {"$set": updates})
    return slots_col.find_one({"_id": oid})


def get_timeslot_by_id(slot_id: str) -> Optional[dict]:
    oid = _to_object_id(slot_id)
    if not oid:
        return None
    slots_col = get_collection("academic", "timetable_slots")
    return slots_col.find_one({"_id": oid})


def clear_active_timetable_for_scope(
    *,
    department_id: Any,
    course_id: Any,
    semester: Any,
    academic_session: Any = None,
) -> None:
    timetables = get_collection("academic", "timetables")
    query: Dict[str, Any] = {
        "department_id": _to_object_id(department_id),
        "course_id": _to_object_id(course_id),
    }

    try:
        query["semester"] = int(semester)
    except Exception:
        query["semester"] = semester

    session_text = _to_text(academic_session)
    if session_text:
        query["academic_session"] = session_text

    timetables.update_many(
        query,
        {
            "$set": {
                "status": "draft",
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )


def serialize_timetable(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    payload = dict(doc)
    payload["_id"] = str(payload.get("_id"))
    for key in (
        "department_id",
        "course_id",
        "created_by",
        "updated_by",
        "generated_by",
    ):
        if payload.get(key) is not None:
            payload[key] = str(payload.get(key))
    return payload


def serialize_slot(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    payload = dict(doc)
    payload["_id"] = str(payload.get("_id"))
    if payload.get("timetable_id") is not None:
        payload["timetable_id"] = str(payload.get("timetable_id"))
    for key in ("paper_id", "lecturer_id", "department_id", "course_id"):
        if payload.get(key) is not None:
            payload[key] = str(payload.get(key))
    return payload
