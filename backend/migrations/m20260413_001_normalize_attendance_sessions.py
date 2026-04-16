from datetime import datetime, timezone

from app.extensions import get_collection


def upgrade():
    sessions_col = get_collection("attendance", "attendance_sessions")
    total = 0
    updated = 0

    for doc in sessions_col.find({}):
        total += 1
        session_id = doc.get("session_id") or str(doc.get("_id"))
        lecturer_id = doc.get("lecturer_id")
        paper_id = doc.get("paper_id")
        user_ids = doc.get("user_ids") or []
        if not isinstance(user_ids, list):
            user_ids = [user_ids]

        seen = set()
        normalized_students = []
        for sid in user_ids:
            text = str(sid).strip() if sid is not None else ""
            if not text or text in seen:
                continue
            seen.add(text)
            normalized_students.append(text)

        committed_at = doc.get("committed_at") or doc.get("last_updated_at") or doc.get("created_at")
        academic_session = doc.get("academic_session") or doc.get("academic_year")
        if not academic_session and isinstance(committed_at, datetime):
            academic_session = str(committed_at.year)

        patch = {
            "session_id": str(session_id),
            "lecturer_id": str(lecturer_id) if lecturer_id is not None else "",
            "paper_id": str(paper_id) if paper_id is not None else "",
            "user_ids": normalized_students,
            "academic_session": str(academic_session) if academic_session else "",
            "academic_year": str(academic_session) if academic_session else "",
            "last_updated_at": doc.get("last_updated_at") or committed_at or datetime.now(timezone.utc).replace(tzinfo=None),
        }
        if committed_at:
            patch["committed_at"] = committed_at

        sessions_col.update_one({"_id": doc.get("_id")}, {"$set": patch})
        updated += 1

    return {
        "total_documents": total,
        "updated_documents": updated,
    }
