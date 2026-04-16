"""Audit trail logger."""

from datetime import datetime, timedelta, timezone
from bson import ObjectId
from pymongo import ReturnDocument
from app.extensions import get_collection


ROLLBACK_WINDOW_HOURS = 24


from typing import Any, Optional, Tuple, Dict

def log_action(
    action: Optional[str] = None,
    performed_by: Optional[str] = None,
    target_user: Optional[str] = None,
    details: str = "",
    rollback: Any = None,
    rollback_until: Any = None,
    **kwargs,
) -> dict:
    logs = get_collection("audit", "audit_logs")
    ts = datetime.now(timezone.utc).replace(tzinfo=None)

    # Backward-compatible mapping for newer keyword call style used by some routes.
    action = action or kwargs.get("action")
    performed_by = performed_by or kwargs.get("performed_by") or kwargs.get("user_id") or "system"
    target_user = target_user if target_user is not None else kwargs.get("target_user")
    details = details or kwargs.get("details") or kwargs.get("description", "")

    dedupe_seconds = int(kwargs.get("dedupe_seconds") or 0)
    dedupe_key = str(kwargs.get("dedupe_key") or "").strip()
    dedupe_bucket = None
    if dedupe_seconds > 0 and dedupe_key:
        dedupe_bucket = int(ts.timestamp()) // dedupe_seconds

    doc = {
        "action": action,
        "performed_by": performed_by,
        "target_user": target_user,
        "details": details,
        "timestamp": ts,
    }
    if kwargs.get("resource_type"):
        doc["resource_type"] = kwargs.get("resource_type")
    if kwargs.get("ip_address"):
        doc["ip_address"] = kwargs.get("ip_address")
    if kwargs.get("user_agent"):
        doc["user_agent"] = kwargs.get("user_agent")
    if dedupe_key:
        doc["dedupe_key"] = dedupe_key
    if dedupe_bucket is not None:
        doc["dedupe_bucket"] = dedupe_bucket
    if rollback:
        doc["rollback"] = rollback
        doc["rollback_until"] = rollback_until or (ts + timedelta(hours=ROLLBACK_WINDOW_HOURS))
        doc["rolled_back"] = False

    if dedupe_bucket is not None:
        existing = logs.find_one_and_update(
            {
                "action": action,
                "performed_by": performed_by,
                "dedupe_key": dedupe_key,
                "dedupe_bucket": dedupe_bucket,
            },
            {"$setOnInsert": doc},
            upsert=True,
            return_document=ReturnDocument.BEFORE,
        )
        if existing is not None:
            return existing
        return doc

    logs.insert_one(doc)
    return doc


def get_audit_logs(page: int = 1, per_page: int = 50, filters: Optional[dict] = None) -> Tuple[list, int]:
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


def get_audit_log_by_id(log_id: str) -> Optional[dict]:
    logs_col = get_collection("audit", "audit_logs")
    try:
        oid = ObjectId(log_id)
    except Exception:
        return None
    return logs_col.find_one({"_id": oid})


def mark_audit_log_rolled_back(log_id: str, rolled_back_by: str) -> None:
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
                "rolled_back_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "rolled_back_by": rolled_back_by,
            }
        },
    )
