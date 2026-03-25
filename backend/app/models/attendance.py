"""Attendance log model helpers."""

from datetime import datetime
from bson import ObjectId
from app.extensions import get_collection


def log_attendance(paper_id, student_id, lecturer_id, session_id, method="biometric"):
    logs = get_collection("attendance", "attendance_logs")
    doc = {
        "paper_id": paper_id,
        "student_id": student_id,
        "lecturer_id": lecturer_id,
        "session_id": session_id,
        "method": method,
        "timestamp": datetime.utcnow(),
    }
    result = logs.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_attendance_for_student(student_id, paper_id=None):
    """Get attendance logs for a student, optionally filtered by paper."""
    query = {"student_id": student_id}
    if paper_id:
        query["paper_id"] = paper_id
    logs = get_collection("attendance", "attendance_logs")
    return list(logs.find(query))


def get_attendance_for_paper(paper_id):
    logs = get_collection("attendance", "attendance_logs")
    return list(logs.find({"paper_id": paper_id}))


def get_attendance_for_session(session_id):
    logs = get_collection("attendance", "attendance_logs")
    return list(logs.find({"session_id": session_id}))


def count_attendance(student_id, paper_id):
    """Count total attendance records for a student in a paper."""
    logs = get_collection("attendance", "attendance_logs")
    return logs.count_documents(
        {"student_id": student_id, "paper_id": paper_id}
    )


def delete_attendance_log(log_id):
    logs = get_collection("attendance", "attendance_logs")
    logs.delete_one({"_id": ObjectId(log_id)})
