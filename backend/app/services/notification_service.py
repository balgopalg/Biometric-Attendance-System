"""Helpers for user notification inbox messages."""

from __future__ import annotations

from datetime import datetime, timezone

from app.extensions import get_collection
from bson import ObjectId


def _utc_now():
    return datetime.now(timezone.utc)


def _notifications_collection():
    return get_collection("auth", "notifications")


def _serialize_notification(notification):
    created_at = notification.get("created_at")
    if isinstance(created_at, datetime):
        created_at = (
            created_at.astimezone(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
        )
    else:
        created_at = ""

    read_at = notification.get("read_at")
    if isinstance(read_at, datetime):
        read_at = (
            read_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        )
    else:
        read_at = ""

    return {
        "_id": str(notification.get("_id") or ""),
        "user_id": str(notification.get("user_id") or ""),
        "title": notification.get("title", ""),
        "body": notification.get("body", ""),
        "category": notification.get("category", "system"),
        "priority": notification.get("priority", "normal"),
        "is_read": bool(notification.get("is_read", False)),
        "created_at": created_at,
        "read_at": read_at,
        "action_url": notification.get("action_url", ""),
        "template_key": notification.get("template_key", ""),
        "metadata": notification.get("metadata", {}),
    }


def _welcome_payload(role: str):
    role_key = (role or "student").strip().lower()
    templates = {
        "super_admin": (
            "Welcome to your admin inbox",
            "Track security alerts, audit changes, queue issues, and platform updates from one place.",
            "/admin",
        ),
        "department_admin": (
            "Department inbox ready",
            "Review academic updates, attendance summaries, approvals, and operational notices here.",
            "/admin",
        ),
        "lecturer": (
            "Your lecturer inbox is ready",
            "Session reminders, attendance actions, and review alerts will appear here.",
            "/lecturer",
        ),
        "student": (
            "Welcome to your student inbox",
            "Check attendance updates, eligibility reminders, leave decisions, and system notices here.",
            "/student",
        ),
    }
    return templates.get(role_key, templates["student"])


def create_notification(
    *,
    user_id,
    title,
    body,
    category="system",
    priority="normal",
    action_url="",
    template_key="",
    metadata=None,
    is_read=False,
):
    doc = {
        "_id": ObjectId(),
        "user_id": str(user_id),
        "title": title,
        "body": body,
        "category": category,
        "priority": priority,
        "is_read": is_read,
        "created_at": _utc_now(),
        "action_url": action_url,
        "template_key": template_key,
        "metadata": metadata or {},
    }
    _notifications_collection().insert_one(doc)
    return doc


def ensure_welcome_notification(user):
    if not user or not user.get("_id"):
        return None

    user_id = str(user.get("_id"))
    notifications = _notifications_collection()

    title, body, action_url = _welcome_payload(user.get("role"))
    doc = {
        "user_id": user_id,
        "title": title,
        "body": body,
        "category": "system",
        "priority": "high",
        "action_url": action_url,
        "template_key": "welcome",
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
        "metadata": {"role": user.get("role", "student")},
    }

    # Use atomic upsert to prevent duplicate welcome notifications
    result = notifications.update_one(
        {"user_id": user_id, "template_key": "welcome"},
        {"$setOnInsert": doc},
        upsert=True,
    )

    # Return the document if it was inserted
    if result.upserted_id:
        return doc
    return None


def list_notifications(user_id, limit=20):
    notifications = _notifications_collection()
    try:
        parsed_limit = int(limit or 20)
    except (TypeError, ValueError):
        parsed_limit = 20
    safe_limit = max(1, min(parsed_limit, 100))
    items = list(
        notifications.find({"user_id": str(user_id)})
        .sort("created_at", -1)
        .limit(safe_limit)
    )
    unread_count = notifications.count_documents(
        {"user_id": str(user_id), "is_read": False}
    )
    return {
        "items": [_serialize_notification(item) for item in items],
        "unread_count": unread_count,
    }


def mark_notification_read(user_id, notification_id):
    notifications = _notifications_collection()
    try:
        object_id = ObjectId(notification_id)
    except Exception:
        return False

    result = notifications.update_one(
        {"_id": object_id, "user_id": str(user_id)},
        {"$set": {"is_read": True, "read_at": _utc_now()}},
    )
    return result.matched_count > 0


def mark_all_notifications_read(user_id):
    notifications = _notifications_collection()
    result = notifications.update_many(
        {"user_id": str(user_id), "is_read": False},
        {"$set": {"is_read": True, "read_at": _utc_now()}},
    )
    return result.modified_count


def delete_notification(user_id, notification_id):
    notifications = _notifications_collection()
    try:
        object_id = ObjectId(notification_id)
    except Exception:
        return False

    result = notifications.delete_one(
        {"_id": object_id, "user_id": str(user_id)}
    )
    return result.deleted_count > 0
