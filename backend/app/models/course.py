"""Course model helpers."""

from datetime import datetime, timezone
from typing import Any, Optional, List, Dict
from bson import ObjectId
from bson.errors import InvalidId
from app.extensions import get_collection

def create_course(name: str, code: str, department: str, course_duration: Any, department_id: Any = None) -> dict:
    courses = get_collection("academic", "courses")
    # Coerce department_id to ObjectId
    dept_oid = None
    if department_id is not None and str(department_id).strip():
        try:
            dept_oid = ObjectId(str(department_id))
        except (InvalidId, Exception):
            dept_oid = None
    doc = {
        "name": name,
        "code": code,
        "department": department,
        "department_id": dept_oid,
        "course_duration": course_duration,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    result = courses.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_all_courses(fields: Optional[List[str]] = None, department_id: Any = None) -> List[dict]:
    """Return all courses, optionally filtered by department_id."""
    courses = get_collection("academic", "courses")
    projection = None
    if fields:
        projection = {field: 1 for field in fields}
        projection["_id"] = 1
    query: dict = {}
    if department_id is not None:
        try:
            query["department_id"] = ObjectId(str(department_id)) if not isinstance(department_id, ObjectId) else department_id
        except (InvalidId, Exception):
            pass
    cursor = courses.find(query, projection) if projection else courses.find(query)
    return list(cursor)


def get_course_by_id(course_id: str) -> Optional[dict]:
    courses = get_collection("academic", "courses")
    return courses.find_one({"_id": ObjectId(course_id)})


def update_course(course_id: str, fields: dict) -> Optional[dict]:
    courses = get_collection("academic", "courses")
    courses.update_one({"_id": ObjectId(course_id)}, {"$set": fields})
    return get_course_by_id(course_id)


def delete_course(course_id: str) -> None:
    courses = get_collection("academic", "courses")
    courses.update_one({"_id": ObjectId(course_id)}, {"$set": {"status": "inactive"}})


def hard_delete_course(course_id: str) -> None:
    courses = get_collection("academic", "courses")
    courses.delete_one({"_id": ObjectId(course_id)})


def is_course_active(course_id: str) -> bool:
    course = get_course_by_id(course_id)
    if not course:
        return False
    return str(course.get("status") or "active").lower() == "active"
