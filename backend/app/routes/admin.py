"""Admin CRUD routes — Courses, Papers, Lecturers, Students, Enrollment, Audit."""

import re
import random
import os
import time
from datetime import datetime, timedelta
import cv2
import numpy as np
from threading import Lock, Thread
from uuid import uuid4

from flask import Blueprint, request, jsonify, current_app
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

try:
    import redis
except Exception:  # pragma: no cover - optional dependency at runtime
    redis = None

from app.extensions import get_collection
from app.models.attendance import log_attendance
from app.models.audit import log_action, get_audit_logs, get_audit_log_by_id, mark_audit_log_rolled_back
from app.models.course import (
    create_course,
    get_all_courses,
    get_course_by_id,
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
    generate_temp_password,
    reset_user_password,
)
from app.services.face_detection import get_detector
from app.services.face_recognition import generate_embedding, normalize_embedding
from app.services.capture_upload import capture_faces_for_user, save_student_upload, save_cropped_face_dataset
from app.utils.auth_decorators import role_required
from app.utils.helpers import sanitise_mongo_doc, sanitise_many, decode_base64_image

admin_bp = Blueprint("admin", __name__)

_QUERY_CACHE = {}
_QUERY_CACHE_LOCK = Lock()
_QUERY_CACHE_TTL_SECONDS = 30
_ELIGIBILITY_CACHE_TTL_SECONDS = 20
_QUEUE_CLIENT = None
_QUEUE_CLIENT_LOCK = Lock()


def _utcnow():
    return datetime.utcnow()


def _cache_get(key):
    now = time.monotonic()
    with _QUERY_CACHE_LOCK:
        item = _QUERY_CACHE.get(key)
        if not item:
            return None
        if item.get("expires_at", 0) <= now:
            _QUERY_CACHE.pop(key, None)
            return None
        return item.get("value")


def _cache_set(key, value, ttl_seconds):
    with _QUERY_CACHE_LOCK:
        _QUERY_CACHE[key] = {
            "value": value,
            "expires_at": time.monotonic() + ttl_seconds,
        }


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


def _get_queue_names():
    queue_name = current_app.config.get("TASK_QUEUE_NAME", "biometric:jobs")
    delayed_queue_name = f"{queue_name}:delayed"
    return queue_name, delayed_queue_name


def _get_task_queue_client():
    global _QUEUE_CLIENT
    if redis is None:
        return None

    with _QUEUE_CLIENT_LOCK:
        if _QUEUE_CLIENT is not None:
            return _QUEUE_CLIENT

        queue_url = current_app.config.get("TASK_QUEUE_REDIS_URL")
        if not queue_url:
            return None

        _QUEUE_CLIENT = redis.Redis.from_url(queue_url, decode_responses=True)
        return _QUEUE_CLIENT


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
    jitter_multiplier = random.uniform(1.0 - jitter_ratio, 1.0 + jitter_ratio)
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

    if job_type == "bulk_train_face":
        actor_id = _as_text(payload.get("actor_id"))
        student_ids = payload.get("student_ids") or []
        return _train_bulk_faces_job(actor_id, student_ids)

    if job_type == "rebuild_all_face_embeddings":
        actor_id = _as_text(payload.get("actor_id"))
        return _rebuild_all_faces_job(actor_id)

    raise ValueError(f"Unsupported background job type: {job_type}")


def process_background_job(job_id):
    job = _get_background_job(job_id)
    if not job:
        return {"status": "missing"}

    status = _as_text(job.get("status")).lower()
    if status in {"completed", "dead_letter"}:
        return {"status": "skipped", "reason": status}

    max_attempts = max(1, _to_int(job.get("max_attempts"), 3))
    attempts = max(0, _to_int(job.get("attempts"), 0))
    current_attempt = attempts + 1

    _update_background_job(
        job_id,
        status="running",
        attempts=current_attempt,
        started_at=job.get("started_at") or _utcnow(),
        next_attempt_at=None,
    )
    try:
        result = _execute_background_job(job)
        _update_background_job(
            job_id,
            status="completed",
            result=result,
            error=None,
            finished_at=_utcnow(),
        )
        _clear_query_cache()
        return {"status": "completed", "result": result}
    except Exception as exc:
        current_app.logger.exception("Background job %s failed", job_id)
        error_text = str(exc)
        if current_attempt < max_attempts:
            delay_seconds = _compute_retry_delay_seconds(current_attempt)
            next_attempt = _utcnow() + timedelta(seconds=delay_seconds)
            _update_background_job(
                job_id,
                status="queued",
                error=error_text,
                next_attempt_at=next_attempt,
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
            finished_at=_utcnow(),
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
        try:
            if _enqueue_background_job(job_id):
                return job_id
        except Exception:
            app.logger.exception("Queue enqueue failed for job %s; falling back to local thread", job_id)

    thread = Thread(target=_run_background_job, args=(app, job_id), daemon=True)
    thread.start()
    return job_id


def _as_text(value):
    return str(value or "").strip()


def _normalise_year(value):
    if value is None:
        return ""
    text = _as_text(value)
    return text


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


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


def _id_variants(value):
    """Return equivalent ID representations to handle mixed string/ObjectId legacy data."""
    variants = []
    text = _as_text(value)
    if text:
        variants.append(text)
    oid = _as_object_id(value)
    if oid is not None and oid not in variants:
        variants.append(oid)
    return variants


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
    start_year = _to_int(enrollment_year, datetime.utcnow().year)
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
    profile = get_profile_by_user(user_id)
    if not profile:
        return None, (jsonify({"error": "Student profile not found"}), 404)
    course = _safe_get_course(profile.get("course_id"))
    if _course_is_inactive(course):
        return profile, (jsonify({"error": "Student is linked to an inactive course and is read-only"}), 409)
    return profile, None


def _ensure_paper_course_active(paper):
    course_id = _as_text((paper or {}).get("course_id"))
    if not course_id:
        return jsonify({"error": "Subject is not linked to a valid course"}), 409
    if not is_course_active(course_id):
        return jsonify({"error": "Subject is linked to an inactive course and is read-only"}), 409
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
    embeddings = []
    skipped = 0
    seen_signatures = set()

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

            embedding = normalize_embedding(generate_embedding(faces[0]["crop"]))
            signature = tuple(np.round(np.asarray(embedding, dtype=np.float32), 3))
            if signature in seen_signatures:
                skipped += 1
                continue

            seen_signatures.add(signature)
            embeddings.append(embedding)
        except Exception:
            skipped += 1
            continue

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


def _resolve_student_identity(student_identifier):
    """Resolve route id that may be either user_id or profile_id."""
    profile = get_profile_by_user(student_identifier)
    if profile:
        return student_identifier, profile

    profile = _safe_get_profile_by_id(student_identifier)
    if profile:
        return profile.get("user_id"), profile

    user = _safe_find_user(student_identifier)
    if user and user.get("role") == "student":
        return student_identifier, get_profile_by_user(student_identifier)

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

@admin_bp.route("/courses", methods=["GET"])
@role_required("admin")
def list_courses(user):
    courses = sanitise_many(get_all_courses(["name", "code", "department", "course_duration", "status"]))
    q = _as_text(request.args.get("q", "")).lower()
    course_duration = _as_text(request.args.get("course_duration", ""))
    status = _as_text(request.args.get("status", "")).lower()

    filtered = []
    for c in courses:
        c["status"] = _as_text(c.get("status") or "active").lower() or "active"
        if course_duration and str(c.get("course_duration", "")) != course_duration:
            continue
        if status and c.get("status") != status:
            continue
        if q and not (
            q in _as_text(c.get("name")).lower()
            or q in _as_text(c.get("code")).lower()
            or q in _as_text(c.get("department")).lower()
        ):
            continue
        filtered.append(c)

    return _paginate_items(filtered)


@admin_bp.route("/courses", methods=["POST"])
@role_required("admin")
def add_course(user):
    d = request.get_json(silent=True) or {}
    if not d.get("name") or not d.get("code") or not d.get("course_duration"):
        return jsonify({"error": "name, code and course_duration are required"}), 400
    course = create_course(
        d["name"],
        d["code"],
        d.get("department", ""),
        _to_int(d.get("course_duration"), 0),
    )
    log_action(
        "CREATE_COURSE",
        str(user["_id"]),
        details=f"Course {d['code']}",
        rollback=_rb_delete("academic", "courses", {"_id": course.get("_id")}),
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(course)), 201


@admin_bp.route("/courses/<cid>/semesters", methods=["GET"])
@role_required("admin")
def list_course_semesters(user, cid):
    """Return available semesters for a course (duration-derived + paper-derived)."""
    course = _safe_get_course(cid)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    semesters = set()

    duration_years = max(1, _to_int(course.get("course_duration"), 1))
    for sem in range(1, duration_years * 2 + 1):
        semesters.add(sem)

    papers = get_papers_by_course(cid)
    for paper in papers:
        sem = _to_int(paper.get("semester"), 0)
        if sem > 0:
            semesters.add(sem)

    return jsonify(sorted(list(semesters)))


@admin_bp.route("/courses/<cid>/sessions", methods=["GET"])
@role_required("admin")
def list_course_sessions(user, cid):
    """Return distinct academic sessions for a course."""
    course = _safe_get_course(cid)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    profiles = get_collection("academic", "student_profiles")
    sessions = set()
    course_duration = max(1, _to_int(course.get("course_duration"), 1))
    for row in profiles.aggregate([
        {"$match": {"course_id": cid}},
        {
            "$project": {
                "session": {
                    "$ifNull": [
                        "$academic_session",
                        {
                            "$ifNull": [
                                "$academic_year",
                                {
                                    "$ifNull": [
                                        "$year",
                                        {"$toString": {"$year": "$created_at"}},
                                    ]
                                },
                            ]
                        },
                    ]
                }
            }
        },
        {"$group": {"_id": "$session"}},
    ]):
        session = _as_text(row.get("_id"))
        if session:
            sessions.add(session)

    # Ensure at least current derived session appears when course has active profiles but no stored session field.
    if not sessions and profiles.count_documents({"course_id": cid}) > 0:
        now_year = datetime.utcnow().year
        sessions.add(_derive_academic_session(now_year, course_duration))

    return jsonify(sorted(sessions))


def _normalise_course_semester(course_id, semester):
    cid = _as_text(course_id)
    if not cid:
        return None, None, "course_id is required"

    course = _safe_get_course(cid)
    if not course:
        return None, None, "Course not found"
    if _course_is_inactive(course):
        return None, None, "Course is inactive. Reassign entities to an active course first"

    sem = _to_int(semester, 0)
    if sem <= 0:
        return None, None, "semester must be a positive integer"

    max_sem = max(1, _to_int(course.get("course_duration"), 1) * 2)
    if sem > max_sem:
        return None, None, f"semester must be between 1 and {max_sem} for selected course"

    return cid, sem, None


@admin_bp.route("/courses/<cid>", methods=["PUT"])
@role_required("admin")
def edit_course(user, cid):
    d = request.get_json(silent=True) or {}
    allowed = {"name", "code", "department", "course_duration", "status"}
    fields = {k: v for k, v in d.items() if k in allowed}
    if "course_duration" in fields:
        fields["course_duration"] = _to_int(fields.get("course_duration"), 0)
    if "status" in fields:
        next_status = _as_text(fields.get("status")).lower()
        if next_status not in {"active", "inactive"}:
            return jsonify({"error": "status must be active or inactive"}), 400
        fields["status"] = next_status

    previous = get_course_by_id(cid)
    if not previous:
        return jsonify({"error": "Course not found"}), 404

    prev_status = _as_text(previous.get("status") or "active").lower() or "active"
    next_status = _as_text(fields.get("status") or prev_status).lower() or "active"

    detached_count = 0
    detached_papers = []
    if prev_status == "active" and next_status == "inactive":
        detached_count, detached_papers = _detach_lecturers_from_course_papers(cid)

    updated = update_course(cid, fields)

    rollback_ops = [
        _rb_replace("academic", "courses", {"_id": cid}, previous),
    ]
    for doc in detached_papers:
        rollback_ops.append(_rb_replace("academic", "papers", {"_id": doc.get("_id")}, doc))

    details = f"Course {cid}"
    if detached_count > 0:
        details = f"Course {cid}; detached lecturers from {detached_count} paper(s)"

    log_action(
        "UPDATE_COURSE",
        str(user["_id"]),
        details=details,
        rollback=_rb_batch(rollback_ops),
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/courses/<cid>", methods=["DELETE"])
@role_required("admin")
def remove_course(user, cid):
    previous = get_course_by_id(cid)
    if not previous:
        return jsonify({"error": "Course not found"}), 404

    detached_count, detached_papers = _detach_lecturers_from_course_papers(cid)
    delete_course(cid)

    rollback_ops = [_rb_restore("academic", "courses", previous)]
    for doc in detached_papers:
        rollback_ops.append(_rb_replace("academic", "papers", {"_id": doc.get("_id")}, doc))

    details = f"Course {cid}"
    if detached_count > 0:
        details = f"Course {cid}; detached lecturers from {detached_count} paper(s)"

    log_action(
        "DEACTIVATE_COURSE",
        str(user["_id"]),
        details=details,
        rollback=_rb_batch(rollback_ops),
    )
    _clear_query_cache()
    return jsonify({
        "message": "Course marked inactive",
        "detached_lecturer_assignments": detached_count,
    }), 200


# ─── Papers ─────────────────────────────────────────────────────────────────

@admin_bp.route("/papers", methods=["GET"])
@role_required("admin")
def list_papers(user):
    papers = get_all_papers(["name", "code", "course_id", "lecturer_id", "semester", "total_classes", "created_at"])
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))
    lecturers = sanitise_many(get_users_by_role("lecturer"))
    course_map = {c["_id"]: c for c in courses}
    lecturer_map = {l["_id"]: l for l in lecturers}

    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    lecturer_id = _as_text(request.args.get("lecturer_id", ""))
    semester = _as_text(request.args.get("semester", ""))
    academic_year = _normalise_year(request.args.get("academic_year", ""))

    result = []
    for paper in papers:
        item = _enrich_paper(paper, course_map, lecturer_map)
        if course_id and item.get("course_id") != course_id:
            continue
        if lecturer_id and item.get("lecturer_id") != lecturer_id:
            continue
        if semester and str(item.get("semester", "")) != semester:
            continue
        if academic_year and _normalise_year(item.get("academic_year")) != academic_year:
            continue
        if q and not (
            q in _as_text(item.get("name")).lower()
            or q in _as_text(item.get("code")).lower()
            or q in _as_text(item.get("course_name")).lower()
            or q in _as_text(item.get("lecturer_name")).lower()
        ):
            continue
        result.append(item)

    return _paginate_items(sanitise_many(result))


@admin_bp.route("/papers", methods=["POST"])
@role_required("admin")
def add_paper(user):
    d = request.get_json(silent=True) or {}
    if not d.get("name") or not d.get("code") or not d.get("course_id") or not d.get("lecturer_id") or not d.get("semester"):
        return jsonify({"error": "name, code, course_id, lecturer_id and semester are required"}), 400

    course_id, semester, error = _normalise_course_semester(d.get("course_id"), d.get("semester"))
    if error:
        return jsonify({"error": error}), 400

    paper = create_paper(
        d["name"],
        d["code"],
        course_id,
        d.get("lecturer_id") or None,
        semester,
        d.get("total_classes", 0),
    )
    log_action(
        "CREATE_PAPER",
        str(user["_id"]),
        details=f"Paper {d['code']}",
        rollback=_rb_delete("academic", "papers", {"_id": paper.get("_id")}),
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(paper)), 201


@admin_bp.route("/papers/<pid>", methods=["PUT"])
@role_required("admin")
def edit_paper(user, pid):
    d = request.get_json(silent=True) or {}
    fields = dict(d)
    if "lecturer_id" in fields and not fields["lecturer_id"]:
        fields["lecturer_id"] = None

    previous = get_paper_by_id(pid)
    if not previous:
        return jsonify({"error": "Paper not found"}), 404

    lock_error = _ensure_paper_course_active(previous)
    if lock_error:
        return lock_error

    if "course_id" in fields or "semester" in fields:
        next_course_id = fields.get("course_id", previous.get("course_id"))
        next_semester = fields.get("semester", previous.get("semester"))
        course_id, semester, error = _normalise_course_semester(next_course_id, next_semester)
        if error:
            return jsonify({"error": error}), 400
        fields["course_id"] = course_id
        fields["semester"] = semester

    updated = update_paper(pid, fields)
    log_action(
        "UPDATE_PAPER",
        str(user["_id"]),
        details=f"Paper {pid}",
        rollback=_rb_replace("academic", "papers", {"_id": pid}, previous) if previous else None,
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/papers/<pid>", methods=["DELETE"])
@role_required("admin")
def remove_paper(user, pid):
    previous = get_paper_by_id(pid)
    if not previous:
        return jsonify({"error": "Paper not found"}), 404

    lock_error = _ensure_paper_course_active(previous)
    if lock_error:
        return lock_error

    delete_paper(pid)
    log_action(
        "DELETE_PAPER",
        str(user["_id"]),
        details=f"Paper {pid}",
        rollback=_rb_restore("academic", "papers", previous) if previous else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/papers/bulk-assign", methods=["POST"])
@role_required("admin")
def bulk_assign(user):
    """Assign multiple papers to a lecturer or course in one click."""
    d = request.get_json(silent=True) or {}

    # Student enrollment flow: assign one paper to many students.
    paper_id = d.get("paper_id")
    student_ids = d.get("student_ids") or []
    if paper_id and student_ids:
        paper = get_paper_by_id(paper_id)
        if not paper:
            return jsonify({"error": "Paper not found"}), 404

        lock_error = _ensure_paper_course_active(paper)
        if lock_error:
            return lock_error

        updated_count = 0
        for sid in student_ids:
            uid, _ = _resolve_student_identity(sid)
            if not uid:
                continue
            _, student_lock_error = _ensure_student_course_active(uid)
            if student_lock_error:
                continue
            enroll_in_papers(uid, [paper_id])
            updated_count += 1

        log_action(
            "BULK_ENROLL_STUDENTS",
            str(user["_id"]),
            details=f"Paper {paper_id}, students {updated_count}",
        )
        _clear_query_cache()
        return jsonify({"message": "Students enrolled successfully", "updated_count": updated_count}), 200

    paper_ids = d.get("paper_ids", [])
    lecturer_id = d.get("lecturer_id")
    course_id = d.get("course_id")

    if not paper_ids:
        return jsonify({"error": "paper_ids or (paper_id + student_ids) is required"}), 400

    if lecturer_id:
        for pid in paper_ids:
            paper = get_paper_by_id(pid)
            if not paper:
                continue
            lock_error = _ensure_paper_course_active(paper)
            if lock_error:
                return lock_error

        bulk_assign_lecturer(paper_ids, lecturer_id)
        log_action("BULK_ASSIGN_LECTURER", str(user["_id"]),
                   details=f"Papers {paper_ids} → Lecturer {lecturer_id}")
        _clear_query_cache()
    if course_id:
        course = _safe_get_course(course_id)
        if not course:
            return jsonify({"error": "Course not found"}), 404
        if _course_is_inactive(course):
            return jsonify({"error": "Cannot assign subjects to an inactive course"}), 409
        max_sem = max(1, _to_int(course.get("course_duration"), 1) * 2)

        invalid = []
        for paper_id in paper_ids:
            paper = get_paper_by_id(paper_id)
            if not paper:
                continue
            psem = _to_int(paper.get("semester"), 0)
            if psem > max_sem:
                invalid.append({"paper_id": paper_id, "paper_code": paper.get("code", ""), "semester": psem})

        if invalid:
            return jsonify({
                "error": f"One or more papers have semester above course limit (max {max_sem})",
                "invalid_papers": invalid,
            }), 400

        bulk_assign_course(paper_ids, course_id)
        log_action("BULK_ASSIGN_COURSE", str(user["_id"]),
                   details=f"Papers {paper_ids} → Course {course_id}")
        _clear_query_cache()
    return jsonify({"message": "Assigned"}), 200


@admin_bp.route("/lecturers/<lid>/papers", methods=["GET"])
@role_required("admin")
def get_lecturer_papers(user, lid):
    papers = get_all_papers(["name", "code", "course_id", "lecturer_id", "semester", "total_classes", "created_at"])
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))
    lecturers = sanitise_many(get_users_by_role("lecturer"))
    course_map = {c["_id"]: c for c in courses}
    lecturer_map = {l["_id"]: l for l in lecturers}

    all_papers = [_enrich_paper(p, course_map, lecturer_map) for p in papers]
    assigned = [p for p in all_papers if p.get("lecturer_id") == lid]
    return jsonify({"assigned": assigned, "all": all_papers})


@admin_bp.route("/lecturers/<lid>/papers", methods=["PUT"])
@role_required("admin")
def set_lecturer_papers(user, lid):
    d = request.get_json(silent=True) or {}
    paper_ids = set(d.get("paper_ids") or [])
    object_ids = []
    for pid in paper_ids:
        try:
            object_ids.append(ObjectId(pid))
        except Exception:
            continue

    # Unassign papers currently tied to lecturer but not selected now.
    papers = get_collection("academic", "papers")
    papers.update_many(
        {"lecturer_id": lid, "_id": {"$nin": object_ids}},
        {"$set": {"lecturer_id": None}},
    )

    # Assign selected papers to lecturer.
    if object_ids:
        papers.update_many(
            {"_id": {"$in": object_ids}},
            {"$set": {"lecturer_id": lid}},
        )

    log_action(
        "UPDATE_LECTURER_ASSIGNMENTS",
        str(user["_id"]),
        target_user=lid,
        details=f"Assigned papers: {sorted(list(paper_ids))}",
    )
    _clear_query_cache()
    return jsonify({"message": "Lecturer paper assignments updated"}), 200


# ─── Lecturers ──────────────────────────────────────────────────────────────

@admin_bp.route("/lecturers", methods=["GET"])
@role_required("admin")
def list_lecturers(user):
    lecturers = sanitise_many(get_users_by_role("lecturer"))
    papers = sanitise_many(get_all_papers(["name", "code", "lecturer_id", "course_id", "semester", "total_classes", "created_at"]))
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))
    course_map = {c["_id"]: c for c in courses}

    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    semester = _as_text(request.args.get("semester", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))
    academic_year = _normalise_year(request.args.get("academic_year", ""))

    result = []
    for lec in lecturers:
        assigned = [p for p in papers if p.get("lecturer_id") == lec["_id"]]
        assigned_paper_ids = [p["_id"] for p in assigned]
        assigned_course_ids = list({p.get("course_id") for p in assigned if p.get("course_id")})
        assigned_papers = [f"{p.get('name', '')} ({p.get('code', '')})" for p in assigned]
        assigned_semesters = list({str(_to_int(p.get("semester"), 0)) for p in assigned if _to_int(p.get("semester"), 0) > 0})

        years = []
        for p in assigned:
            p_year = _normalise_year(p.get("academic_year", ""))
            if not p_year:
                p_year = _normalise_year((course_map.get(p.get("course_id")) or {}).get("year", ""))
            if p_year:
                years.append(p_year)

        if course_id and course_id not in assigned_course_ids:
            continue
        if semester and semester not in assigned_semesters:
            continue
        if paper_id and paper_id not in assigned_paper_ids:
            continue
        if academic_year and academic_year not in years:
            continue
        if q and not (
            q in _as_text(lec.get("name")).lower()
            or q in _as_text(lec.get("email")).lower()
            or any(q in _as_text(paper).lower() for paper in assigned_papers)
        ):
            continue

        lec["paper_count"] = len(assigned)
        lec["assigned_paper_ids"] = assigned_paper_ids
        lec["assigned_course_ids"] = assigned_course_ids
        lec["assigned_papers"] = assigned_papers
        lec["assigned_semesters"] = sorted(assigned_semesters, key=lambda v: int(v))
        lec["academic_years"] = sorted(list(set(years)))
        result.append(lec)

    return _paginate_items(sanitise_many(result))


@admin_bp.route("/lecturers", methods=["POST"])
@role_required("admin")
def add_lecturer(user):
    d = request.get_json(silent=True) or {}
    temp_pw = generate_temp_password()
    lec = create_user(d["name"], d["email"], temp_pw,
                      "lecturer", d.get("department", ""),
                      must_change_password=True)
    log_action(
        "CREATE_LECTURER",
        str(user["_id"]),
        target_user=lec["_id"],
        rollback=_rb_delete("auth", "users", {"_id": lec.get("_id")}),
    )
    _clear_query_cache()
    lec_clean = sanitise_mongo_doc(lec)
    return jsonify({**lec_clean, "temp_password": temp_pw}), 201


@admin_bp.route("/lecturers/<lid>", methods=["PUT"])
@role_required("admin")
def edit_lecturer(user, lid):
    d = request.get_json(silent=True) or {}
    previous = find_user_by_id(lid)
    updated = update_user(lid, d)
    log_action(
        "UPDATE_LECTURER",
        str(user["_id"]),
        target_user=lid,
        rollback=_rb_replace("auth", "users", {"_id": lid}, previous) if previous else None,
    )
    _clear_query_cache()
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/lecturers/<lid>", methods=["DELETE"])
@role_required("admin")
def remove_lecturer(user, lid):
    previous = find_user_by_id(lid)
    delete_user(lid)
    log_action(
        "DELETE_LECTURER",
        str(user["_id"]),
        target_user=lid,
        rollback=_rb_restore("auth", "users", previous) if previous else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/lecturers/<lid>/reset-password", methods=["POST"])
@role_required("admin")
def reset_lecturer_password(user, lid):
    temp_pw = reset_user_password(lid)
    log_action("RESET_PASSWORD", str(user["_id"]), target_user=lid,
               details="Lecturer password reset")
    return jsonify({"temp_password": temp_pw})


@admin_bp.route("/lecturers/<lid>/reset-pin", methods=["POST"])
@role_required("admin")
def reset_lecturer_pin(user, lid):
    new_pin = f"{random.randint(0, 9999):04d}"
    update_user(lid, {"pin": new_pin, "pin_last_set": datetime.utcnow()})
    log_action("RESET_LECTURER_PIN", str(user["_id"]), target_user=lid,
               details="Admin reset lecturer PIN")
    return jsonify({"pin": new_pin, "message": "Lecturer PIN reset"})


@admin_bp.route("/lecturers/<lid>/pin", methods=["PUT"])
@role_required("admin")
def update_lecturer_pin(user, lid):
    return jsonify({"error": "Admins cannot set lecturer PIN. Lecturer must manage PIN from dashboard."}), 403


# ─── Students ───────────────────────────────────────────────────────────────

@admin_bp.route("/students", methods=["GET"])
@role_required("admin")
def list_students(user):
    profiles = get_all_profiles([
        "user_id",
        "course_id",
        "enrolled_papers",
        "reg_number",
        "roll_number",
        "academic_session",
        "academic_year",
        "year",
        "enrollment_year",
        "current_semester",
        "face_embeddings",
        "created_at",
    ])
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))
    papers = sanitise_many(get_all_papers(["name", "code", "semester", "course_id", "lecturer_id"]))
    course_map = {c["_id"]: c for c in courses}
    paper_map = {p["_id"]: p for p in papers}
    user_map = get_users_by_ids(p.get("user_id") for p in profiles)

    q = _as_text(request.args.get("q", "")).lower()
    course_id = _as_text(request.args.get("course_id", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))
    academic_session = _as_text(request.args.get("academic_session", "")) or _normalise_year(request.args.get("academic_year", ""))
    semester = _as_text(request.args.get("semester", ""))
    include_inactive = _to_bool(request.args.get("include_inactive", False))

    result = []
    for p in profiles:
        u = user_map.get(_as_text(p.get("user_id", "")))
        course = course_map.get(_as_text(p.get("course_id", "")))
        enrolled_papers = p.get("enrolled_papers", [])

        item = sanitise_mongo_doc(p)
        if u:
            item["name"] = u["name"]
            item["email"] = u["email"]

        item["reg_number"] = item.get("reg_number") or item.get("roll_number")
        enrollment_year = item.get("enrollment_year") or (item.get("created_at") or datetime.utcnow()).year
        duration_years = _to_int((course or {}).get("course_duration"), 1)
        item["academic_session"] = (
            _as_text(item.get("academic_session"))
            or _as_text(item.get("academic_year"))
            or _derive_academic_session(enrollment_year, duration_years)
        )
        item["academic_year"] = item.get("academic_session")
        item["year"] = item.get("academic_session")
        item["enrollment_year"] = enrollment_year
        item["mobile_no"] = (u or {}).get("mobile_no", "")
        item["course_name"] = (course or {}).get("name")
        item["course_code"] = (course or {}).get("code")
        item["course_status"] = _as_text((course or {}).get("status") or "active").lower() or "active"
        item["is_course_inactive"] = item["course_status"] != "active"
        if item["is_course_inactive"] and not include_inactive:
            continue
        item["course_department"] = (course or {}).get("department")
        item["course_duration"] = (course or {}).get("course_duration")
        item["current_semester"] = _to_int(item.get("current_semester"), 0) or None
        item["has_face"] = bool(item.get("face_embeddings"))
        item["enrolled_papers"] = [
            {
                "paper_id": pid,
                "paper_name": (paper_map.get(pid) or {}).get("name", "Unknown"),
                "paper_code": (paper_map.get(pid) or {}).get("code", ""),
            }
            for pid in enrolled_papers
        ]

        student_semesters = set()
        if item.get("current_semester"):
            student_semesters.add(str(item.get("current_semester")))
        for pid in enrolled_papers:
            pdoc = paper_map.get(pid) or {}
            psem = _to_int(pdoc.get("semester"), 0)
            if psem > 0:
                student_semesters.add(str(psem))

        if course_id and item.get("course_id") != course_id:
            continue
        if paper_id and paper_id not in enrolled_papers:
            continue
        if semester and semester not in student_semesters:
            continue
        if academic_session and _as_text(item.get("academic_session")) != academic_session:
            continue
        if q and not (
            q in _as_text(item.get("name")).lower()
            or q in _as_text(item.get("email")).lower()
            or q in _as_text(item.get("reg_number")).lower()
        ):
            continue

        # Don't send raw embeddings to the frontend
        item.pop("face_embeddings", None)
        result.append(item)

    return _paginate_items(sanitise_many(result))


@admin_bp.route("/students/options", methods=["GET"])
@role_required("admin")
def student_options(user):
    """Return a lightweight student list for select inputs and lookups."""
    course_id = _as_text(request.args.get("course_id", ""))
    academic_session = _as_text(request.args.get("academic_session", "")) or _normalise_year(request.args.get("academic_year", ""))
    semester = _as_text(request.args.get("semester", ""))
    q = _as_text(request.args.get("q", "")).lower()
    limit = max(1, min(_to_int(request.args.get("limit", 200), 200), 500))
    include_inactive = _to_bool(request.args.get("include_inactive", False))

    profiles_col = get_collection("academic", "student_profiles")
    query = {}
    if course_id:
        query["course_id"] = course_id
    if academic_session:
        query["$or"] = [
            {"academic_session": academic_session},
            {"academic_year": academic_session},
            {"year": academic_session},
        ]
    semester_int = _to_int(semester, 0)
    if semester_int > 0:
        query["current_semester"] = semester_int

    cursor = profiles_col.find(
        query,
        {
            "user_id": 1,
            "course_id": 1,
            "academic_session": 1,
            "academic_year": 1,
            "year": 1,
            "current_semester": 1,
            "reg_number": 1,
            "roll_number": 1,
            "created_at": 1,
        },
    )
    # When searching by q (name/email/reg no), apply limit only after matching,
    # otherwise valid students outside the first N profiles are never considered.
    profiles = list(cursor if q else cursor.limit(limit))

    course_map = {}
    if profiles:
        course_ids = {str(p.get("course_id", "")) for p in profiles if p.get("course_id")}
        if course_ids:
            course_map = {c["_id"]: c for c in sanitise_many(get_all_courses(["name", "code", "status", "course_duration"])) if c.get("_id") in course_ids}

    user_map = get_users_by_ids(profile.get("user_id") for profile in profiles)
    result = []

    for profile in profiles:
        uid = _as_text(profile.get("user_id", ""))
        student = user_map.get(uid)
        if not student:
            continue

        course = course_map.get(_as_text(profile.get("course_id", "")))
        is_course_inactive = _as_text((course or {}).get("status") or "active").lower() != "active"
        if is_course_inactive and not include_inactive:
            continue
        enrollment_year = _to_int((profile.get("created_at") or datetime.utcnow()).year if hasattr(profile.get("created_at"), "year") else None, 0)
        duration_years = _to_int((course or {}).get("course_duration"), 1)
        resolved_session = (
            _as_text(profile.get("academic_session"))
            or _as_text(profile.get("academic_year"))
            or _as_text(profile.get("year"))
            or _derive_academic_session(enrollment_year or datetime.utcnow().year, duration_years)
        )
        current_semester = _to_int(profile.get("current_semester"), 0)

        reg_number = _as_text(profile.get("reg_number") or profile.get("roll_number"))
        name = _as_text(student.get("name"))
        email = _as_text(student.get("email"))
        if q and not (q in name.lower() or q in email.lower() or q in reg_number.lower()):
            continue

        result.append({
            "_id": uid,
            "user_id": uid,
            "name": student.get("name"),
            "email": student.get("email"),
            "reg_number": reg_number,
            "roll_number": _as_text(profile.get("roll_number")),
            "academic_session": resolved_session,
            "course_id": _as_text(profile.get("course_id", "")),
            "current_semester": current_semester or None,
            "course_name": (course or {}).get("name"),
            "is_course_inactive": is_course_inactive,
        })

        if q and len(result) >= limit:
            break

    return jsonify(sanitise_many(result))


@admin_bp.route("/students", methods=["POST"])
@role_required("admin")
def add_student(user):
    d = request.get_json(silent=True) or {}
    required_fields = ["name", "email", "course_id"]
    missing = [field for field in required_fields if not _as_text(d.get(field))]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Check if email already exists
    existing_user = find_user_by_email(d["email"])
    if existing_user:
        return jsonify({"error": "Email already in use. Please use a different email."}), 409

    course_id = _as_text(d.get("course_id", ""))
    course = _safe_get_course(course_id) if course_id else None
    if not course:
        return jsonify({"error": "Course not found or invalid."}), 404
    if _course_is_inactive(course):
        return jsonify({"error": "Cannot create student under inactive course"}), 409
    
    enrollment_year = _to_int(d.get("enrollment_year"), datetime.utcnow().year)
    course_duration = _to_int((course or {}).get("course_duration"), 1)
    academic_session = _derive_academic_session(enrollment_year, course_duration)

    try:
        temp_pw = generate_temp_password()
        stu = create_user(
            d["name"],
            d["email"],
            temp_pw,
            "student",
            d.get("department", (course or {}).get("department", "")),
            must_change_password=True,
        )
    except Exception as exc:
        current_app.logger.exception("User creation failed")
        return jsonify({"error": f"Failed to create user: {str(exc)}"}), 500

    mobile_no = _as_text(d.get("mobile_no", ""))
    if mobile_no:
        try:
            update_user(str(stu["_id"]), {"mobile_no": mobile_no})
        except Exception as exc:
            current_app.logger.exception("Failed to update mobile number")
            delete_user(str(stu["_id"]))
            return jsonify({"error": f"Failed to update user: {str(exc)}"}), 500

    profile = None
    for attempt in range(5):
        reg_number = d.get("reg_number") or _generate_registration_number(course, academic_session)
        try:
            profile = create_student_profile(str(stu["_id"]), reg_number, course_id, academic_session)
            break
        except DuplicateKeyError:
            if attempt == 4:  # Last attempt
                break
            continue
        except Exception as exc:
            current_app.logger.exception(f"Profile creation attempt {attempt + 1} failed")
            continue

    if not profile:
        delete_user(str(stu["_id"]))
        return jsonify({"error": "Could not generate a unique registration number. Please try again."}), 409

    try:
        update_profile(
            str(stu["_id"]),
            {
                "enrollment_year": enrollment_year,
                "current_semester": 1,
                "academic_session": academic_session,
                "academic_year": academic_session,
                "year": academic_session,
            },
        )
    except Exception as exc:
        current_app.logger.exception("Failed to update student profile")
        delete_user(str(stu["_id"]))
        delete_profile(str(stu["_id"]))
        return jsonify({"error": f"Failed to update profile: {str(exc)}"}), 500

    profile = get_profile_by_user(str(stu["_id"]))

    if d.get("enrolled_papers"):
        enroll_in_papers(str(stu["_id"]), d["enrolled_papers"])

    log_action(
        "CREATE_STUDENT",
        str(user["_id"]),
        target_user=stu["_id"],
        rollback=_rb_batch([
            _rb_delete("academic", "student_profiles", {"user_id": str(stu["_id"])}),
            _rb_delete("auth", "users", {"_id": str(stu["_id"])}),
        ]),
    )
    _clear_query_cache()
    
    # Sanitize before returning to ensure ObjectId is serializable
    stu_clean = sanitise_mongo_doc(stu)
    profile_clean = sanitise_mongo_doc(profile) if profile else None
    
    return jsonify({**stu_clean, "profile": profile_clean, "temp_password": temp_pw}), 201


@admin_bp.route("/students/<sid>", methods=["PUT"])
@role_required("admin")
def edit_student(user, sid):
    d = request.get_json(silent=True) or {}
    user_id, profile = _resolve_student_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    _, student_lock_error = _ensure_student_course_active(user_id)
    if student_lock_error:
        return student_lock_error

    prev_user = find_user_by_id(user_id)
    prev_profile = get_profile_by_user(user_id)

    user_fields = {}
    profile_fields = {}
    for k in ["name", "email", "department", "mobile_no"]:
        if k in d:
            user_fields[k] = d[k]
    for k in ["roll_number", "reg_number", "course_id", "enrolled_papers", "academic_year", "year", "academic_session", "enrollment_year", "current_semester"]:
        if k in d:
            profile_fields[k] = d[k]
    if "year" in profile_fields and "academic_year" not in profile_fields:
        profile_fields["academic_year"] = profile_fields["year"]
    if "academic_session" in profile_fields and "academic_year" not in profile_fields:
        profile_fields["academic_year"] = _as_text(profile_fields["academic_session"])

    if "academic_year" in profile_fields:
        profile_fields["academic_year"] = _as_text(profile_fields["academic_year"])
        profile_fields["year"] = profile_fields["academic_year"]
        profile_fields["academic_session"] = profile_fields["academic_year"]

    current_course_id = (profile or {}).get("course_id")
    next_course_id = profile_fields.get("course_id", current_course_id)
    current_enrollment_year = _to_int((profile or {}).get("enrollment_year"), (profile or {}).get("created_at", datetime.utcnow()).year)
    next_enrollment_year = _to_int(profile_fields.get("enrollment_year"), current_enrollment_year)
    next_course = _safe_get_course(next_course_id) if next_course_id else None
    if next_course_id and _course_is_inactive(next_course):
        return jsonify({"error": "Cannot move student to an inactive course"}), 409
    next_course_duration = _to_int((next_course or {}).get("course_duration"), 1)
    next_session = profile_fields.get("academic_session") or _derive_academic_session(next_enrollment_year, next_course_duration)
    profile_fields["enrollment_year"] = next_enrollment_year
    if "current_semester" in profile_fields:
        profile_fields["current_semester"] = _to_int(profile_fields.get("current_semester"), 0) or None
    profile_fields["academic_session"] = next_session
    profile_fields["academic_year"] = next_session
    profile_fields["year"] = next_session

    if "course_id" in profile_fields or "enrollment_year" in profile_fields or "academic_session" in profile_fields:
        new_reg = _generate_registration_number(next_course, next_session, exclude_user_id=user_id)
        profile_fields["reg_number"] = new_reg
        profile_fields["roll_number"] = new_reg

    if "reg_number" in profile_fields and "roll_number" not in profile_fields:
        profile_fields["roll_number"] = profile_fields["reg_number"]

    if user_fields:
        update_user(user_id, user_fields)
    if profile_fields:
        update_profile(user_id, profile_fields)
    rollback_ops = []
    if prev_user:
        rollback_ops.append(_rb_replace("auth", "users", {"_id": user_id}, prev_user))
    if prev_profile:
        rollback_ops.append(_rb_replace("academic", "student_profiles", {"user_id": user_id}, prev_profile))

    log_action(
        "UPDATE_STUDENT",
        str(user["_id"]),
        target_user=user_id,
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Updated"})


@admin_bp.route("/students/<sid>", methods=["DELETE"])
@role_required("admin")
def remove_student(user, sid):
    user_id, _ = _resolve_student_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    _, student_lock_error = _ensure_student_course_active(user_id)
    if student_lock_error:
        return student_lock_error

    prev_user = find_user_by_id(user_id)
    prev_profile = get_profile_by_user(user_id)

    delete_user(user_id)
    delete_profile(user_id)
    rollback_ops = []
    if prev_user:
        rollback_ops.append(_rb_restore("auth", "users", prev_user))
    if prev_profile:
        rollback_ops.append(_rb_restore("academic", "student_profiles", prev_profile))

    log_action(
        "DELETE_STUDENT",
        str(user["_id"]),
        target_user=user_id,
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    _clear_query_cache()
    return jsonify({"message": "Deleted"}), 200


@admin_bp.route("/students/bulk-promote", methods=["POST"])
@admin_bp.route("/student-bulk-promote", methods=["POST"])
@role_required("admin")
def bulk_promote_students(user):
    """Promote selected students to the next semester."""
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("student_ids") or []
    from_semester = _to_int(d.get("from_semester"), 0)

    student_ids = [sid for sid in raw_ids if _as_text(sid)]
    if not student_ids:
        return jsonify({"error": "student_ids is required"}), 400

    paper_map = {p.get("_id"): p for p in sanitise_many(get_all_papers(["name", "code", "semester", "course_id", "lecturer_id"]))}
    course_map = {c.get("_id"): c for c in sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))}

    promoted = 0
    skipped = 0
    skipped_max_semester = 0
    removed_papers = 0
    rollback_ops = []
    for sid in student_ids:
        user_id, profile = _resolve_student_identity(_as_text(sid))
        if not user_id or not profile:
            skipped += 1
            continue

        course_for_lock = _safe_get_course((profile or {}).get("course_id"))
        if _course_is_inactive(course_for_lock):
            skipped += 1
            continue

        current_sem = _to_int((profile or {}).get("current_semester"), 0)
        if current_sem <= 0:
            current_sem = from_semester if from_semester > 0 else 1

        course_id = _as_text((profile or {}).get("course_id"))
        course = course_map.get(course_id) or {}
        max_semester = max(1, _to_int(course.get("course_duration"), 1) * 2)

        if current_sem >= max_semester:
            skipped_max_semester += 1
            continue

        next_sem = current_sem + 1
        enrolled_papers = list((profile or {}).get("enrolled_papers") or [])
        kept_papers = []
        for pid in enrolled_papers:
            pdoc = paper_map.get(pid) or {}
            psem = _to_int(pdoc.get("semester"), 0)
            # Keep unknown-semester papers and papers in/after the promoted semester.
            if psem == 0 or psem >= next_sem:
                kept_papers.append(pid)

        removed_papers += max(0, len(enrolled_papers) - len(kept_papers))
        rollback_ops.append(_rb_replace("academic", "student_profiles", {"user_id": user_id}, profile))
        update_profile(user_id, {"current_semester": next_sem, "enrolled_papers": kept_papers})
        promoted += 1

    log_action(
        "BULK_PROMOTE_STUDENTS",
        str(user["_id"]),
        details=f"Promoted {promoted}, skipped {skipped}, skipped_max={skipped_max_semester}, removed_papers={removed_papers}, from_semester={from_semester or 'auto'}",
        rollback=_rb_batch(rollback_ops) if rollback_ops else None,
    )
    _clear_query_cache()

    return jsonify(
        {
            "message": f"Promoted {promoted} students, removed {removed_papers} old-semester paper assignments, skipped {skipped_max_semester} already at max semester",
            "promoted_count": promoted,
            "skipped_count": skipped,
            "skipped_max_semester_count": skipped_max_semester,
            "removed_papers_count": removed_papers,
        }
    )


@admin_bp.route("/students/<sid>/reset-password", methods=["POST"])
@role_required("admin")
def reset_student_password(user, sid):
    user_id, _ = _resolve_student_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    temp_pw = reset_user_password(user_id)
    log_action("RESET_PASSWORD", str(user["_id"]), target_user=user_id,
               details="Student password reset")
    return jsonify({"temp_password": temp_pw})


# ─── Student Enrollment (Photo → Embedding) ────────────────────────────────

@admin_bp.route("/students/enroll", methods=["POST"])
@role_required("admin")
def enroll_student_face(user):
    """Accept a student photo, extract FaceNet embedding, and store it."""
    d = request.get_json(silent=True) or {}
    user_id = d.get("user_id")
    photo_b64 = d.get("photo")  # base64 encoded image
    dataset_photos = d.get("dataset_photos") or []

    if not user_id or not photo_b64:
        return jsonify({"error": "user_id and photo are required"}), 400

    resolved_user_id, _ = _resolve_student_identity(user_id)
    if not resolved_user_id:
        return jsonify({"error": "Student not found"}), 404

    img = decode_base64_image(photo_b64)
    try:
        detector = get_detector()
        faces = detector.detect_faces(img)
    except Exception as exc:
        current_app.logger.exception("Face detector failed")
        return jsonify({"error": f"Face detector unavailable: {exc}"}), 500

    if not faces:
        return jsonify({"error": "No face detected in the photo"}), 400

    # Use the first (largest confidence) face
    face_crop = faces[0]["crop"]
    try:
        embedding = normalize_embedding(generate_embedding(face_crop))
    except Exception as exc:
        current_app.logger.exception("Embedding generation failed")
        return jsonify({"error": f"Embedding generation failed: {exc}"}), 500
    add_face_embedding(resolved_user_id, embedding)

    dataset_saved_count = 0
    dataset_warning = None
    if isinstance(dataset_photos, list) and dataset_photos:
        try:
            dataset_user_key = _as_text(resolved_user_id)

            dataset_crops = []
            last_valid_crop = face_crop
            for frame_b64 in dataset_photos[:50]:
                if not isinstance(frame_b64, str) or not frame_b64:
                    if last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                    continue
                try:
                    frame_img = decode_base64_image(frame_b64)
                    frame_faces = detector.detect_faces(frame_img)
                    if frame_faces:
                        last_valid_crop = frame_faces[0]["crop"]
                        dataset_crops.append(last_valid_crop)
                    elif last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                except Exception:
                    if last_valid_crop is not None:
                        dataset_crops.append(last_valid_crop)
                    continue

            if not dataset_crops and last_valid_crop is not None:
                dataset_crops.append(last_valid_crop)

            while len(dataset_crops) < 50 and last_valid_crop is not None:
                dataset_crops.append(last_valid_crop)

            if dataset_crops:
                saved_paths = save_cropped_face_dataset(
                    dataset_user_key,
                    dataset_crops,
                    dataset_root="dataset",
                    max_images=50,
                )
                dataset_saved_count = len(saved_paths)
        except Exception as exc:
            current_app.logger.exception("Dataset save failed during face enrollment")
            dataset_warning = f"Dataset save failed: {exc}"

    log_action("ENROLL_FACE", str(user["_id"]), target_user=resolved_user_id,
               details="Face embedding added")
    _clear_query_cache()

    response = {
        "message": "Face enrolled successfully",
        "faces_detected": len(faces),
        "dataset_saved_count": dataset_saved_count,
    }
    if dataset_warning:
        response["dataset_warning"] = dataset_warning

    return jsonify(response), 200


@admin_bp.route("/students/upload-photo", methods=["POST"])
@role_required("admin")
def upload_student_photo(user):
    """Upload and store a single student photo in uploads folder."""
    student_name = _as_text(request.form.get("student_name", ""))
    if not student_name:
        return jsonify({"error": "student_name is required"}), 400

    if "image" not in request.files:
        return jsonify({"error": "image file is required"}), 400

    file = request.files["image"]
    if not file or file.filename == "":
        return jsonify({"error": "No image file selected"}), 400

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Uploaded image is empty"}), 400

    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if image is None:
        return jsonify({"error": "Invalid image file"}), 400

    uploads_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
    saved_path = save_student_upload(student_name, image, uploads_dir=uploads_dir)

    log_action(
        "UPLOAD_STUDENT_PHOTO",
        str(user["_id"]),
        details=f"Stored photo for {student_name} as {saved_path}",
    )

    return jsonify({
        "message": "Student photo uploaded successfully",
        "file_path": saved_path,
        "file_name": os.path.basename(saved_path),
    }), 201


def _train_single_face_job(actor_id, user_id):
    train_result = _train_embeddings_from_dataset_for_user(user_id)
    log_action(
        "TRAIN_FACE_FROM_DATASET",
        actor_id,
        target_user=user_id,
        details=(
            f"dataset={train_result['dataset_dir']}, "
            f"trained={train_result['trained_embeddings']}, "
            f"skipped={train_result['skipped_images']}"
        ),
    )
    return {
        "message": "Face training completed",
        "trained_embeddings": train_result["trained_embeddings"],
        "skipped_images": train_result["skipped_images"],
        "dataset_dir": train_result["dataset_dir"],
    }


def _train_bulk_faces_job(actor_id, student_ids):
    items = []
    total_trained_embeddings = 0
    success_count = 0

    for sid in student_ids:
        user_id, _ = _resolve_student_identity(sid)
        if not user_id:
            items.append({"student_id": sid, "success": False, "error": "Student not found"})
            continue

        try:
            result = _train_embeddings_from_dataset_for_user(user_id)
            total_trained_embeddings += int(result["trained_embeddings"])
            success_count += 1
            items.append(
                {
                    "student_id": _as_text(user_id),
                    "success": True,
                    "trained_embeddings": result["trained_embeddings"],
                    "skipped_images": result["skipped_images"],
                    "dataset_dir": result["dataset_dir"],
                }
            )
        except ValueError as exc:
            items.append({"student_id": _as_text(user_id), "success": False, "error": str(exc)})

    failure_count = len(student_ids) - success_count
    log_action(
        "BULK_TRAIN_FACE_FROM_DATASET",
        actor_id,
        details=(
            f"requested={len(student_ids)}, success={success_count}, "
            f"failed={failure_count}, trained_embeddings={total_trained_embeddings}"
        ),
    )
    return {
        "message": "Bulk training completed",
        "requested_count": len(student_ids),
        "success_count": success_count,
        "failure_count": failure_count,
        "total_trained_embeddings": total_trained_embeddings,
        "items": items,
    }


def _rebuild_all_faces_job(actor_id):
    profiles = get_all_profiles(["user_id"])
    if not profiles:
        return {"error": "No student profiles found"}

    items = []
    success_count = 0
    failure_count = 0
    total_trained_embeddings = 0

    for profile in profiles:
        user_id = _as_text(profile.get("user_id"))
        if not user_id:
            failure_count += 1
            items.append({"student_id": None, "success": False, "error": "Missing user_id"})
            continue

        try:
            result = _train_embeddings_from_dataset_for_user(user_id)
            success_count += 1
            total_trained_embeddings += int(result["trained_embeddings"])
            items.append(
                {
                    "student_id": user_id,
                    "success": True,
                    "trained_embeddings": result["trained_embeddings"],
                    "skipped_images": result["skipped_images"],
                    "dataset_dir": result["dataset_dir"],
                }
            )
        except Exception as exc:
            failure_count += 1
            items.append({"student_id": user_id, "success": False, "error": str(exc)})

    log_action(
        "REBUILD_ALL_FACE_EMBEDDINGS",
        actor_id,
        details=(
            f"requested={len(profiles)}, success={success_count}, failure={failure_count}, "
            f"trained_embeddings={total_trained_embeddings}"
        ),
    )

    return {
        "message": "Face embeddings rebuilt",
        "requested_count": len(profiles),
        "success_count": success_count,
        "failure_count": failure_count,
        "total_trained_embeddings": total_trained_embeddings,
        "items": items,
    }


@admin_bp.route("/students/<sid>/train-face", methods=["POST"])
@admin_bp.route("/students/<sid>/train", methods=["POST"])
@admin_bp.route("/student/<sid>/train-face", methods=["POST"])
@role_required("admin")
def train_face_from_dataset(user, sid):
    """Train student face embeddings from dataset/<user_id> images and save to DB."""
    user_id, _ = _resolve_student_identity(sid)
    if not user_id:
        return jsonify({"error": "Student not found"}), 404

    try:
        train_result = _train_single_face_job(str(user["_id"]), user_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({
        "message": "Face training completed",
        "trained_embeddings": train_result["trained_embeddings"],
        "skipped_images": train_result["skipped_images"],
        "dataset_dir": train_result["dataset_dir"],
    }), 200


@admin_bp.route("/students/train-face/bulk", methods=["POST"])
@admin_bp.route("/students/bulk-train-face", methods=["POST"])
@role_required("admin")
def bulk_train_face_from_dataset(user):
    """Train face embeddings in bulk for selected students from their dataset folders."""
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("student_ids") or []
    student_ids = [_as_text(sid) for sid in raw_ids if _as_text(sid)]
    if not student_ids:
        return jsonify({"error": "student_ids is required"}), 400

    async_requested = _to_bool(d.get("async", False))
    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "bulk_train_face",
            {
                "requested_count": len(student_ids),
                "actor_id": str(user["_id"]),
                "student_ids": student_ids,
            },
        )
        return jsonify({
            "message": "Bulk training queued",
            "job_id": job_id,
            "status_url": f"/api/admin/jobs/{job_id}",
        }), 202

    result = _train_bulk_faces_job(str(user["_id"]), student_ids)
    _clear_query_cache()
    return jsonify(result), 200


@admin_bp.route("/students/train-face/rebuild-all", methods=["POST"])
@role_required("admin")
def rebuild_all_face_embeddings(user):
    """Rebuild face embeddings for every student profile from their dataset folders."""
    d = request.get_json(silent=True) or {}
    async_requested = _to_bool(d.get("async", False))

    if async_requested:
        job_id = _launch_background_job(
            current_app._get_current_object(),
            "rebuild_all_face_embeddings",
            {"actor_id": str(user["_id"])},
        )
        return jsonify({
            "message": "Face embeddings rebuild queued",
            "job_id": job_id,
            "status_url": f"/api/admin/jobs/{job_id}",
        }), 202

    result = _rebuild_all_faces_job(str(user["_id"]))
    if result.get("error"):
        return jsonify({"error": result["error"]}), 404
    _clear_query_cache()
    return jsonify(result), 200


@admin_bp.route("/jobs/<job_id>", methods=["GET"])
@role_required("admin")
def get_job_status(user, job_id):
    job = _get_background_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(sanitise_mongo_doc(job))


@admin_bp.route("/jobs/<job_id>/replay", methods=["POST"])
@role_required("admin")
def replay_dead_letter_job(user, job_id):
    jobs = get_collection("attendance", "background_jobs")
    job = jobs.find_one({"job_id": job_id})
    if not job:
        return jsonify({"error": "Job not found"}), 404

    status = _as_text(job.get("status")).lower()
    if status != "dead_letter":
        return jsonify({"error": "Only dead-letter jobs can be replayed"}), 400

    if not _requeue_dead_letter_job_by_id(job_id):
        return jsonify({"error": "Job replay failed due to concurrent update"}), 409

    log_action(
        "REPLAY_DEAD_LETTER_JOB",
        str(user["_id"]),
        details=f"job_id={job_id}, job_type={_as_text(job.get('job_type'))}",
    )

    return jsonify(
        {
            "message": "Job replay queued",
            "job_id": job_id,
            "status_url": f"/api/admin/jobs/{job_id}",
        }
    ), 202


def _requeue_dead_letter_job_by_id(job_id):
    jobs = get_collection("attendance", "background_jobs")
    now = _utcnow()
    updated = jobs.update_one(
        {"job_id": job_id, "status": "dead_letter"},
        {
            "$set": {
                "status": "queued",
                "attempts": 0,
                "error": None,
                "next_attempt_at": now,
                "updated_at": now,
                "started_at": None,
                "finished_at": None,
            }
        },
    )
    if not updated.modified_count:
        return False

    try:
        enqueued = _enqueue_background_job(job_id)
    except Exception:
        current_app.logger.exception("Replay enqueue failed for job %s", job_id)
        enqueued = False

    if not enqueued:
        _schedule_local_retry(job_id, 1)

    return True


def _fetch_dead_letter_rows(filters=None, include_pagination=True):
    filters = filters or {}
    q = _as_text(filters.get("q", "")).lower()
    job_type = _as_text(filters.get("job_type", "")).lower()
    from_raw = _as_text(filters.get("from", ""))
    to_raw = _as_text(filters.get("to", ""))
    sort_by = _as_text(filters.get("sort_by", "updated_at")).lower()
    sort_dir = _as_text(filters.get("sort_dir", "desc")).lower()

    allowed_sort_by = {"updated_at", "created_at", "attempts", "job_type"}
    if sort_by not in allowed_sort_by:
        raise ValueError("Invalid sort_by value")
    if sort_dir not in {"asc", "desc"}:
        raise ValueError("Invalid sort_dir value")

    query = {"status": "dead_letter"}
    if job_type:
        query["job_type"] = job_type

    ts_filter = {}
    if from_raw:
        try:
            ts_filter["$gte"] = datetime.fromisoformat(from_raw)
        except ValueError as exc:
            raise ValueError("Invalid from date format") from exc
    if to_raw:
        try:
            ts_filter["$lte"] = datetime.fromisoformat(to_raw)
        except ValueError as exc:
            raise ValueError("Invalid to date format") from exc
    if ts_filter:
        query["updated_at"] = ts_filter

    sort_order = -1 if sort_dir == "desc" else 1
    jobs = get_collection("attendance", "background_jobs")
    rows = list(
        jobs.find(
            query,
            {
                "_id": 0,
                "job_id": 1,
                "job_type": 1,
                "error": 1,
                "payload": 1,
                "attempts": 1,
                "max_attempts": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        ).sort(sort_by, sort_order)
    )

    if q:
        filtered = []
        for row in rows:
            if (
                q in _as_text(row.get("job_id")).lower()
                or q in _as_text(row.get("job_type")).lower()
                or q in _as_text(row.get("error")).lower()
            ):
                filtered.append(row)
        rows = filtered

    if not include_pagination:
        return rows, len(rows)

    page = max(1, _to_int(filters.get("page", 1), 1))
    per_page = max(1, min(_to_int(filters.get("per_page", 20), 20), 100))
    total = len(rows)
    start = (page - 1) * per_page
    end = start + per_page
    return rows[start:end], total


@admin_bp.route("/jobs/dead-letter", methods=["GET"])
@role_required("admin")
def list_dead_letter_jobs(user):
    filters = {
        "q": request.args.get("q", ""),
        "job_type": request.args.get("job_type", ""),
        "from": request.args.get("from", ""),
        "to": request.args.get("to", ""),
        "sort_by": request.args.get("sort_by", "updated_at"),
        "sort_dir": request.args.get("sort_dir", "desc"),
        "page": request.args.get("page", 1),
        "per_page": request.args.get("per_page", 20),
    }
    try:
        rows, total = _fetch_dead_letter_rows(filters, include_pagination=True)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    page = max(1, _to_int(filters.get("page", 1), 1))
    per_page = max(1, min(_to_int(filters.get("per_page", 20), 20), 100))
    return jsonify(
        {
            "items": sanitise_many(rows),
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    )


@admin_bp.route("/jobs/dead-letter/replay-bulk", methods=["POST"])
@role_required("admin")
def replay_dead_letter_jobs_bulk(user):
    d = request.get_json(silent=True) or {}
    raw_ids = d.get("job_ids") or []
    job_ids = [_as_text(x) for x in raw_ids if _as_text(x)]
    if not job_ids:
        return jsonify({"error": "job_ids is required"}), 400

    replayed = 0
    skipped = 0
    for job_id in job_ids:
        if _requeue_dead_letter_job_by_id(job_id):
            replayed += 1
        else:
            skipped += 1

    log_action(
        "REPLAY_DEAD_LETTER_JOB_BULK",
        str(user["_id"]),
        details=f"requested={len(job_ids)}, replayed={replayed}, skipped={skipped}",
    )

    return jsonify(
        {
            "message": "Bulk dead-letter replay processed",
            "requested": len(job_ids),
            "replayed": replayed,
            "skipped": skipped,
        }
    ), 200


@admin_bp.route("/jobs/dead-letter/replay-filtered", methods=["POST"])
@role_required("admin")
def replay_dead_letter_jobs_filtered(user):
    d = request.get_json(silent=True) or {}
    filters = {
        "q": d.get("q", ""),
        "job_type": d.get("job_type", ""),
        "from": d.get("from", ""),
        "to": d.get("to", ""),
        "sort_by": d.get("sort_by", "updated_at"),
        "sort_dir": d.get("sort_dir", "desc"),
    }
    limit = max(1, min(_to_int(d.get("limit", 500), 500), 1000))

    try:
        rows, total_matched = _fetch_dead_letter_rows(filters, include_pagination=False)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    replayed = 0
    skipped = 0
    requested_rows = rows[:limit]
    for row in requested_rows:
        job_id = _as_text(row.get("job_id"))
        if not job_id:
            skipped += 1
            continue
        if _requeue_dead_letter_job_by_id(job_id):
            replayed += 1
        else:
            skipped += 1

    log_action(
        "REPLAY_DEAD_LETTER_JOB_FILTERED",
        str(user["_id"]),
        details=(
            f"matched={total_matched}, limit={limit}, requested={len(requested_rows)}, "
            f"replayed={replayed}, skipped={skipped}"
        ),
    )

    return jsonify(
        {
            "message": "Filtered dead-letter replay processed",
            "matched": total_matched,
            "limit": limit,
            "requested": len(requested_rows),
            "replayed": replayed,
            "skipped": skipped,
        }
    ), 200


@admin_bp.route("/jobs/metrics", methods=["GET"])
@role_required("admin")
def get_job_metrics(user):
    jobs = get_collection("attendance", "background_jobs")
    summary = {
        "queued": 0,
        "running": 0,
        "completed": 0,
        "dead_letter": 0,
    }

    for row in jobs.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]):
        status = _as_text(row.get("_id")).lower()
        if status in summary:
            summary[status] = int(row.get("count", 0) or 0)

    queue_depth = None
    delayed_queue_depth = None
    due_delayed_count = None
    client = _get_task_queue_client()
    if client is not None:
        try:
            queue_name, delayed_queue_name = _get_queue_names()
            queue_depth = int(client.llen(queue_name) or 0)
            delayed_queue_depth = int(client.zcard(delayed_queue_name) or 0)
            due_delayed_count = int(client.zcount(delayed_queue_name, 0, int(time.time())) or 0)
        except Exception:
            current_app.logger.exception("Unable to read queue metrics")

    running_timeout_seconds = max(30, _to_int(current_app.config.get("TASK_QUEUE_RUNNING_TIMEOUT_SECONDS", 900), 900))
    stale_cutoff = _utcnow() - timedelta(seconds=running_timeout_seconds)
    stale_running_count = int(
        jobs.count_documents({"status": "running", "updated_at": {"$lte": stale_cutoff}})
    )
    dead_letter_last_24h = int(
        jobs.count_documents({"status": "dead_letter", "updated_at": {"$gte": _utcnow() - timedelta(hours=24)}})
    )
    recent_dead_letter_jobs = sanitise_many(
        list(
            jobs.find(
                {"status": "dead_letter"},
                {
                    "_id": 0,
                    "job_id": 1,
                    "job_type": 1,
                    "error": 1,
                    "updated_at": 1,
                    "attempts": 1,
                    "max_attempts": 1,
                },
            )
            .sort("updated_at", -1)
            .limit(5)
        )
    )

    return jsonify(
        {
            "jobs": {
                "total": int(sum(summary.values())),
                **summary,
                "stale_running": stale_running_count,
                "dead_letter_last_24h": dead_letter_last_24h,
                "recent_dead_letter_jobs": recent_dead_letter_jobs,
            },
            "queue": {
                "enabled": bool(current_app.config.get("TASK_QUEUE_ENABLED", False)),
                "depth": queue_depth,
                "delayed_depth": delayed_queue_depth,
                "due_delayed": due_delayed_count,
                "running_timeout_seconds": running_timeout_seconds,
            },
        }
    )


@admin_bp.route("/capture-faces", methods=["POST"])
@role_required("admin")
def capture_faces_dataset(user):
    """Capture webcam dataset images for a named user into dataset/<user_name>."""
    d = request.get_json(silent=True) or {}
    user_name = _as_text(d.get("user_name", ""))
    total_images = _to_int(d.get("total_images"), 50)

    if not user_name:
        return jsonify({"error": "user_name is required"}), 400
    if total_images <= 0:
        return jsonify({"error": "total_images must be greater than 0"}), 400

    try:
        saved_paths = capture_faces_for_user(
            user_name=user_name,
            dataset_root="dataset",
            total_images=total_images,
            delay_seconds=0.1,
        )
    except Exception as exc:
        current_app.logger.exception("Dataset capture failed")
        return jsonify({"error": f"Dataset capture failed: {exc}"}), 500

    log_action(
        "CAPTURE_FACE_DATASET",
        str(user["_id"]),
        details=f"Captured {len(saved_paths)} images for {user_name}",
    )

    return jsonify({
        "message": "Face dataset captured successfully",
        "captured_count": len(saved_paths),
        "dataset_folder": os.path.dirname(saved_paths[0]) if saved_paths else "dataset",
    }), 200


@admin_bp.route("/courses/reassign", methods=["POST"])
@role_required("admin")
def reassign_course_entities(user):
    """Batch move students/papers from one course to another active course."""
    d = request.get_json(silent=True) or {}
    from_course_id = _as_text(d.get("from_course_id"))
    to_course_id = _as_text(d.get("to_course_id"))
    move_students = _to_bool(d.get("move_students", True))
    move_papers = _to_bool(d.get("move_papers", True))

    if not from_course_id or not to_course_id:
        return jsonify({"error": "from_course_id and to_course_id are required"}), 400
    if from_course_id == to_course_id:
        return jsonify({"error": "from_course_id and to_course_id must be different"}), 400

    source_course = _safe_get_course(from_course_id)
    if not source_course:
        return jsonify({"error": "Source course not found"}), 404

    target_course, target_error = _get_active_course_or_error(to_course_id)
    if target_error:
        return target_error

    profile_col = get_collection("academic", "student_profiles")
    paper_col = get_collection("academic", "papers")

    moved_students = 0
    moved_papers = 0
    if move_students:
        res = profile_col.update_many({"course_id": from_course_id}, {"$set": {"course_id": to_course_id}})
        moved_students = int(res.modified_count)

    if move_papers:
        res = paper_col.update_many({"course_id": from_course_id}, {"$set": {"course_id": to_course_id}})
        moved_papers = int(res.modified_count)

    log_action(
        "REASSIGN_COURSE_ENTITIES",
        str(user["_id"]),
        details=(
            f"from={from_course_id}, to={to_course_id}, "
            f"move_students={move_students}, move_papers={move_papers}, "
            f"moved_students={moved_students}, moved_papers={moved_papers}"
        ),
    )
    _clear_query_cache()

    return jsonify(
        {
            "message": "Reassignment completed",
            "from_course": sanitise_mongo_doc(source_course),
            "to_course": sanitise_mongo_doc(target_course),
            "moved_students": moved_students,
            "moved_papers": moved_papers,
        }
    ), 200


# ─── Audit Trail ────────────────────────────────────────────────────────────

@admin_bp.route("/audit-logs", methods=["GET"])
@role_required("admin")
def list_audit_logs(user):
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    action = _as_text(request.args.get("action", "")).upper()
    date_from = _as_text(request.args.get("from", ""))
    date_to = _as_text(request.args.get("to", ""))

    filters = {}
    if action:
        # Contains match allows flexible keyword search like OVERRIDE, CREATE, DELETE, etc.
        filters["action"] = {"$regex": re.escape(action), "$options": "i"}

    ts_filter = {}
    try:
        if date_from:
            ts_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d")
    except ValueError:
        pass
    try:
        if date_to:
            # Inclusive end date: < next day midnight UTC.
            ts_filter["$lt"] = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        pass

    if ts_filter:
        filters["timestamp"] = ts_filter

    logs, total = get_audit_logs(page, per_page, filters)
    audit_user_ids = [
        item.get("performed_by") for item in logs if item.get("performed_by")
    ] + [
        item.get("target_user") for item in logs if item.get("target_user")
    ]
    user_map = get_users_by_ids(audit_user_ids)

    enriched = []
    for raw in logs:
        item = sanitise_mongo_doc(raw)

        actor = user_map.get(_as_text(item.get("performed_by"))) if item.get("performed_by") else None
        target_user = user_map.get(_as_text(item.get("target_user"))) if item.get("target_user") else None

        item["actor_name"] = (actor or {}).get("name") or "Unknown User"
        item["actor_email"] = (actor or {}).get("email") or ""
        item["role"] = (actor or {}).get("role") or item.get("role") or "unknown"

        if target_user:
            item["target_type"] = f"{target_user.get('name', 'Unknown')} ({target_user.get('role', 'user')})"
            item["target_user_name"] = target_user.get("name")
            item["target_user_email"] = target_user.get("email")
            item["target_user_role"] = target_user.get("role")
        elif item.get("target_user"):
            item["target_type"] = f"User {item.get('target_user')}"
        else:
            item["target_type"] = item.get("details") or "System"

        item["ip"] = item.get("ip") or ""

        rollback_payload = item.get("rollback")
        ts = item.get("timestamp")
        rollback_until = item.get("rollback_until")
        if rollback_payload and not rollback_until and ts:
            rollback_until = ts + timedelta(days=1)
            item["rollback_until"] = rollback_until

        rolled_back = bool(item.get("rolled_back"))
        now = datetime.utcnow()
        eligible = bool(rollback_payload) and not rolled_back and bool(rollback_until) and now <= rollback_until
        item["rollback_available"] = eligible
        item["rolled_back"] = rolled_back

        # Raw rollback payload may contain nested ObjectIds/documents used internally
        # for rollback execution and is not needed by UI list rendering.
        item.pop("rollback", None)

        enriched.append(item)

    return jsonify({
        "logs": enriched,
        "total": total,
        "page": page,
        "per_page": per_page,
    })


@admin_bp.route("/audit-logs/<log_id>/rollback", methods=["POST"])
@role_required("admin")
def rollback_audit_action(user, log_id):
    audit_log = get_audit_log_by_id(log_id)
    if not audit_log:
        return jsonify({"error": "Audit log not found"}), 404

    if audit_log.get("rolled_back"):
        return jsonify({"error": "This action has already been rolled back"}), 400

    rollback_payload = audit_log.get("rollback")
    if not rollback_payload:
        return jsonify({"error": "Rollback not available for this action"}), 400

    rollback_until = audit_log.get("rollback_until")
    if not rollback_until:
        rollback_until = (audit_log.get("timestamp") or datetime.utcnow()) + timedelta(days=1)

    if datetime.utcnow() > rollback_until:
        return jsonify({"error": "Rollback window expired (1 day)"}), 403

    try:
        _execute_rollback_operation(rollback_payload)
    except Exception as exc:
        current_app.logger.exception("Audit rollback failed")
        return jsonify({"error": f"Rollback failed: {exc}"}), 500

    mark_audit_log_rolled_back(log_id, str(user["_id"]))
    log_action(
        "ROLLBACK_ACTION",
        str(user["_id"]),
        details=f"Rolled back audit log {log_id}",
    )
    return jsonify({"message": "Rollback completed successfully"}), 200


# ─── Attendance Override ────────────────────────────────────────────────────

@admin_bp.route("/attendance/override", methods=["POST"])
@role_required("admin")
def override_attendance(user):
    """Manually add or remove an attendance record (Special Exam Access)."""
    d = request.get_json(silent=True) or {}
    action = d.get("action", "add")  # "add" or "remove"

    if action == "add":
        log = log_attendance(
            d["paper_id"], d["student_id"], str(user["_id"]),
            session_id="manual-override", method="manual",
        )
        log_action("ATTENDANCE_OVERRIDE_ADD", str(user["_id"]),
                   target_user=d["student_id"],
                   details=f"Paper {d['paper_id']}")
        _clear_query_cache()
        return jsonify({"message": "Attendance added", "log": log}), 201
    else:
        from app.models.attendance import delete_attendance_log
        delete_attendance_log(d["log_id"])
        log_action("ATTENDANCE_OVERRIDE_REMOVE", str(user["_id"]),
                   details=f"Log {d['log_id']}")
        _clear_query_cache()
        return jsonify({"message": "Attendance removed"}), 200


@admin_bp.route("/exam-eligibility-summary", methods=["GET"])
@role_required("admin")
def exam_eligibility_summary(user):
    """Admin view of exam eligibility with filters and override states."""
    cache_key = (
        "exam_eligibility_summary",
        tuple(sorted((k, _as_text(v)) for k, v in request.args.items())),
    )
    cached_payload = _cache_get(cache_key)
    if cached_payload is not None:
        return jsonify(cached_payload)

    course_id = _as_text(request.args.get("course_id", ""))
    paper_id = _as_text(request.args.get("paper_id", ""))
    academic_session = _normalise_year(request.args.get("academic_session", "")) or _normalise_year(request.args.get("academic_year", ""))
    semester_filter = _as_text(request.args.get("semester", ""))
    q = _as_text(request.args.get("q", "")).lower()
    final_eligible_filter = _as_text(request.args.get("final_eligible", ""))
    include_inactive = _to_bool(request.args.get("include_inactive", False))

    profiles_col = get_collection("academic", "student_profiles")
    profiles = list(
        profiles_col.find(
            {},
            {
                "user_id": 1,
                "course_id": 1,
                "academic_year": 1,
                "academic_session": 1,
                "year": 1,
                "current_semester": 1,
                "enrolled_papers": 1,
                "reg_number": 1,
                "roll_number": 1,
                "created_at": 1,
            },
        )
    )
    courses = sanitise_many(get_all_courses(["name", "code", "status", "department", "course_duration", "year"]))
    papers = sanitise_many(get_all_papers(["name", "code", "semester", "course_id", "lecturer_id", "created_at"]))
    course_map = {c["_id"]: c for c in courses}
    paper_map = {p["_id"]: p for p in papers}
    user_map = get_users_by_ids(profile.get("user_id") for profile in profiles)
    overrides_col = get_collection("attendance", "exam_eligibility_overrides")
    sessions_col = get_collection("attendance", "attendance_sessions")

    classes_happened_by_paper = {}
    classes_happened_by_paper_lecturer = {}
    for row in sessions_col.aggregate([
        {
            "$group": {
                "_id": {
                    "paper_id": "$paper_id",
                    "lecturer_id": "$lecturer_id",
                },
                "count": {"$sum": 1},
            }
        }
    ]):
        gid = row.get("_id") or {}
        gid_paper = _as_text(gid.get("paper_id"))
        gid_lecturer = _as_text(gid.get("lecturer_id"))
        count = int(row.get("count", 0) or 0)

        if gid_paper:
            classes_happened_by_paper[gid_paper] = classes_happened_by_paper.get(gid_paper, 0) + count
            if gid_lecturer:
                classes_happened_by_paper_lecturer[(gid_paper, gid_lecturer)] = count

    selected_profiles = []
    relevant_student_ids = []
    relevant_paper_ids = set()

    for profile in profiles:
        uid = profile.get("user_id")
        if not uid:
            continue
        uid_text = _as_text(uid)
        student = user_map.get(uid_text)
        if not student:
            continue

        stu_course_id = _as_text(profile.get("course_id", ""))
        course_doc = course_map.get(stu_course_id)
        course_status = _as_text((course_doc or {}).get("status") or "active").lower() or "active"
        if course_status != "active" and not include_inactive:
            continue
        stu_year = _as_text(profile.get("academic_session") or profile.get("academic_year") or profile.get("year"))
        enrolled = profile.get("enrolled_papers", []) or []
        stu_semester = _to_int(profile.get("current_semester"), 0) or None
        if stu_semester is None:
            derived_semesters = []
            for pid in enrolled:
                pdoc = paper_map.get(pid) or {}
                psem = _to_int(pdoc.get("semester"), 0)
                if psem > 0:
                    derived_semesters.append(psem)
            if derived_semesters:
                stu_semester = max(derived_semesters)

        if course_id and stu_course_id != course_id:
            continue
        if academic_session and stu_year != academic_session:
            continue

        selected_profiles.append((profile, student, uid_text, stu_course_id, stu_year, enrolled, stu_semester))
        relevant_student_ids.append(uid_text)
        for pid in enrolled:
            pid_text = _as_text(pid)
            if paper_id and pid_text != paper_id:
                continue
            paper = paper_map.get(pid_text) or paper_map.get(pid)
            if not paper:
                continue
            paper_semester = _to_int(paper.get("semester"), 0)
            if semester_filter and str(paper_semester) != semester_filter:
                continue
            relevant_paper_ids.add(pid_text)

    student_match_ids = []
    for sid in relevant_student_ids:
        student_match_ids.extend(_id_variants(sid))
    paper_match_ids = []
    for pid in relevant_paper_ids:
        paper_match_ids.extend(_id_variants(pid))

    attendance_count_map = {}
    if student_match_ids and paper_match_ids:
        attendance_logs = get_collection("attendance", "attendance_logs")
        for row in attendance_logs.aggregate([
            {
                "$match": {
                    "student_id": {"$in": student_match_ids},
                    "paper_id": {"$in": paper_match_ids},
                }
            },
            {
                "$group": {
                    "_id": {
                        "student_id": "$student_id",
                        "paper_id": "$paper_id",
                    },
                    "count": {"$sum": 1},
                }
            },
        ]):
            gid = row.get("_id") or {}
            attendance_count_map[(
                _as_text(gid.get("student_id")),
                _as_text(gid.get("paper_id")),
            )] = int(row.get("count", 0) or 0)

    override_map = {}
    if student_match_ids and paper_match_ids:
        for override in overrides_col.find(
            {
                "student_id": {"$in": student_match_ids},
                "paper_id": {"$in": paper_match_ids},
            },
            {
                "_id": 0,
                "student_id": 1,
                "paper_id": 1,
                "override_status": 1,
                "reason": 1,
            },
        ):
            key = (_as_text(override.get("student_id")), _as_text(override.get("paper_id")))
            override_map[key] = {
                "override_status": override.get("override_status"),
                "reason": _as_text(override.get("reason", "")),
            }

    items = []
    for profile, student, uid, stu_course_id, stu_year, enrolled, stu_semester in selected_profiles:
        course = course_map.get(stu_course_id)
        per_paper_rows = []
        total_attended_overall = 0
        total_classes_overall = 0

        for pid in enrolled:
            pid_text = _as_text(pid)
            if paper_id and pid_text != paper_id:
                continue

            paper = paper_map.get(pid_text) or paper_map.get(pid)
            if not paper:
                continue

            paper_semester = _to_int(paper.get("semester"), 0)
            if semester_filter and str(paper_semester) != semester_filter:
                continue

            lecturer_id_for_paper = _as_text(paper.get("lecturer_id", ""))
            profile_created_at = profile.get("created_at")

            # Count classes conducted for this subject by the assigned lecturer,
            # scoped to sessions after the student was enrolled.
            session_query = {"paper_id": {"$in": _id_variants(pid_text)}}
            if lecturer_id_for_paper:
                session_query["lecturer_id"] = {"$in": _id_variants(lecturer_id_for_paper)}

            if profile_created_at:
                session_query["$or"] = [
                    {"committed_at": {"$gte": profile_created_at}},
                    {
                        "committed_at": {"$exists": False},
                        "last_updated_at": {"$gte": profile_created_at},
                    },
                    {
                        "committed_at": {"$exists": False},
                        "last_updated_at": {"$exists": False},
                        "created_at": {"$gte": profile_created_at},
                    },
                ]
                classes_happened = int(sessions_col.count_documents(session_query) or 0)
            elif lecturer_id_for_paper:
                classes_happened = int(
                    classes_happened_by_paper_lecturer.get((pid_text, lecturer_id_for_paper), 0) or 0
                )
            else:
                classes_happened = int(classes_happened_by_paper.get(pid_text, 0) or 0)

            attended = attendance_count_map.get((_as_text(uid), pid_text), 0)
            pct = round((attended / classes_happened) * 100, 2) if classes_happened > 0 else 0.0

            total_attended_overall += attended
            total_classes_overall += classes_happened

            override = override_map.get((_as_text(uid), pid_text))
            override_status = None if not override else override.get("override_status")
            override_reason = "" if not override else override.get("reason", "")

            if q and not (
                q in _as_text(student.get("name", "")).lower()
                or q in _as_text(student.get("email", "")).lower()
                or q in _as_text(profile.get("reg_number") or profile.get("roll_number")).lower()
                or q in _as_text(paper.get("name", "")).lower()
                or q in _as_text(paper.get("code", "")).lower()
            ):
                continue

            per_paper_rows.append({
                "student_id": uid,
                "student_name": student.get("name", "Unknown"),
                "student_email": student.get("email", ""),
                "reg_number": profile.get("reg_number") or profile.get("roll_number"),
                "course_id": stu_course_id,
                "course_name": (course or {}).get("name"),
                "student_semester": stu_semester,
                "paper_id": pid_text,
                "paper_name": paper.get("name", ""),
                "paper_code": paper.get("code", ""),
                "semester": paper_semester or None,
                "lecturer_id": lecturer_id_for_paper,
                "academic_year": stu_year,
                "academic_session": stu_year,
                "enrolled_since": profile_created_at,
                "attended": attended,
                "total_classes": classes_happened,
                "attended_classes": attended,
                "classes_happened": classes_happened,
                "attendance_percentage": pct,
                "override_status": override_status,
                "override_reason": override_reason,
            })

        overall_pct = round((total_attended_overall / total_classes_overall) * 100, 2) if total_classes_overall > 0 else 0.0
        has_lectures = total_classes_overall > 0
        overall_eligible = (overall_pct >= 75.0) if has_lectures else None

        for row in per_paper_rows:
            override_status = row.get("override_status")
            final_eligible = overall_eligible if override_status is None else bool(override_status)
            if final_eligible is None:
                eligibility_status = "no_lectures_yet"
            else:
                eligibility_status = "eligible" if final_eligible else "ineligible"

            if final_eligible_filter:
                required = _to_bool(final_eligible_filter)
                if final_eligible is None or final_eligible != required:
                    continue

            row["overall_attendance_percentage"] = overall_pct
            row["overall_attended_classes"] = total_attended_overall
            row["overall_total_classes"] = total_classes_overall
            row["eligible_by_attendance"] = overall_eligible
            row["final_eligible"] = final_eligible
            row["eligibility_status"] = eligibility_status
            items.append(row)

    payload = {
        "total": len(items),
        "eligible_count": sum(1 for x in items if x["final_eligible"] is True),
        "ineligible_count": sum(1 for x in items if x["final_eligible"] is False),
        "items": items,
    }
    _cache_set(cache_key, payload, _ELIGIBILITY_CACHE_TTL_SECONDS)
    return jsonify(payload)


@admin_bp.route("/exam-eligibility-override", methods=["PUT"])
@role_required("admin")
def set_exam_eligibility_override(user):
    """Override final exam eligibility status for a student-paper pair."""
    d = request.get_json(silent=True) or {}
    student_id = _as_text(d.get("student_id", ""))
    paper_id = _as_text(d.get("paper_id", ""))
    reason = _as_text(d.get("reason", ""))

    if not student_id or not paper_id:
        return jsonify({"error": "student_id and paper_id are required"}), 400

    if d.get("override_status", None) is None:
        return jsonify({"error": "override_status must be true or false"}), 400

    raw_status = d.get("override_status")
    if isinstance(raw_status, str):
        raw_lower = raw_status.strip().lower()
        if raw_lower not in {"1", "0", "true", "false", "yes", "no", "y", "n"}:
            return jsonify({"error": "override_status must be true or false"}), 400
    override_status = _to_bool(raw_status)

    overrides_col = get_collection("attendance", "exam_eligibility_overrides")
    overrides_col.update_one(
        {
            "student_id": {"$in": _id_variants(student_id)},
            "paper_id": {"$in": _id_variants(paper_id)},
        },
        {
            "$set": {
                "student_id": student_id,
                "paper_id": paper_id,
                "override_status": override_status,
                "reason": reason,
                "updated_by": str(user["_id"]),
                "updated_at": datetime.utcnow(),
            }
        },
        upsert=True,
    )

    log_action(
        "EXAM_ELIGIBILITY_OVERRIDE",
        str(user["_id"]),
        target_user=student_id,
        details=f"Paper {paper_id}, override={override_status}, reason={reason}",
    )
    _clear_query_cache()
    return jsonify({"message": "Eligibility override updated"}), 200


@admin_bp.route("/exam-eligibility-override/bulk", methods=["PUT"])
@role_required("admin")
def set_exam_eligibility_override_bulk(user):
    """Bulk override final exam eligibility for multiple student-paper pairs."""
    d = request.get_json(silent=True) or {}
    overrides = d.get("overrides")

    if not isinstance(overrides, list) or len(overrides) == 0:
        return jsonify({"error": "overrides must be a non-empty list"}), 400

    sanitized = []
    for item in overrides:
        if not isinstance(item, dict):
            continue

        student_id = _as_text(item.get("student_id", ""))
        paper_id = _as_text(item.get("paper_id", ""))
        if not student_id or not paper_id:
            continue
        if item.get("override_status", None) is None:
            continue
        if isinstance(item.get("override_status"), str):
            raw_lower = item.get("override_status", "").strip().lower()
            if raw_lower not in {"1", "0", "true", "false", "yes", "no", "y", "n"}:
                continue

        sanitized.append({
            "student_id": student_id,
            "paper_id": paper_id,
            "override_status": _to_bool(item.get("override_status")),
            "reason": _as_text(item.get("reason", "")),
        })

    if not sanitized:
        return jsonify({"error": "No valid override items found"}), 400

    overrides_col = get_collection("attendance", "exam_eligibility_overrides")
    now = datetime.utcnow()
    admin_id = str(user["_id"])
    unique_pairs = set()

    for item in sanitized:
        pair = (item["student_id"], item["paper_id"])
        if pair in unique_pairs:
            continue
        unique_pairs.add(pair)
        overrides_col.update_one(
            {
                "student_id": {"$in": _id_variants(item["student_id"])},
                "paper_id": {"$in": _id_variants(item["paper_id"])},
            },
            {
                "$set": {
                    "student_id": item["student_id"],
                    "paper_id": item["paper_id"],
                    "override_status": item["override_status"],
                    "reason": item["reason"],
                    "updated_by": admin_id,
                    "updated_at": now,
                }
            },
            upsert=True,
        )

    log_action(
        "EXAM_ELIGIBILITY_OVERRIDE_BULK",
        admin_id,
        details=f"Bulk overrides applied: {len(unique_pairs)}",
    )
    _clear_query_cache()
    return jsonify({"message": "Bulk eligibility overrides updated", "updated": len(unique_pairs)}), 200


# ─── Dashboard Stats ────────────────────────────────────────────────────────

@admin_bp.route("/stats", methods=["GET"])
@role_required("admin")
def dashboard_stats(user):
    cache_key = ("dashboard_stats",)
    cached_payload = _cache_get(cache_key)
    if cached_payload is not None:
        return jsonify(cached_payload)

    started_at = current_app.config.get("APP_STARTED_AT")
    uptime_seconds = int((datetime.utcnow() - started_at).total_seconds()) if started_at else 0
    uptime_days, remainder = divmod(max(uptime_seconds, 0), 86400)
    uptime_hours, remainder = divmod(remainder, 3600)
    uptime_minutes, uptime_seconds = divmod(remainder, 60)

    uptime_parts = []
    if uptime_days:
        uptime_parts.append(f"{uptime_days}d")
    if uptime_hours or uptime_parts:
        uptime_parts.append(f"{uptime_hours}h")
    uptime_parts.append(f"{uptime_minutes}m")
    system_uptime = " ".join(uptime_parts)

    def _month_start(dt):
        return datetime(dt.year, dt.month, 1)

    def _shift_month(dt, delta):
        year = dt.year + ((dt.month - 1 + delta) // 12)
        month = ((dt.month - 1 + delta) % 12) + 1
        return datetime(year, month, 1)

    def _monthly_attendance(attendance_col, months=6):
        now = datetime.utcnow()
        current_month = _month_start(now)
        start_month = _shift_month(current_month, -(months - 1))

        # Use Python-side aggregation for resilience against legacy/mixed timestamp types.
        # Some old records may contain string timestamps, which can break Mongo $year/$month.
        docs = attendance_col.find({}, {"timestamp": 1})
        count_map = {}
        for doc in docs:
            ts = doc.get("timestamp")
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    continue

            if not isinstance(ts, datetime):
                continue
            if ts < start_month:
                continue

            key = f"{ts.year}-{ts.month:02d}"
            count_map[key] = count_map.get(key, 0) + 1

        points = []
        for i in range(months):
            month_dt = _shift_month(start_month, i)
            key = f"{month_dt.year}-{month_dt.month:02d}"
            points.append(
                {
                    "key": key,
                    "label": month_dt.strftime("%b"),
                    "total": count_map.get(key, 0),
                }
            )

        return points

    profiles_col = get_collection("academic", "student_profiles")
    by_course = {}
    by_year = {}
    courses = sanitise_many(get_all_courses(["name", "code", "year", "status"]))
    course_map = {c["_id"]: c for c in courses}

    active_course_ids = {
        c.get("_id")
        for c in courses
        if _as_text(c.get("status") or "active").lower() == "active"
    }

    profiles = list(
        profiles_col.find(
            {},
            {
                "course_id": 1,
                "academic_session": 1,
                "academic_year": 1,
                "year": 1,
            },
        )
    )

    for profile in profiles:
        cid = _as_text(profile.get("course_id"))
        if cid and cid not in active_course_ids:
            continue

        course = course_map.get(cid)
        course_key = course.get("name") if course else "Unassigned"
        by_course[course_key] = by_course.get(course_key, 0) + 1

        year_key = _normalise_year(
            profile.get("academic_session")
            or profile.get("academic_year")
            or profile.get("year")
        ) or "Unknown"
        by_year[year_key] = by_year.get(year_key, 0) + 1

    users_col = get_collection("auth", "users")
    courses_col = get_collection("academic", "courses")
    papers_col = get_collection("academic", "papers")
    attendance_col = get_collection("attendance", "attendance_logs")
    audit_col = get_collection("audit", "audit_logs")

    active_courses_count = courses_col.count_documents({
        "$or": [
            {"status": "active"},
            {"status": {"$exists": False}},
            {"status": ""},
            {"status": None},
        ]
    })
    inactive_courses_count = courses_col.count_documents({"status": "inactive"})
    total_courses_count = active_courses_count + inactive_courses_count

    active_paper_count = 0
    inactive_paper_count = 0
    for paper in papers_col.find({}, {"course_id": 1}):
        paper_course_id = _as_text(paper.get("course_id"))
        if not paper_course_id or paper_course_id in active_course_ids:
            active_paper_count += 1
        else:
            inactive_paper_count += 1

    app_started_at = None
    if started_at:
        iso_started_at = started_at.isoformat()
        tz_part = iso_started_at[10:]
        has_tz = iso_started_at.endswith("Z") or "+" in tz_part or "-" in tz_part
        app_started_at = iso_started_at if has_tz else f"{iso_started_at}Z"

    payload = {
        "total_students": users_col.count_documents({"role": "student"}),
        "total_lecturers": users_col.count_documents({"role": "lecturer"}),
        "total_courses": total_courses_count,
        "active_courses": active_courses_count,
        "inactive_courses": inactive_courses_count,
        "total_papers": active_paper_count,
        "inactive_papers": inactive_paper_count,
        "total_attendance": attendance_col.count_documents({}),
        "total_audit_logs": audit_col.count_documents({}),
        "app_started_at": app_started_at,
        "system_uptime_seconds": max(int((datetime.utcnow() - started_at).total_seconds()), 0) if started_at else 0,
        "system_uptime": system_uptime,
        "students_by_course": by_course,
        "students_by_year": by_year,
        "monthly_attendance": _monthly_attendance(attendance_col, months=6),
    }
    _cache_set(cache_key, payload, _QUERY_CACHE_TTL_SECONDS)
    return jsonify(payload)
