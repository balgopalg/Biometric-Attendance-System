"""Student enrollment / profile model helpers."""

from datetime import datetime
from bson import ObjectId
from app.extensions import get_collection


def create_student_profile(user_id, roll_number, course_id, academic_year=None):
    profiles = get_collection("academic", "student_profiles")
    doc = {
        "user_id": user_id,
        "roll_number": roll_number,
        "reg_number": roll_number,
        "course_id": course_id,
        "academic_year": academic_year,
        "academic_session": academic_year,
        "year": academic_year,
        "current_semester": 1,
        "face_embeddings": [],
        "photo_urls": [],
        "enrolled_papers": [],
        "created_at": datetime.utcnow(),
    }
    result = profiles.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_profile_by_user(user_id):
    profiles = get_collection("academic", "student_profiles")
    return profiles.find_one({"user_id": user_id})


def get_profile_by_id(profile_id):
    profiles = get_collection("academic", "student_profiles")
    return profiles.find_one({"_id": ObjectId(profile_id)})


def get_all_profiles():
    profiles = get_collection("academic", "student_profiles")
    return list(profiles.find())


def add_face_embedding(user_id, embedding, photo_url=None):
    """Append a new face embedding vector (list of floats) to the student profile."""
    update = {"$push": {"face_embeddings": embedding}}
    if photo_url:
        update["$push"]["photo_urls"] = photo_url
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one({"user_id": user_id}, update)


def enroll_in_papers(user_id, paper_ids):
    """Add papers to a students enrolled papers list."""
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one(
        {"user_id": user_id},
        {"$addToSet": {"enrolled_papers": {"$each": paper_ids}}},
    )


def get_profiles_for_paper(paper_id):
    """Return all student profiles enrolled in a given paper."""
    profiles = get_collection("academic", "student_profiles")
    filters = [paper_id, str(paper_id)]
    try:
        filters.append(ObjectId(str(paper_id)))
    except Exception:
        pass
    return list(profiles.find({"enrolled_papers": {"$in": filters}}))


def count_profiles_for_paper(paper_id):
    """Count enrolled students for a paper, handling string/ObjectId ids."""
    profiles = get_collection("academic", "student_profiles")
    filters = [paper_id, str(paper_id)]
    try:
        filters.append(ObjectId(str(paper_id)))
    except Exception:
        pass
    return int(profiles.count_documents({"enrolled_papers": {"$in": filters}}))


def update_profile(user_id, fields):
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one({"user_id": user_id}, {"$set": fields})
    return get_profile_by_user(user_id)


def delete_profile(user_id):
    profiles = get_collection("academic", "student_profiles")
    profiles.delete_one({"user_id": user_id})
