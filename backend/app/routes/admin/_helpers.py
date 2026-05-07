"""Admin CRUD routes — Courses, Papers, Lecturers, Students, Enrollment, Audit.

NOTE: This is currently a "god file" (>6,000 lines). Future refactoring should 
decompose this into domain-specific blueprints:
- `admin_courses.py`
- `admin_papers.py` 
- `admin_lecturers.py`
- `admin_students.py`
- `admin_attendance.py`
- `admin_jobs.py`
"""

import re
import random
import secrets
import os
import time
import csv
from io import BytesIO, StringIO
import openpyxl
from datetime import datetime, timedelta, timezone
import cv2
import numpy as np
from threading import Lock, Thread
from collections import OrderedDict
from uuid import uuid4

from flask import Blueprint, request, jsonify, current_app, send_file, has_app_context
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

try:
    import redis
except Exception:  # pragma: no cover - optional dependency at runtime
    redis = None

from app.extensions import get_collection
from app.models.attendance import log_attendance, get_approved_leave_dates, session_date_str
from app.models.audit import log_action, get_audit_logs, get_audit_log_by_id, mark_audit_log_rolled_back
from app.models.course import (
    create_course,
    get_all_courses,
    get_course_by_id,
    get_course_by_code,
    update_course,
    delete_course,
    is_course_active,
)
from app.models.enrollment import (
    create_student_profile,
    get_profile_by_user,
    get_profile_by_id,
    add_face_embedding,
    set_face_embeddings,
    enroll_in_papers,
    get_all_profiles,
    update_profile,
    delete_profile,
)
from app.models.paper import (
    create_paper,
    get_all_papers,
    get_paper_by_id,
    get_paper_by_code,
    get_papers_by_course,
    update_paper,
    delete_paper,
    bulk_assign_lecturer,
    bulk_assign_course,
)
from app.models.user import (
    create_user,
    get_users_by_role,
    get_users_by_ids,
    update_user,
    delete_user,
    find_user_by_id,
    find_user_by_email,
    reset_user_password,
    set_user_pin,
)
from app.services.face_detection import get_detector
from app.services.face_recognition import generate_embedding, generate_embeddings_batch
from app.services.capture_upload import capture_faces_for_user, save_student_upload, save_cropped_face_dataset
from utilities.train_model import train_and_save_face_model
from app.utils.auth_decorators import role_required, super_admin_required, validate_ids
from app.security.rbac import (
    dept_scope_filter,
    is_super_admin,
    get_user_department_id,
)
from app.models.department import (
    create_department,
    get_all_departments,
    get_department_by_id,
    get_department_by_code,
    update_department,
    delete_department as soft_delete_department,
)
from app.utils.helpers import (
    sanitise_mongo_doc, 
    sanitise_many, 
    decode_base64_image, 
    decode_image_bytes,
    _to_int,
    _as_text,
    _id_variants
)
from app.utils.timezone import india_timestamp_token
from app.utils.validation import validate_password_strength
from app.services.email_service import (
    send_welcome_email,
    send_password_reset_email,
    send_shortage_alert_email,
    is_email_delivery_enabled,
)


_QUERY_CACHE = OrderedDict()
_QUERY_CACHE_LOCK = Lock()
_QUERY_CACHE_TTL_SECONDS = 30
_QUERY_CACHE_MAX_ENTRIES_DEFAULT = 500
_ELIGIBILITY_CACHE_TTL_SECONDS = 20
_QUEUE_CLIENT = None
_QUEUE_CLIENT_LOCK = Lock()
_QUEUE_UNAVAILABLE_LOGGED = False
_AUDIT_EXCLUDED_ACTIONS = [
    "paper_profile_read",
    "paper_profile_count",
    "student_profile_read",
    "student_profile_read_by_id",
    "student_profiles_bulk_read",
]


# ---------------------------------------------------------------------------
# Department scoping helpers
# ---------------------------------------------------------------------------

def _dept_filter(user):
    """Build a MongoDB query filter for department-level data isolation.

    • super_admin → {} (all data) unless they pass ?department_id=…
    • department_admin / lecturer → {department_id: <their dept>}
    """
    return dept_scope_filter(user)


def _user_dept_id(user):
    """Return the user's department_id as ObjectId (or None for super_admin)."""
    return get_user_department_id(user)

def _get_paginated_data(collection, filter_query, page=1, per_page=10, sort=None, project=None):
    """Refactored pagination helper to ensure consistency across all admin routes."""
    try:
        page = max(1, int(page or 1))
        per_page = max(1, int(per_page or 10))
    except (ValueError, TypeError):
        page = 1
        per_page = 10
        
    skip = (page - 1) * per_page
    
    cursor = collection.find(filter_query, project)
    if sort:
        cursor = cursor.sort(sort)
    
    total = collection.count_documents(filter_query)
    data = list(cursor.skip(skip).limit(per_page))
    
    return {
        "data": data,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page
    }


class _JobCancelledError(Exception):
    """Raised when a background job cancellation request is detected."""


def _utcnow():
    return datetime.now(timezone.utc)


def _temp_pass_display_enabled():
    return bool(current_app.config.get("TEMP_PASS_DISPLAY_ENABLED", False))


def _cache_get(key):
    now = time.monotonic()
    with _QUERY_CACHE_LOCK:
        item = _QUERY_CACHE.get(key)
        if not item:
            return None
        if item.get("expires_at", 0) <= now:
            _QUERY_CACHE.pop(key, None)
            return None
        # Move to end on access for LRU ordering
        _QUERY_CACHE.move_to_end(key)
        return item.get("value")


def _cache_set(key, value, ttl_seconds):
    ttl = max(1, int(ttl_seconds or _QUERY_CACHE_TTL_SECONDS))
    max_entries = _QUERY_CACHE_MAX_ENTRIES_DEFAULT
    if has_app_context():
        try:
            max_entries = max(50, int(current_app.config.get("QUERY_CACHE_MAX_ENTRIES", _QUERY_CACHE_MAX_ENTRIES_DEFAULT)))
        except Exception:
            max_entries = _QUERY_CACHE_MAX_ENTRIES_DEFAULT

    with _QUERY_CACHE_LOCK:
        # O(1) LRU eviction using OrderedDict
        while len(_QUERY_CACHE) >= max_entries:
            _QUERY_CACHE.popitem(last=False)

        _QUERY_CACHE[key] = {
            "value": value,
            "expires_at": time.monotonic() + ttl,
        }
        _QUERY_CACHE.move_to_end(key)


def _cache_payload(key, ttl_seconds, builder):
    cached = _cache_get(key)
    if cached is not None:
        return cached
    value = builder()
    _cache_set(key, value, ttl_seconds)
    return value


def _clear_query_cache():
    with _QUERY_CACHE_LOCK:
        _QUERY_CACHE.clear()


def _update_training_job_progress(
    job_id,
    *,
    total_faces=None,
    processed_faces=None,
    trained_faces=None,
    failed_faces=None,
    stage=None,
    message=None,
):
    updates = {}
    if total_faces is not None:
        updates["training_total_faces"] = max(0, _to_int(total_faces, 0))
    if processed_faces is not None:
        updates["training_processed_faces"] = max(0, _to_int(processed_faces, 0))
    if trained_faces is not None:
        updates["training_trained_faces"] = max(0, _to_int(trained_faces, 0))
    if failed_faces is not None:
        updates["training_failed_faces"] = max(0, _to_int(failed_faces, 0))
    if stage is not None:
        updates["training_stage"] = _as_text(stage)
    if message is not None:
        updates["training_message"] = _as_text(message)

    current_job = _get_background_job(job_id) or {}
    total = updates.get("training_total_faces", _to_int(current_job.get("training_total_faces"), 0))
    processed = updates.get("training_processed_faces", _to_int(current_job.get("training_processed_faces"), 0))

    if total > 0:
        updates["training_progress_percent"] = round((processed / total) * 100, 2)
    else:
        updates["training_progress_percent"] = 0

    _update_background_job(job_id, **updates)


def _create_background_job(job_type, payload=None):
    job_id = str(uuid4())
    now = _utcnow()
    max_attempts = max(1, _to_int(current_app.config.get("TASK_QUEUE_MAX_RETRIES", 3), 3))
    get_collection("attendance", "background_jobs").insert_one(
        {
            "job_id": job_id,
            "job_type": job_type,
            "status": "queued",
            "created_at": now,
            "updated_at": now,
            "next_attempt_at": now,
            "attempts": 0,
            "max_attempts": max_attempts,
            "payload": payload or {},
            "retry_count": 0,
            "retry_in_seconds": None,
            "last_error_at": None,
            "dead_lettered_at": None,
            "error_history": [],
            "training_total_faces": 0,
            "training_processed_faces": 0,
            "training_trained_faces": 0,
            "training_failed_faces": 0,
            "training_stage": "queued",
            "training_message": "Queued",
            "training_progress_percent": 0,
            "cancel_requested": False,
            "cancelled_at": None,
        }
    )
    return job_id


def _update_background_job(job_id, **updates):
    updates["updated_at"] = _utcnow()
    get_collection("attendance", "background_jobs").update_one(
        {"job_id": job_id},
        {"$set": updates},
    )


def _get_background_job(job_id):
    return get_collection("attendance", "background_jobs").find_one({"job_id": job_id})

def _is_job_cancel_requested(job_id):
    job = _get_background_job(job_id)
    if not job:
        return False
    return bool(job.get("cancel_requested", False))

def _raise_if_job_cancelled(job_id):
    if job_id and _is_job_cancel_requested(job_id):
        raise _JobCancelledError("Job cancelled by user")


def _get_queue_names():
    queue_name = current_app.config.get("TASK_QUEUE_NAME", "biometric:jobs")
    delayed_queue_name = f"{queue_name}:delayed"
    return queue_name, delayed_queue_name


def _get_task_queue_client():
    global _QUEUE_CLIENT, _QUEUE_UNAVAILABLE_LOGGED
    if not current_app.config.get("TASK_QUEUE_ENABLED", False):
        return None

    if redis is None:
        return None

    with _QUEUE_CLIENT_LOCK:
        if _QUEUE_CLIENT is not None:
            return _QUEUE_CLIENT

        queue_url = current_app.config.get("TASK_QUEUE_REDIS_URL")
        if not queue_url:
            return None

        try:
            client = redis.Redis.from_url(queue_url, decode_responses=True)
            # Validate connectivity once so callers don't explode on first command.
            client.ping()
            _QUEUE_CLIENT = client
            _QUEUE_UNAVAILABLE_LOGGED = False
            return _QUEUE_CLIENT
        except Exception as exc:
            _QUEUE_CLIENT = None
            if not _QUEUE_UNAVAILABLE_LOGGED:
                current_app.logger.warning(
                    "Redis unavailable (%s). Falling back to local in-process queue mode.",
                    exc,
                )
                _QUEUE_UNAVAILABLE_LOGGED = True
            return None


def _enqueue_background_job(job_id, delay_seconds=0):
    client = _get_task_queue_client()
    if client is None:
        return False

    queue_name, delayed_queue_name = _get_queue_names()
    delay_seconds = max(0, int(delay_seconds or 0))
    if delay_seconds > 0:
        run_at = int(time.time()) + delay_seconds
        client.zadd(delayed_queue_name, {job_id: run_at})
    else:
        client.lpush(queue_name, job_id)
    return True


def promote_due_delayed_jobs(max_items=100):
    client = _get_task_queue_client()
    if client is None:
        return 0

    queue_name, delayed_queue_name = _get_queue_names()
    now_ts = int(time.time())
    moved = 0
    candidates = client.zrangebyscore(delayed_queue_name, 0, now_ts, start=0, num=max(1, int(max_items)))
    for job_id in candidates:
        if client.zrem(delayed_queue_name, job_id):
            client.lpush(queue_name, job_id)
            moved += 1
    return moved


def _compute_retry_delay_seconds(attempt_number):
    base = max(1, _to_int(current_app.config.get("TASK_QUEUE_BASE_BACKOFF_SECONDS", 10), 10))
    cap = max(base, _to_int(current_app.config.get("TASK_QUEUE_MAX_BACKOFF_SECONDS", 300), 300))
    exponent = max(0, int(attempt_number) - 1)
    raw_delay = min(base * (2 ** exponent), cap)
    jitter_ratio = _to_float(current_app.config.get("TASK_QUEUE_BACKOFF_JITTER_RATIO", 0.25), 0.25)
    jitter_ratio = max(0.0, min(jitter_ratio, 0.9))
    jitter_multiplier = random.uniform(1.0 - jitter_ratio, 1.0 + jitter_ratio)  # nosec B311
    return max(1, int(round(raw_delay * jitter_multiplier)))


def recover_stuck_background_jobs(max_items=50):
    jobs = get_collection("attendance", "background_jobs")
    timeout_seconds = max(30, _to_int(current_app.config.get("TASK_QUEUE_RUNNING_TIMEOUT_SECONDS", 900), 900))
    cutoff = _utcnow() - timedelta(seconds=timeout_seconds)
    stale_jobs = list(
        jobs.find(
            {"status": "running", "updated_at": {"$lte": cutoff}},
            {"job_id": 1},
        ).limit(max(1, int(max_items)))
    )

    recovered = 0
    for row in stale_jobs:
        job_id = _as_text(row.get("job_id"))
        if not job_id:
            continue

        now = _utcnow()
        res = jobs.update_one(
            {"job_id": job_id, "status": "running"},
            {
                "$set": {
                    "status": "queued",
                    "next_attempt_at": now,
                    "updated_at": now,
                    "error": "Recovered from stale running state",
                }
            },
        )
        if not res.modified_count:
            continue

        recovered += 1
        try:
            enqueued = _enqueue_background_job(job_id)
        except Exception:
            current_app.logger.exception("Recovery enqueue failed for stale job %s", job_id)
            enqueued = False

        if not enqueued:
            _schedule_local_retry(job_id, 1)

    return recovered


def _schedule_local_retry(job_id, delay_seconds):
    app = current_app._get_current_object()

    def _runner():
        time.sleep(max(0, int(delay_seconds or 0)))
        with app.app_context():
            process_background_job(job_id)

    Thread(target=_runner, daemon=True).start()


def _execute_background_job(job):
    job_type = _as_text(job.get("job_type"))
    payload = job.get("payload") or {}
    job_id = _as_text(job.get("job_id"))

    if job_type == "train_face_from_dataset":
        actor_id = _as_text(payload.get("actor_id"))
        user_id = _as_text(payload.get("user_id"))
        return _train_single_face_job(actor_id, user_id, job_id=job_id)

    if job_type == "bulk_train_face":
        actor_id = _as_text(payload.get("actor_id"))
        user_ids = payload.get("user_ids") or []
        return _train_bulk_faces_job(actor_id, user_ids, job_id=job_id)

    if job_type == "rebuild_all_face_embeddings":
        actor_id = _as_text(payload.get("actor_id"))
        return _rebuild_all_faces_job(actor_id, job_id=job_id)

    raise ValueError(f"Unsupported background job type: {job_type}")


def process_background_job(job_id):
    job = _get_background_job(job_id)
    if not job:
        return {"status": "missing"}

    status = _as_text(job.get("status")).lower()
    if status in {"completed", "dead_letter", "cancelled"}:
        return {"status": "skipped", "reason": status}

    if bool(job.get("cancel_requested", False)):
        _update_background_job(
            job_id,
            status="cancelled",
            training_stage="cancelled",
            training_message="Cancelled by user",
            finished_at=_utcnow(),
            cancelled_at=_utcnow(),
            retry_in_seconds=None,
        )
        return {"status": "cancelled"}

    max_attempts = max(1, _to_int(job.get("max_attempts"), 3))
    attempts = max(0, _to_int(job.get("attempts"), 0))
    current_attempt = attempts + 1

    _update_background_job(
        job_id,
        status="running",
        attempts=current_attempt,
        started_at=job.get("started_at") or _utcnow(),
        next_attempt_at=None,
        training_stage="running",
    )
    try:
        _raise_if_job_cancelled(job_id)
        result = _execute_background_job(job)
        _update_background_job(
            job_id,
            status="completed",
            training_stage="completed",
            training_message="Training complete",
            training_progress_percent=100,
            result=result,
            error=None,
            finished_at=_utcnow(),
            retry_in_seconds=None,
        )
        _clear_query_cache()
        return {"status": "completed", "result": result}
    except _JobCancelledError:
        _update_background_job(
            job_id,
            status="cancelled",
            training_stage="cancelled",
            training_message="Cancelled by user",
            finished_at=_utcnow(),
            cancelled_at=_utcnow(),
            error=None,
            retry_in_seconds=None,
        )
        return {"status": "cancelled"}
    except Exception as exc:
        current_app.logger.exception("Background job %s failed", job_id)
        error_text = str(exc)
        error_now = _utcnow()
        existing_history = job.get("error_history") or []
        if not isinstance(existing_history, list):
            existing_history = []

        next_history = list(existing_history)
        next_history.append(
            {
                "attempt": current_attempt,
                "error": error_text,
                "at": error_now,
            }
        )
        if len(next_history) > 10:
            next_history = next_history[-10:]

        if current_attempt < max_attempts:
            delay_seconds = _compute_retry_delay_seconds(current_attempt)
            next_attempt = error_now + timedelta(seconds=delay_seconds)
            _update_background_job(
                job_id,
                status="queued",
                error=error_text,
                next_attempt_at=next_attempt,
                retry_count=current_attempt,
                retry_in_seconds=delay_seconds,
                last_error_at=error_now,
                error_history=next_history,
            )

            try:
                enqueued = _enqueue_background_job(job_id, delay_seconds=delay_seconds)
            except Exception:
                current_app.logger.exception("Retry enqueue failed for job %s", job_id)
                enqueued = False

            if not enqueued:
                _schedule_local_retry(job_id, delay_seconds)

            return {
                "status": "retry_scheduled",
                "attempt": current_attempt,
                "max_attempts": max_attempts,
                "retry_in_seconds": delay_seconds,
            }

        _update_background_job(
            job_id,
            status="dead_letter",
            error=error_text,
            finished_at=error_now,
            dead_lettered_at=error_now,
            retry_count=max(0, current_attempt - 1),
            retry_in_seconds=None,
            last_error_at=error_now,
            error_history=next_history,
        )
        return {
            "status": "dead_letter",
            "attempt": current_attempt,
            "max_attempts": max_attempts,
            "error": error_text,
        }


def _run_background_job(app, job_id):
    with app.app_context():
        process_background_job(job_id)


def _launch_background_job(app, job_type, payload):
    job_id = _create_background_job(job_type, payload)

    if current_app.config.get("TASK_QUEUE_ENABLED", False):
        if _enqueue_background_job(job_id):
            return job_id

    env = str(current_app.config.get("ENV") or "").lower()
    if env not in {"development", "dev", "local", "testing", "test"}:
        raise RuntimeError("Background jobs require TASK_QUEUE_ENABLED in non-local environments")

    thread = Thread(target=_run_background_job, args=(app, job_id), daemon=True)
    thread.start()
    return job_id


def _normalise_year(value):
    if value is None:
        return ""
    text = _as_text(value)
    return text



def _to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_object_id(value):
    if isinstance(value, ObjectId):
        return value
    text = _as_text(value)
    if not text:
        return None
    try:
        return ObjectId(text)
    except Exception:
        return None



def _normalise_filter_ids(filter_doc):
    if not isinstance(filter_doc, dict):
        return filter_doc
    out = dict(filter_doc)
    if "_id" in out:
        if isinstance(out["_id"], dict):
            oid_map = dict(out["_id"])
            if "$in" in oid_map and isinstance(oid_map["$in"], list):
                oid_map["$in"] = [_as_object_id(v) or v for v in oid_map["$in"]]
            out["_id"] = oid_map
        else:
            out["_id"] = _as_object_id(out["_id"]) or out["_id"]
    return out


def _normalise_document_ids(doc):
    if not isinstance(doc, dict):
        return doc
    out = dict(doc)
    if "_id" in out:
        out["_id"] = _as_object_id(out["_id"]) or out["_id"]
    return out


def _rb_delete(db, collection, filter_doc):
    return {
        "type": "delete_document",
        "db": db,
        "collection": collection,
        "filter": filter_doc,
    }


def _rb_restore(db, collection, document):
    return {
        "type": "restore_document",
        "db": db,
        "collection": collection,
        "document": document,
    }


def _rb_replace(db, collection, filter_doc, previous_document):
    return {
        "type": "replace_document",
        "db": db,
        "collection": collection,
        "filter": filter_doc,
        "previous_document": previous_document,
    }


def _rb_batch(operations):
    return {"type": "batch", "operations": operations}


def _execute_rollback_operation(operation):
    op_type = operation.get("type")
    if op_type == "batch":
        for op in operation.get("operations") or []:
            _execute_rollback_operation(op)
        return

    db = operation.get("db")
    collection = operation.get("collection")
    if not db or not collection:
        return

    col = get_collection(db, collection)

    if op_type == "delete_document":
        filt = _normalise_filter_ids(operation.get("filter") or {})
        if filt:
            col.delete_many(filt)
        return

    if op_type == "replace_document":
        filt = _normalise_filter_ids(operation.get("filter") or {})
        prev_doc = _normalise_document_ids(operation.get("previous_document") or {})
        if filt and prev_doc:
            col.replace_one(filt, prev_doc, upsert=True)
        return

    if op_type == "restore_document":
        doc = _normalise_document_ids(operation.get("document") or {})
        if not doc:
            return

        if doc.get("_id") is not None:
            col.replace_one({"_id": doc.get("_id")}, doc, upsert=True)
        elif doc.get("user_id"):
            col.replace_one({"user_id": doc.get("user_id")}, doc, upsert=True)
        else:
            col.insert_one(doc)


def _derive_academic_session(enrollment_year, course_duration):
    """Build session label like 2024-26 from start year and duration."""
    start_year = _to_int(enrollment_year, datetime.now(timezone.utc).year)
    duration_years = max(1, _to_int(course_duration, 1))
    end_year_short = str(start_year + duration_years)[-2:]
    return f"{start_year}-{end_year_short}"


def _safe_find_user(user_id):
    try:
        return find_user_by_id(user_id)
    except Exception:
        return None


def _safe_get_profile_by_id(profile_id):
    try:
        return get_profile_by_id(profile_id)
    except Exception:
        return None


def _get_profile_by_user_any(user_id):
    """Resolve student profile by user_id across legacy string/ObjectId storage."""
    variants = _id_variants(user_id)
    if not variants:
        return None
    profiles = get_collection("academic", "student_profiles")
    return profiles.find_one({"user_id": {"$in": variants}})


def _safe_get_course(course_id):
    try:
        return get_course_by_id(course_id)
    except Exception:
        return None


def _course_is_inactive(course):
    if not course:
        return True
    return str(course.get("status") or "active").lower() != "active"


def _get_active_course_or_error(course_id):
    course = _safe_get_course(course_id)
    if not course:
        return None, (jsonify({"error": "Course not found"}), 404)
    if _course_is_inactive(course):
        return None, (jsonify({"error": "Course is inactive. Reassign entities to an active course first."}), 409)
    return course, None


def _ensure_student_course_active(user_id):
    profile = _get_profile_by_user_any(user_id)
    if not profile:
        return None, (jsonify({"error": "Student profile not found"}), 404)
    course = _safe_get_course(profile.get("course_id"))
    if _course_is_inactive(course):
        return profile, (jsonify({"error": "Student is linked to an inactive course and is read-only"}), 409)
    return profile, None


def _ensure_paper_course_active(paper):
    course_id = _as_text((paper or {}).get("course_id"))
    if not course_id:
        return jsonify({"error": "Paper is not linked to a valid course"}), 409
    if not is_course_active(course_id):
        return jsonify({"error": "Paper is linked to an inactive course and is read-only"}), 409
    return None


def _detach_lecturers_from_course_papers(course_id):
    """Clear lecturer assignments for all papers under a given course."""
    papers_col = get_collection("academic", "papers")
    course_keys = {_as_text(v) for v in _id_variants(course_id) if _as_text(v)}
    if not course_keys:
        return 0, []

    assigned_papers = list(
        papers_col.find({"lecturer_id": {"$nin": [None, ""]}})
    )

    affected_papers = [
        p for p in assigned_papers
        if _as_text(p.get("course_id")) in course_keys
    ]
    if not affected_papers:
        return 0, []

    affected_ids = [p.get("_id") for p in affected_papers if p.get("_id") is not None]
    if not affected_ids:
        return 0, []

    res = papers_col.update_many(
        {"_id": {"$in": affected_ids}},
        {"$set": {"lecturer_id": None}},
    )
    return int(res.modified_count or 0), affected_papers


def _legacy_safe_name(raw_value):
    text = _as_text(raw_value)
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in text)
    return cleaned.strip("_") or "unknown"


def _resolve_dataset_dir_for_user(user_id):
    user_id_text = _as_text(user_id)
    dataset_dir = os.path.join("dataset", user_id_text)
    if os.path.isdir(dataset_dir):
        return dataset_dir

    # Backward compatibility for previously created name-based dataset folders.
    student = find_user_by_id(user_id) or {}
    legacy_name = _as_text(student.get("name"))
    legacy_dataset_dir = os.path.join("dataset", _legacy_safe_name(legacy_name))
    if os.path.isdir(legacy_dataset_dir):
        return legacy_dataset_dir

    return dataset_dir


def _train_embeddings_from_dataset_for_user(user_id):
    dataset_dir = _resolve_dataset_dir_for_user(user_id)
    if not os.path.isdir(dataset_dir):
        raise ValueError(
            f"Dataset folder not found for this student. Please run Enroll Face first to capture dataset images. Expected: {dataset_dir}"
        )

    allowed_ext = {".jpg", ".jpeg", ".png"}
    image_files = [
        os.path.join(dataset_dir, name)
        for name in sorted(os.listdir(dataset_dir))
        if os.path.splitext(name.lower())[1] in allowed_ext
    ]

    if not image_files:
        raise ValueError("No dataset images found for training")

    detector = get_detector()
    valid_crops = []
    skipped = 0

    for file_path in image_files:
        img_bgr = cv2.imread(file_path, cv2.IMREAD_COLOR)
        if img_bgr is None:
            skipped += 1
            continue

        try:
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            faces = detector.detect_faces(img_rgb)
            if not faces:
                skipped += 1
                continue
            valid_crops.append(faces[0]["crop"])
        except Exception:
            skipped += 1
            continue

    if not valid_crops:
        raise ValueError("Training failed: no valid faces found in dataset images")

    raw_embeddings = generate_embeddings_batch(valid_crops)
    
    embeddings = []
    seen_signatures = set()
    for embedding in raw_embeddings:
        signature = tuple(np.round(np.asarray(embedding, dtype=np.float32), 3))
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)
        embeddings.append(embedding.tolist() if hasattr(embedding, "tolist") else embedding)

    if not embeddings:
        raise ValueError("Training failed: no valid faces found in dataset images")

    # Keep the strongest set of embeddings, but cap the storage size to reduce noisy duplicates.
    if len(embeddings) > 25:
        embeddings = embeddings[:25]

    set_face_embeddings(user_id, embeddings)
    return {
        "dataset_dir": dataset_dir,
        "trained_embeddings": len(embeddings),
        "skipped_images": skipped,
    }


def _refresh_face_trainer_artifact():
    """Rebuild the showcase .h5 trainer from the current dataset tree."""
    try:
        return train_and_save_face_model(
            dataset_root="dataset",
            trainer_dir="trainer",
            model_filename="face_trainer.keras",
        )
    except Exception as exc:
        current_app.logger.exception("Face trainer export failed")
        return {
            "model_path": None,
            "error": str(exc),
        }


def _resolve_user_identity(user_identifier):
    """Resolve route id that may be either user_id or profile_id."""
    profile = _get_profile_by_user_any(user_identifier)
    if profile:
        return _as_text(profile.get("user_id")) or _as_text(user_identifier), profile

    profile = _safe_get_profile_by_id(user_identifier)
    if profile:
        return _as_text(profile.get("user_id")), profile

    user = _safe_find_user(user_identifier)
    if user and user.get("role") == "student":
        return _as_text(user_identifier), _get_profile_by_user_any(user_identifier)

    return None, None


def _generate_registration_number(course, academic_session, exclude_user_id=None):
    """Generate a unique registration number, compatible with legacy and new session fields."""
    prefix = re.sub(r"[^A-Za-z0-9]", "", (course or {}).get("code", "STU")).upper() or "STU"
    session = _as_text(academic_session) or "NA"
    course_id = _as_text((course or {}).get("_id"))

    profiles = get_collection("academic", "student_profiles")
    query = {
        "course_id": course_id,
        "$or": [
            {"academic_session": session},
            {"academic_year": session},
            {"year": session},
        ],
    }

    pattern = re.compile(rf"^{re.escape(prefix)}-{re.escape(session)}-(\\d+)$")
    max_seq = 0
    for row in profiles.find(query, {"reg_number": 1}):
        reg = _as_text(row.get("reg_number"))
        m = pattern.match(reg)
        if m:
            max_seq = max(max_seq, _to_int(m.group(1), 0))

    seq = max_seq + 1
    while True:
        candidate = f"{prefix}-{session}-{seq:03d}"
        existing = profiles.find_one({"reg_number": candidate}, {"user_id": 1})
        if not existing:
            return candidate
        if exclude_user_id and _as_text(existing.get("user_id")) == _as_text(exclude_user_id):
            return candidate
        seq += 1


def _enrich_paper(paper, course_map, lecturer_map):
    item = sanitise_mongo_doc(paper)
    course = course_map.get(item.get("course_id"))
    lecturer = lecturer_map.get(item.get("lecturer_id"))
    item["course_name"] = course.get("name") if course else None
    item["course_code"] = course.get("code") if course else None
    item["course_status"] = _as_text((course or {}).get("status") or "active").lower() or "active"
    item["is_course_inactive"] = item["course_status"] != "active"
    item["semester"] = item.get("semester")
    item["academic_year"] = item.get("academic_session") or item.get("academic_year")
    item["lecturer_name"] = lecturer.get("name") if lecturer else None
    item["lecturer_email"] = lecturer.get("email") if lecturer else None
    return item


def _to_bool(value):
    if isinstance(value, bool):
        return value
    text = _as_text(value).lower()
    return text in {"1", "true", "yes", "y"}


def _get_requested_pagination():
    page_raw = request.args.get("page")
    per_page_raw = request.args.get("per_page")

    if not _as_text(page_raw) and not _as_text(per_page_raw):
        return None

    page = max(1, _to_int(page_raw, 1))
    per_page = max(1, min(_to_int(per_page_raw, 20), 100))
    return page, per_page


def _paginate_items(items):
    pagination = _get_requested_pagination()
    if not pagination:
        return jsonify(items)

    page, per_page = pagination
    total = len(items)
    start = (page - 1) * per_page
    end = start + per_page

    return jsonify({
        "items": items[start:end],
        "total": total,
        "page": page,
        "per_page": per_page,
    })


# ─── Courses ────────────────────────────────────────────────────────────────



__all__ = [name for name in globals() if not name.startswith('__')]
