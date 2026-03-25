"""Paper (Subject) model helpers."""

from datetime import datetime
from bson import ObjectId
from app.extensions import get_collection


def create_paper(name, code, course_id, lecturer_id=None, semester=None, total_classes=0):
    papers = get_collection("academic", "papers")
    doc = {
        "name": name,
        "code": code,
        "course_id": course_id,
        "lecturer_id": lecturer_id,
        "semester": semester,
        "total_classes": total_classes,
        "created_at": datetime.utcnow(),
    }
    result = papers.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_all_papers():
    papers = get_collection("academic", "papers")
    return list(papers.find())


def get_paper_by_id(paper_id):
    papers = get_collection("academic", "papers")
    return papers.find_one({"_id": ObjectId(paper_id)})


def get_papers_by_course(course_id):
    papers = get_collection("academic", "papers")
    return list(papers.find({"course_id": course_id}))


def get_papers_by_lecturer(lecturer_id):
    papers = get_collection("academic", "papers")
    return list(papers.find({"lecturer_id": lecturer_id}))


def update_paper(paper_id, fields):
    papers = get_collection("academic", "papers")
    papers.update_one({"_id": ObjectId(paper_id)}, {"$set": fields})
    return get_paper_by_id(paper_id)


def delete_paper(paper_id):
    papers = get_collection("academic", "papers")
    papers.delete_one({"_id": ObjectId(paper_id)})


def bulk_assign_lecturer(paper_ids, lecturer_id):
    """Assign a lecturer to multiple papers at once."""
    papers = get_collection("academic", "papers")
    papers.update_many(
        {"_id": {"$in": [ObjectId(pid) for pid in paper_ids]}},
        {"$set": {"lecturer_id": lecturer_id}},
    )


def bulk_assign_course(paper_ids, course_id):
    """Assign multiple papers to a course at once."""
    papers = get_collection("academic", "papers")
    papers.update_many(
        {"_id": {"$in": [ObjectId(pid) for pid in paper_ids]}},
        {"$set": {"course_id": course_id}},
    )


def increment_total_classes(paper_id, count=1):
    """Increment total_classes after a session is committed."""
    papers = get_collection("academic", "papers")
    papers.update_one(
        {"_id": ObjectId(paper_id)}, {"$inc": {"total_classes": count}}
    )
