from datetime import datetime, timezone, timedelta
from typing import Optional, List
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from app.extensions import get_collection
from app.utils.timezone import to_india_time


def log_attendance(
    paper_id: str,
    user_id: str,
    lecturer_id: str,
    session_id: str,
    method: str = "biometric"
) -> dict:
    logs = get_collection("attendance", "attendance_logs")
    doc = {
        "paper_id": paper_id,
        "user_id": user_id,
        "lecturer_id": lecturer_id,
        "session_id": session_id,
        "method": method,
        "timestamp": datetime.now(timezone.utc),
    }
    try:
        result = logs.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return doc
    except DuplicateKeyError:
        # Return existing record if duplicate key error occurs (e.g., from retry)
        existing = logs.find_one({
            'session_id': session_id,
            'paper_id': paper_id,
            'user_id': user_id
        })
        if existing:
            existing["_id"] = str(existing["_id"])
            return existing
        # If we can't find the existing doc, re-raise the error
        raise


def get_attendance_for_student(user_id: str, paper_id: Optional[str] = None, limit: int = 5000) -> List[dict]:
    """Get attendance logs for a student, optionally filtered by paper."""
    query = {"user_id": user_id}
    if paper_id:
        query["paper_id"] = paper_id
    logs = get_collection("attendance", "attendance_logs")
    return list(logs.find(query).sort("timestamp", -1).limit(limit))


def get_attendance_for_paper(paper_id: str, limit: int = 5000) -> List[dict]:
    """Get attendance logs for a paper with a bounded result set."""
    logs = get_collection("attendance", "attendance_logs")
    return list(logs.find({"paper_id": paper_id}).sort("timestamp", -1).limit(limit))


def get_attendance_for_session(session_id: str) -> List[dict]:
    logs = get_collection("attendance", "attendance_logs")
    return list(logs.find({"session_id": session_id}))


def count_attendance(user_id: str, paper_id: str) -> int:
    """Count total attendance records for a student in a paper."""
    logs = get_collection("attendance", "attendance_logs")
    return logs.count_documents(
        {"user_id": user_id, "paper_id": paper_id}
    )


def delete_attendance_log(log_id: str) -> None:
    logs = get_collection("attendance", "attendance_logs")
    logs.delete_one({"_id": ObjectId(log_id)})


def get_approved_leave_dates(user_id: str, paper_ids: list) -> dict:
    """
    Return dict mapping paper_id to set of approved leave dates (YYYY-MM-DD).
    Supports single dates, date ranges, and global leaves (paper_id=None).
    """
    leaves_col = get_collection("academic", "leave_requests")
    result = {}
    
    # We query for ALL approved leaves for this student.
    # We filter papers in the logic to handle Global Leaves (none/empty paper_id).
    query = {"user_id": str(user_id), "status": "approved"}

    docs = list(leaves_col.find(query))

    for doc in docs:
        pid = doc.get("paper_id")
        paper_id_text = str(pid) if pid else None
        
        # Determine dates covered by this request
        covered_dates = set()
        start = doc.get("start_date") or doc.get("date")
        end = doc.get("end_date") or start
        
        if start and end:
            try:
                # Expand range into individual YYYY-MM-DD strings
                s_dt = datetime.strptime(str(start), "%Y-%m-%d")
                e_dt = datetime.strptime(str(end), "%Y-%m-%d")
                delta = (e_dt - s_dt).days
                for i in range(delta + 1):
                    covered_dates.add((s_dt + timedelta(days=i)).strftime("%Y-%m-%d"))
            except Exception:
                # Fallback to single dates if expansion fails
                if start: covered_dates.add(str(start))
                if end: covered_dates.add(str(end))

        # If paper_id is None, it's a Global Leave; apply to all student papers.
        if not paper_id_text:
            for p_id in [str(p) for p in paper_ids]:
                result.setdefault(p_id, set()).update(covered_dates)
        else:
            result.setdefault(paper_id_text, set()).update(covered_dates)
            
    return result


def session_date_str(session_doc) -> Optional[str]:
    """Extract YYYY-MM-DD from a session document correctly adjusted for IST."""
    raw = session_doc.get("committed_at") or session_doc.get("last_updated_at")
    if not raw:
        return None
    # Adjust UTC timestamp to India Standard Time before string conversion
    ist_dt = to_india_time(raw)
    return ist_dt.strftime("%Y-%m-%d")
