"""Paper (Subject) model helpers."""

from datetime import datetime, timezone
from typing import Any, Optional, List, Dict
from bson import ObjectId
from app.extensions import get_collection

def create_paper(
    name: str,
    code: str,
    course_id: str,
    lecturer_id: Optional[str] = None,
    semester: Optional[Any] = None,
    total_classes: int = 0
) -> dict:
    papers = get_collection("academic", "papers")
    doc = {
        "name": name,
        "code": code,
        "course_id": course_id,
        "lecturer_id": lecturer_id,
        "semester": semester,
        "total_classes": total_classes,
        "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }
    result = papers.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_all_papers(fields: Optional[List[str]] = None) -> List[dict]:
    papers = get_collection("academic", "papers")
    projection = None
    if fields:
        projection = {field: 1 for field in fields}
        projection["_id"] = 1
    cursor = papers.find({}, projection) if projection else papers.find()
    return list(cursor)


def get_paper_by_id(paper_id: str) -> Optional[dict]:
    papers = get_collection("academic", "papers")
    return papers.find_one({"_id": ObjectId(paper_id)})


def get_papers_by_course(course_id: str) -> List[dict]:
    papers = get_collection("academic", "papers")
    return list(papers.find({"course_id": course_id}))


def get_papers_by_lecturer(lecturer_id: str) -> List[dict]:
    papers = get_collection("academic", "papers")
    return list(papers.find({"lecturer_id": lecturer_id}))


def update_paper(paper_id: str, fields: dict) -> Optional[dict]:
    papers = get_collection("academic", "papers")
    papers.update_one({"_id": ObjectId(paper_id)}, {"$set": fields})
    return get_paper_by_id(paper_id)


def delete_paper(paper_id: str) -> None:
    papers = get_collection("academic", "papers")
    papers.delete_one({"_id": ObjectId(paper_id)})


def bulk_assign_lecturer(paper_ids: List[str], lecturer_id: str) -> None:
    """Assign a lecturer to multiple papers at once."""
    papers = get_collection("academic", "papers")
    papers.update_many(
        {"_id": {"$in": [ObjectId(pid) for pid in paper_ids]}},
        {"$set": {"lecturer_id": lecturer_id}},
    )


def bulk_assign_course(paper_ids: List[str], course_id: str) -> None:
    """Assign multiple papers to a course at once."""
    papers = get_collection("academic", "papers")
    papers.update_many(
        {"_id": {"$in": [ObjectId(pid) for pid in paper_ids]}},
        {"$set": {"course_id": course_id}},
    )


def increment_total_classes(paper_id: str, count: int = 1) -> None:
    """Increment total_classes after a session is committed."""
    papers = get_collection("academic", "papers")
    papers.update_one(
        {"_id": ObjectId(paper_id)}, {"$inc": {"total_classes": count}}
    )
