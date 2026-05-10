"""Paper (Subject) model helpers."""

import re
from datetime import datetime, timezone
from typing import Any, List, Optional

from app.extensions import get_collection
from bson import ObjectId
from bson.errors import InvalidId


def create_paper(
    name: str,
    code: str,
    course_id: str,
    lecturer_id: Optional[str] = None,
    semester: Optional[Any] = None,
    total_classes: int = 0,
    department_id: Any = None,
) -> dict:
    papers = get_collection("academic", "papers")
    dept_oid = None
    if department_id is not None and str(department_id).strip():
        try:
            dept_oid = ObjectId(str(department_id))
        except (InvalidId, Exception):
            dept_oid = None
    lec_oid = None
    if lecturer_id and str(lecturer_id).strip():
        try:
            lec_oid = ObjectId(str(lecturer_id))
        except:
            lec_oid = None

    course_oid = None
    if course_id and str(course_id).strip():
        try:
            course_oid = ObjectId(str(course_id))
        except:
            course_oid = None

    doc = {
        "name": name,
        "code": code,
        "course_id": course_oid or course_id,
        "lecturer_id": lec_oid or lecturer_id,
        "semester": semester,
        "total_classes": total_classes,
        "department_id": dept_oid,
        "created_at": datetime.now(timezone.utc),
    }
    result = papers.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_all_papers(
    fields: Optional[List[str]] = None, department_id: Any = None
) -> List[dict]:
    """Return all papers, optionally filtered by department_id."""
    papers = get_collection("academic", "papers")
    projection = None
    if fields:
        projection = {field: 1 for field in fields}
        projection["_id"] = 1
    query: dict = {}
    if department_id is not None:
        try:
            query["department_id"] = (
                ObjectId(str(department_id))
                if not isinstance(department_id, ObjectId)
                else department_id
            )
        except (InvalidId, Exception):
            pass
    cursor = (
        papers.find(query, projection) if projection else papers.find(query)
    )
    return list(cursor)


def get_paper_by_id(paper_id: str) -> Optional[dict]:
    papers = get_collection("academic", "papers")
    try:
        oid = ObjectId(paper_id)
    except (InvalidId, Exception):
        return None
    return papers.find_one({"_id": oid})


def get_paper_by_code(code: str) -> Optional[dict]:
    papers = get_collection("academic", "papers")
    escaped = re.escape(code.strip())
    return papers.find_one(
        {"code": {"$regex": f"^{escaped}$", "$options": "i"}}
    )


def get_papers_by_course(course_id: str) -> List[dict]:
    papers = get_collection("academic", "papers")
    try:
        oid = ObjectId(str(course_id))
        return list(papers.find({"$or": [{"course_id": oid}, {"course_id": str(course_id)}]}))
    except:
        return list(papers.find({"course_id": str(course_id)}))


def get_papers_by_lecturer(lecturer_id: str) -> List[dict]:
    papers = get_collection("academic", "papers")
    try:
        oid = ObjectId(lecturer_id)
        return list(
            papers.find(
                {"$or": [{"lecturer_id": oid}, {"lecturer_id": lecturer_id}]}
            )
        )
    except:
        return list(papers.find({"lecturer_id": lecturer_id}))


def update_paper(paper_id: str, fields: dict) -> Optional[dict]:
    papers = get_collection("academic", "papers")
    try:
        oid = ObjectId(paper_id)
    except (InvalidId, Exception):
        return None
    papers.update_one({"_id": oid}, {"$set": fields})
    return get_paper_by_id(paper_id)


def delete_paper(paper_id: str) -> None:
    papers = get_collection("academic", "papers")
    try:
        oid = ObjectId(paper_id)
    except (InvalidId, Exception):
        return
    papers.delete_one({"_id": oid})


def bulk_assign_lecturer(paper_ids: List[str], lecturer_id: str) -> None:
    """Assign a lecturer to multiple papers at once."""
    papers = get_collection("academic", "papers")
    try:
        lec_oid = ObjectId(lecturer_id)
    except:
        lec_oid = lecturer_id

    papers.update_many(
        {"_id": {"$in": [ObjectId(pid) for pid in paper_ids]}},
        {"$set": {"lecturer_id": lec_oid}},
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
