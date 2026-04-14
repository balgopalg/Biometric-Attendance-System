"""Course model helpers."""

from datetime import datetime, timezone
from bson import ObjectId
from app.extensions import get_collection


def create_course(name, code, department, course_duration):
    courses = get_collection("academic", "courses")
    doc = {
        "name": name,
        "code": code,
        "department": department,
        "course_duration": course_duration,
        "status": "active",
        "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }
    result = courses.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_all_courses(fields=None):
    courses = get_collection("academic", "courses")
    projection = None
    if fields:
        projection = {field: 1 for field in fields}
        projection["_id"] = 1
    cursor = courses.find({}, projection) if projection else courses.find()
    return list(cursor)


def get_course_by_id(course_id):
    courses = get_collection("academic", "courses")
    return courses.find_one({"_id": ObjectId(course_id)})


def update_course(course_id, fields):
    courses = get_collection("academic", "courses")
    courses.update_one({"_id": ObjectId(course_id)}, {"$set": fields})
    return get_course_by_id(course_id)


def delete_course(course_id):
    courses = get_collection("academic", "courses")
    courses.update_one({"_id": ObjectId(course_id)}, {"$set": {"status": "inactive"}})


def hard_delete_course(course_id):
    courses = get_collection("academic", "courses")
    courses.delete_one({"_id": ObjectId(course_id)})


def is_course_active(course_id):
    course = get_course_by_id(course_id)
    if not course:
        return False
    return str(course.get("status") or "active").lower() == "active"
