"""Course model helpers."""

from datetime import datetime
from bson import ObjectId
from app.extensions import get_collection


def create_course(name, code, department, course_duration):
    courses = get_collection("academic", "courses")
    doc = {
        "name": name,
        "code": code,
        "department": department,
        "course_duration": course_duration,
        "created_at": datetime.utcnow(),
    }
    result = courses.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_all_courses():
    courses = get_collection("academic", "courses")
    return list(courses.find())


def get_course_by_id(course_id):
    courses = get_collection("academic", "courses")
    return courses.find_one({"_id": ObjectId(course_id)})


def update_course(course_id, fields):
    courses = get_collection("academic", "courses")
    courses.update_one({"_id": ObjectId(course_id)}, {"$set": fields})
    return get_course_by_id(course_id)


def delete_course(course_id):
    courses = get_collection("academic", "courses")
    courses.delete_one({"_id": ObjectId(course_id)})
