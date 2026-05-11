"""Helpers for user notification inbox messages."""

from __future__ import annotations

import json
import os
import threading
from functools import lru_cache
from datetime import datetime, timezone
from typing import Any

import redis
from app.extensions import get_collection
from app.utils.timezone import to_india_time
from bson import ObjectId
from flask import current_app


def _utc_now():
    return datetime.now(timezone.utc)


def _notifications_collection():
    return get_collection("auth", "notifications")


def _notification_channel(user_id: Any) -> str:
    return f"notifications:{str(user_id)}"


@lru_cache(maxsize=4)
def _redis_client_cached(url: str):
    return redis.Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_keepalive=True,
        socket_keepalive_options={},
    )


def _redis_client():
    try:
        url = current_app.config.get("TASK_QUEUE_REDIS_URL", "redis://localhost:6379/0")
    except RuntimeError:
        url = os.getenv("TASK_QUEUE_REDIS_URL", "redis://localhost:6379/0")

    try:
        return _redis_client_cached(url)
    except Exception:
        return None


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


def _publish_notification(notification):
    client = _redis_client()
    if client is None:
        return False

    try:
        client.publish(
            _notification_channel(notification.get("user_id")),
            json.dumps(
                {
                    "type": "notification.created",
                    "notification": _serialize_notification(notification),
                }
            ),
        )
        return True
    except Exception:
        return False


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
    publish_realtime=True,
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

    # Publish realtime notification in background thread to avoid blocking response
    if publish_realtime:
        thread = threading.Thread(
            target=_publish_notification,
            args=(doc,),
            daemon=True,
        )
        thread.start()

    return doc


def create_attendance_notification(
    *,
    user_id,
    subject_name: str,
    subject_code: str,
    lecturer_name: str,
    status: str,
    committed_at=None,
    publish_realtime=True,
):
    event_time = to_india_time(committed_at)
    current_date = event_time.strftime("%d %b %Y")
    current_time = event_time.strftime("%I:%M %p").lstrip("0") or event_time.strftime("%I:%M %p")
    safe_subject_name = subject_name or "your subject"
    safe_subject_code = subject_code or "N/A"
    safe_lecturer_name = lecturer_name or "your lecturer"
    safe_status = status or "Present"

    if safe_status == "Absent":
        body = (
            f"[{current_date}, {current_time}] You're not present for "
            f"{safe_subject_name} [{safe_subject_code}]. Please attend classes regularly."
        )
        title = f"Absent: {safe_subject_code}"
    else:
        body = (
            f"[{current_date}, {current_time}] Today your attendance for "
            f"{safe_subject_name} [{safe_subject_code}] has been marked {safe_status} "
            f"and recorded successfully by {safe_lecturer_name}."
        )
        title = f"Attendance recorded for {safe_subject_code}"

    return create_notification(
        user_id=user_id,
        title=title,
        body=body,
        category="academic",
        priority="high" if safe_status == "Absent" else "high",
        action_url="/student/attendance",
        template_key="attendance_session_committed",
        metadata={
            "subject_name": safe_subject_name,
            "subject_code": safe_subject_code,
            "lecturer_name": safe_lecturer_name,
            "status": safe_status,
            "committed_at": event_time.isoformat(),
        },
        publish_realtime=publish_realtime,
    )


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
        doc["_id"] = result.upserted_id
        _publish_notification(doc)
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
