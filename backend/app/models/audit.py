"""Audit trail logger."""

from datetime import datetime, timedelta
from bson import ObjectId
from app.extensions import get_collection


ROLLBACK_WINDOW_HOURS = 24


def log_action(action, performed_by, target_user=None, details="", rollback=None, rollback_until=None):
    logs = get_collection("audit", "audit_logs")
    ts = datetime.utcnow()
    doc = {
        "action": action,
        "performed_by": performed_by,
        "target_user": target_user,
        "details": details,
        "timestamp": ts,
    }
    if rollback:
        doc["rollback"] = rollback
        doc["rollback_until"] = rollback_until or (ts + timedelta(hours=ROLLBACK_WINDOW_HOURS))
        doc["rolled_back"] = False

    logs.insert_one(doc)
    return doc


def get_audit_logs(page=1, per_page=50, filters=None):
    """Return paginated audit logs, newest first, with optional filters."""
    skip = (page - 1) * per_page
    logs_col = get_collection("audit", "audit_logs")
    query = filters or {}
    logs = list(
        logs_col.find(query)
        .sort("timestamp", -1)
        .skip(skip)
        .limit(per_page)
    )
    total = logs_col.count_documents(query)
    return logs, total


def get_audit_log_by_id(log_id):
    logs_col = get_collection("audit", "audit_logs")
    try:
        oid = ObjectId(log_id)
    except Exception:
        return None
    return logs_col.find_one({"_id": oid})


def mark_audit_log_rolled_back(log_id, rolled_back_by):
    logs_col = get_collection("audit", "audit_logs")
    try:
        oid = ObjectId(log_id)
    except Exception:
        return
    logs_col.update_one(
        {"_id": oid},
        {
            "$set": {
                "rolled_back": True,
                "rolled_back_at": datetime.utcnow(),
                "rolled_back_by": rolled_back_by,
            }
        },
    )
