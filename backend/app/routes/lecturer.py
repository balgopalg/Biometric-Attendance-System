"""Lecturer routes — paper list, attendance session, PIN commit and rollback."""

import secrets
import uuid
from collections import defaultdict, OrderedDict
from datetime import datetime, timedelta, timezone
import os
from threading import Lock

import cv2
from flask import Blueprint, request, jsonify, current_app
from bson import ObjectId

from app.extensions import get_collection
from app.models.audit import log_action
from app.models.attendance import log_attendance
from app.models.course import get_course_by_id
from app.models.enrollment import get_profiles_for_paper, get_profile_by_user
from app.models.paper import get_paper_by_id, get_papers_by_lecturer, increment_total_classes
from app.models.user import find_user_by_id, set_user_pin, verify_user_pin
from app.services.face_detection import get_detector
from app.services.face_recognition import (
    generate_embedding,
    find_best_match,
    find_best_match_cached,
    prepare_profile_candidates,
)
from app.services.capture_upload import save_classroom_upload_bundle
from app.security.brute_force_protection import BruteForceProtector
from app.security.rate_limiter import limiter
from app.observability.logging import attendance_logger
from app.utils.auth_decorators import role_required
from app.utils.helpers import sanitise_mongo_doc, decode_base64_image, decode_image_bytes

lecturer_bp = Blueprint("lecturer", __name__)

ROLLBACK_MINUTES = 30
_SESSIONS_NORMALIZED = False
_SESSIONS_NORMALIZE_LOCK = Lock()
_DEFAULT_ACTIVE_SESSION_TIMEOUT_MINUTES = 180
_ALLOWED_UPLOAD_MIME_TYPES = {"image/jpeg", "image/png", "image/bmp", "image/webp"}
_ALLOWED_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_SESSION_CANDIDATES_CACHE_MAX_ENTRIES_DEFAULT = 500
_SESSION_CANDIDATES_CACHE = OrderedDict()
_SESSION_CANDIDATES_LOCK = Lock()


def _normalize_attendance_sessions_once():
    """One-time repair for legacy attendance_sessions documents.

    Fixes missing/typed fields that can make valid committed sessions disappear
    from history views after rollback re-commit flows.
    """
    global _SESSIONS_NORMALIZED
    if _SESSIONS_NORMALIZED:
        return

    with _SESSIONS_NORMALIZE_LOCK:
        if _SESSIONS_NORMALIZED:
            return

        sessions_col = get_collection("attendance", "attendance_sessions")
        for doc in sessions_col.find({}):
            session_id = doc.get("session_id")
            if not session_id:
                session_id = str(doc.get("_id"))

            lecturer_id = doc.get("lecturer_id")
            paper_id = doc.get("paper_id")
            user_ids = doc.get("user_ids") or []
            if not isinstance(user_ids, list):
                user_ids = [user_ids]

            # Normalize IDs and deduplicate while preserving order.
            normalized_students = []
            seen = set()
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

            updates = {
                "session_id": str(session_id),
                "lecturer_id": str(lecturer_id) if lecturer_id is not None else "",
                "paper_id": str(paper_id) if paper_id is not None else "",
                "user_ids": normalized_students,
                "academic_session": str(academic_session) if academic_session else "",
                "academic_year": str(academic_session) if academic_session else "",
                "last_updated_at": doc.get("last_updated_at") or committed_at or datetime.now(timezone.utc),
            }
            if committed_at:
                updates["committed_at"] = committed_at

            sessions_col.update_one({"_id": doc.get("_id")}, {"$set": updates})

        _SESSIONS_NORMALIZED = True


def _enrich_paper(paper):
    item = sanitise_mongo_doc(paper)
    course = None
    if item.get("course_id"):
        try:
            course = get_course_by_id(item["course_id"])
        except Exception:
            course = None
    item["course_name"] = (course or {}).get("name")
    item["course_code"] = (course or {}).get("code")
    item["course_status"] = str((course or {}).get("status") or "active").lower()
    item["is_course_inactive"] = item["course_status"] != "active"
    item["academic_year"] = item.get("academic_session") or item.get("academic_year")
    item["semester"] = item.get("semester")
    profiles = get_profiles_for_paper(item.get("_id")) if item.get("_id") else []
    item["total_enrolled_students"] = len(profiles)

    # Derive academic sessions from enrolled student profiles so lecturer dashboard
    # reflects real enrollment session for the subject.
    enrolled_sessions = []
    session_values = set()
    for profile in profiles:
        session = (
            profile.get("academic_session")
            or profile.get("academic_year")
            or profile.get("year")
        )
        text = str(session).strip() if session is not None else ""
        if text:
            session_values.add(text)
    enrolled_sessions = sorted(session_values)

    item["enrolled_academic_sessions"] = enrolled_sessions
    if enrolled_sessions:
        item["enrolled_academic_session"] = enrolled_sessions[0]
        item["enrolled_academic_session_label"] = (
            enrolled_sessions[0]
            if len(enrolled_sessions) == 1
            else f"{enrolled_sessions[0]} (+{len(enrolled_sessions) - 1} more)"
        )
    else:
        item["enrolled_academic_session"] = None
        item["enrolled_academic_session_label"] = None

    return item


def _get_session_doc(session_id):
    sessions = get_collection("attendance", "attendance_sessions")
    return sessions.find_one({"session_id": session_id})


def _active_sessions_collection():
    return get_collection("attendance", "active_sessions")


def _active_session_timeout_minutes():
    raw = current_app.config.get("ACTIVE_SESSION_TIMEOUT_MINUTES", _DEFAULT_ACTIVE_SESSION_TIMEOUT_MINUTES)
    try:
        return max(10, int(raw))
    except (TypeError, ValueError):
        return _DEFAULT_ACTIVE_SESSION_TIMEOUT_MINUTES


def _create_active_session(session_id, *, paper_id, lecturer_id):
    now = datetime.now(timezone.utc)
    timeout_minutes = _active_session_timeout_minutes()
    expires_at = now + timedelta(minutes=timeout_minutes)
    _active_sessions_collection().update_one(
        {"session_id": session_id},
        {
            "$set": {
                "session_id": session_id,
                "paper_id": str(paper_id),
                "lecturer_id": str(lecturer_id),
                "recognized": [],
                "started_at": now,
                "updated_at": now,
                "expires_at": expires_at,
            }
        },
        upsert=True,
    )


def _get_active_session(session_id):
    if not session_id:
        return None

    session = _active_sessions_collection().find_one({"session_id": str(session_id)})
    if not session:
        return None

    expires_at = session.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            _active_sessions_collection().delete_one({"session_id": str(session_id)})
            _clear_cached_session_candidates(session_id)
            return None

    return session


def _touch_active_session(session_id):
    now = datetime.now(timezone.utc)
    timeout_minutes = _active_session_timeout_minutes()
    _active_sessions_collection().update_one(
        {"session_id": str(session_id)},
        {
            "$set": {
                "updated_at": now,
                "expires_at": now + timedelta(minutes=timeout_minutes),
            }
        },
    )


def _save_recognized_students(session_id, recognized_ids):
    update_doc = {
        "$set": {
            "updated_at": datetime.now(timezone.utc),
        }
    }
    if recognized_ids:
        update_doc["$addToSet"] = {
            "recognized": {"$each": list(recognized_ids)}
        }
        
    _active_sessions_collection().update_one(
        {"session_id": str(session_id)},
        update_doc,
    )


def _delete_active_session(session_id):
    _active_sessions_collection().delete_one({"session_id": str(session_id)})
    _clear_cached_session_candidates(session_id)


def _within_rollback(session_doc):
    rollback_until = session_doc.get("rollback_until")
    if not rollback_until:
        return False
    if isinstance(rollback_until, datetime) and rollback_until.tzinfo is None:
        rollback_until = rollback_until.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) <= rollback_until


def _replace_session_attendance(session_id, paper_id, lecturer_id, user_ids, method="biometric"):
    # Replace entire attendance set for this session atomically from caller perspective.
    logs = get_collection("attendance", "attendance_logs")
    logs.delete_many({"session_id": session_id})
    for sid in user_ids:
        log_attendance(paper_id, sid, lecturer_id, session_id, method=method)


def _session_review_payload(session_doc):
    present_ids = session_doc.get("user_ids", [])
    present_students = []
    for uid in present_ids:
        u = find_user_by_id(uid)
        if u:
            present_students.append({
                "user_id": uid,
                "name": u.get("name", "Unknown"),
                "email": u.get("email", ""),
            })

    profiles = get_profiles_for_paper(session_doc.get("paper_id"))
    candidates = []
    for profile in profiles:
        uid = profile.get("user_id")
        u = find_user_by_id(uid)
        if u:
            candidates.append({
                "user_id": uid,
                "name": u.get("name", "Unknown"),
                "email": u.get("email", ""),
                "is_present": uid in present_ids,
            })

    paper = get_paper_by_id(session_doc.get("paper_id"))
    committed_at = session_doc.get("committed_at")
    rollback_until = session_doc.get("rollback_until")
    return {
        "session_id": session_doc.get("session_id"),
        "paper": _enrich_paper(paper) if paper else None,
        "present_students": present_students,
        "candidates": candidates,
        "committed_at": committed_at.isoformat() if hasattr(committed_at, "isoformat") else committed_at,
        "rollback_until": rollback_until.isoformat() if hasattr(rollback_until, "isoformat") else rollback_until,
        "editable": _within_rollback(session_doc) and not session_doc.get("finalized", False),
        "students_marked": len(present_ids),
    }


def _parse_date(value, end_of_day=False):
    if not value:
        return None
    try:
        dt = datetime.strptime(value, "%Y-%m-%d")
        if end_of_day:
            return dt + timedelta(days=1)
        return dt
    except Exception:
        return None


def _local_midnight_to_utc(local_midnight, tz_offset_minutes):
    if not isinstance(local_midnight, datetime):
        return None
    try:
        minutes = int(tz_offset_minutes)
    except Exception:
        minutes = 0
    return local_midnight + timedelta(minutes=minutes)


def _load_session_candidates(session: dict):
    """Build recognition candidates from durable session context."""
    paper_id = session.get("paper_id")
    profiles = get_profiles_for_paper(paper_id)
    return prepare_profile_candidates(profiles)


def _session_candidates_cache_max_entries():
    try:
        return max(
            50,
            int(
                current_app.config.get(
                    "QUERY_CACHE_MAX_ENTRIES",
                    _SESSION_CANDIDATES_CACHE_MAX_ENTRIES_DEFAULT,
                )
            ),
        )
    except Exception:
        return _SESSION_CANDIDATES_CACHE_MAX_ENTRIES_DEFAULT


def _get_cached_session_candidates(session: dict):
    """Return pre-normalized candidates cached for the active session."""
    session_id = str(session.get("session_id") or "")
    if not session_id:
        return _load_session_candidates(session)

    with _SESSION_CANDIDATES_LOCK:
        cached = _SESSION_CANDIDATES_CACHE.get(session_id)
        if cached is not None:
            _SESSION_CANDIDATES_CACHE.move_to_end(session_id)
            return cached

    prepared = _load_session_candidates(session)

    with _SESSION_CANDIDATES_LOCK:
        max_entries = _session_candidates_cache_max_entries()
        while len(_SESSION_CANDIDATES_CACHE) >= max_entries:
            _SESSION_CANDIDATES_CACHE.popitem(last=False)
        _SESSION_CANDIDATES_CACHE[session_id] = prepared
        _SESSION_CANDIDATES_CACHE.move_to_end(session_id)

    return prepared


def _clear_cached_session_candidates(session_id):
    sid = str(session_id or "")
    if not sid:
        return
    with _SESSION_CANDIDATES_LOCK:
        _SESSION_CANDIDATES_CACHE.pop(sid, None)


def _extract_classroom_faces(img_rgb, img_bgr=None):
    """Extract classroom face crops using MediaPipe first, then Haar cascade fallback."""
    detector = get_detector()
    faces = detector.detect_faces(img_rgb) or []

    if faces:
        return faces

    if img_bgr is None:
        img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    rects = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(40, 40),
    )

    fallback_faces = []
    for (x, y, w, h) in rects:
        pad = int(0.18 * max(w, h))
        x1 = max(x - pad, 0)
        y1 = max(y - pad, 0)
        x2 = min(x + w + pad, img_rgb.shape[1])
        y2 = min(y + h + pad, img_rgb.shape[0])
        crop = img_rgb[y1:y2, x1:x2]
        if crop.size == 0:
            continue
        crop_resized = cv2.resize(crop, (160, 160))
        fallback_faces.append({
            "bbox": (x, y, w, h),
            "confidence": 1.0,
            "crop": crop_resized,
        })

    if fallback_faces:
        return fallback_faces

    # Final fallback: detect people regions so the bundle still contains per-person crops.
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    boxes, _ = hog.detectMultiScale(
        img_bgr,
        winStride=(8, 8),
        padding=(8, 8),
        scale=1.05,
    )

    people_faces = []
    for (x, y, w, h) in boxes:
        pad = int(0.08 * max(w, h))
        x1 = max(x - pad, 0)
        y1 = max(y - pad, 0)
        x2 = min(x + w + pad, img_rgb.shape[1])
        y2 = min(y + h + pad, img_rgb.shape[0])
        crop = img_rgb[y1:y2, x1:x2]
        if crop.size == 0:
            continue
        crop_resized = cv2.resize(crop, (160, 160))
        people_faces.append({
            "bbox": (x, y, w, h),
            "confidence": 0.5,
            "crop": crop_resized,
        })

    return people_faces


@lecturer_bp.route("/papers", methods=["GET"])
@role_required("lecturer")
def my_papers(user):
    """List papers assigned to the current lecturer with course/year metadata."""
    papers = get_papers_by_lecturer(str(user["_id"]))
    return jsonify([_enrich_paper(p) for p in papers])


@lecturer_bp.route("/pin", methods=["GET"])
@role_required("lecturer")
def get_pin_status(user):
    has_pin = bool(str(user.get("pin_hash", "")).strip()) or bool(str(user.get("pin", "")).strip())
    return jsonify({"has_pin": has_pin, "pin_last_set": user.get("pin_last_set")})


@lecturer_bp.route("/pin", methods=["PUT"])
@role_required("lecturer")
def set_pin(user):
    d = request.get_json(silent=True) or {}
    pin = str(d.get("pin", "")).strip()
    if not pin.isdigit() or len(pin) != 4:
        return jsonify({"error": "PIN must be exactly 4 digits"}), 400

    set_user_pin(str(user["_id"]), pin)
    log_action("LECTURER_SET_PIN", str(user["_id"]), details="Lecturer updated personal PIN")
    return jsonify({"message": "PIN updated successfully"}), 200


@lecturer_bp.route("/pin/generate", methods=["POST"])
@role_required("lecturer")
def generate_pin(user):
    pin = f"{secrets.randbelow(10000):04d}"
    set_user_pin(str(user["_id"]), pin)
    log_action("LECTURER_GENERATE_PIN", str(user["_id"]), details="Lecturer generated a new PIN")
    return jsonify({"pin": pin, "message": "New PIN generated"}), 200


@lecturer_bp.route("/session/start", methods=["POST"])
@role_required("lecturer")
def start_session(user):
    """Start a new attendance session for a selected paper."""
    d = request.get_json(silent=True) or {}
    paper_id = d.get("paper_id")
    if not paper_id:
        return jsonify({"error": "paper_id is required"}), 400

    paper = get_paper_by_id(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found"}), 404

    course = get_course_by_id(paper.get("course_id")) if paper.get("course_id") else None
    if not course or str(course.get("status") or "active").lower() != "active":
        return jsonify({"error": "This subject belongs to an inactive course and cannot take attendance"}), 409

    if str(paper.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "You are not assigned to this paper"}), 403

    session_id = str(uuid.uuid4())
    _create_active_session(session_id, paper_id=paper_id, lecturer_id=str(user["_id"]))
    active = _get_active_session(session_id) or {}

    started_at = active.get("started_at")
    if started_at and hasattr(started_at, "isoformat"):
        started_at = started_at.isoformat()

    return jsonify({
        "session_id": session_id,
        "paper": _enrich_paper(paper),
        "started_at": started_at,
    })


@lecturer_bp.route("/session/recognize", methods=["POST"])
@role_required("lecturer")
@limiter.limit("30 per minute")
def recognize_frame(user):
    """Accept a webcam frame, run detection + recognition, return new matches."""
    d = request.get_json(silent=True) or {}
    session_id = d.get("session_id")
    frame_b64 = d.get("frame")

    if not session_id:
        return jsonify({"error": "Invalid session"}), 400
    if not frame_b64:
        return jsonify({"error": "frame is required"}), 400

    session = _get_active_session(session_id)
    if not session:
        return jsonify({"error": "Invalid session"}), 400
    if str(session.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    paper_id = session["paper_id"]

    try:
        img = decode_base64_image(frame_b64)
    except ValueError as e:
        return jsonify({"error": f"Invalid image data: {e}"}), 400
    detector = get_detector()
    faces = detector.detect_faces(img)

    if not faces:
        return jsonify({"new_matches": [], "faces_detected": 0, "candidates_count": 0, "threshold": current_app.config.get("FACENET_THRESHOLD", 0.60), "best_similarity_seen": None})

    candidates = _get_cached_session_candidates(session)
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.60)

    new_matches = []
    best_similarity_seen = -1.0
    for face in faces:
        embedding = generate_embedding(face["crop"])

        match, face_best_similarity = find_best_match_cached(
            embedding, candidates, threshold=threshold
        )
        if face_best_similarity > best_similarity_seen:
            best_similarity_seen = face_best_similarity

        if match and match["user_id"] not in session["recognized"]:
            session["recognized"].append(match["user_id"])
            stu_user = find_user_by_id(match["user_id"])
            match["name"] = stu_user["name"] if stu_user else "Unknown"
            new_matches.append(match)
            attendance_logger.info(
                "recognition_match",
                session_id=session_id,
                user_id=match["user_id"],
                similarity=match.get("similarity"),
                threshold=threshold,
            )
        elif not match and face_best_similarity >= 0:
            attendance_logger.debug(
                "recognition_below_threshold",
                session_id=session_id,
                best_similarity=round(face_best_similarity, 4),
                threshold=threshold,
            )

    _save_recognized_students(session_id, session.get("recognized") or [])
    _touch_active_session(session_id)

    return jsonify({
        "new_matches": new_matches,
        "faces_detected": len(faces),
        "total_recognized": len(session["recognized"]),
        "candidates_count": len(candidates),
        "threshold": threshold,
        "best_similarity_seen": round(best_similarity_seen, 4) if best_similarity_seen >= 0 else None,
    })


@lecturer_bp.route("/session/recognize-image", methods=["POST"])
@role_required("lecturer")
@limiter.limit("20 per minute")
def recognize_image(user):
    """Accept an uploaded classroom image, run detection + recognition, return new matches."""
    session_id = request.form.get("session_id")
    
    if not session_id:
        return jsonify({"error": "Invalid session"}), 400
    
    if "image" not in request.files:
        return jsonify({"error": "image file is required"}), 400
    
    file = request.files["image"]
    if not file or file.filename == "":
        return jsonify({"error": "No image file selected"}), 400

    content_type = str(getattr(file, "content_type", "") or "").strip().lower()
    filename = str(file.filename or "").strip()
    extension = os.path.splitext(filename)[1].lower()
    if content_type not in _ALLOWED_UPLOAD_MIME_TYPES:
        return jsonify({"error": "Unsupported image type"}), 400
    if extension not in _ALLOWED_UPLOAD_EXTENSIONS:
        return jsonify({"error": "Unsupported image extension"}), 400
    
    session = _get_active_session(session_id)
    if not session:
        return jsonify({"error": "Invalid session"}), 400
    if str(session.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    paper_id = session["paper_id"]
    paper = get_paper_by_id(paper_id)
    subject_label = (paper or {}).get("code") or (paper or {}).get("name") or "classroom"
    
    try:
        file_bytes = file.read()
        if not file_bytes:
            return jsonify({"error": "Uploaded image is empty"}), 400
        if len(file_bytes) > _MAX_UPLOAD_BYTES:
            return jsonify({"error": "Image too large"}), 413

        is_jpeg = file_bytes.startswith(b"\xff\xd8\xff")
        is_png = file_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        is_bmp = file_bytes.startswith(b"BM")
        is_webp = len(file_bytes) >= 12 and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP"
        if not (is_jpeg or is_png or is_bmp or is_webp):
            return jsonify({"error": "Invalid image signature"}), 400

        img = decode_image_bytes(file_bytes)
        img_raw = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        uploads_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
    except Exception as e:
        attendance_logger.error(
            "recognize_image_processing_failed",
            session_id=session_id,
            error=str(e),
        )
        return jsonify({"error": f"Failed to process image: {str(e)}"}), 400
    
    detector = get_detector()
    faces = detector.detect_faces(img)

    uploads_dir = current_app.config.get("UPLOADS_ABSOLUTE_PATH") or os.path.abspath(
        os.path.join(current_app.root_path, "..", current_app.config.get("UPLOAD_FOLDER", "uploads"))
    )
    saved_bundle = save_classroom_upload_bundle(
        subject_label=subject_label,
        image=img_raw,
        face_crops=[face["crop"] for face in faces],
        uploads_dir=uploads_dir,
    )

    attendance_logger.debug(
        "recognize_image_processed",
        session_id=session_id,
        image_shape=str(tuple(img.shape)),
        image_dtype=str(img.dtype),
        saved_folder=saved_bundle.get("folder_path"),
    )
    
    if not faces:
        return jsonify({
            "new_matches": [],
            "faces_detected": 0,
            "candidates_count": 0,
            "threshold": current_app.config.get("FACENET_THRESHOLD", 0.60),
            "best_similarity_seen": None,
            "saved_folder": saved_bundle["folder_path"],
            "original_path": saved_bundle["original_path"],
            "face_paths": saved_bundle["face_paths"],
        })
    
    candidates = _get_cached_session_candidates(session)
    threshold = current_app.config.get("FACENET_THRESHOLD", 0.60)

    new_matches = []
    best_similarity_seen = -1.0
    for face in faces:
        embedding = generate_embedding(face["crop"])

        match, face_best_similarity = find_best_match_cached(
            embedding, candidates, threshold=threshold
        )
        if face_best_similarity > best_similarity_seen:
            best_similarity_seen = face_best_similarity

        if match and match["user_id"] not in session["recognized"]:
            session["recognized"].append(match["user_id"])
            stu_user = find_user_by_id(match["user_id"])
            match["name"] = stu_user["name"] if stu_user else "Unknown"
            new_matches.append(match)
            attendance_logger.info(
                "image_recognition_match",
                session_id=session_id,
                user_id=match["user_id"],
                similarity=match.get("similarity"),
                threshold=threshold,
            )
        elif not match and face_best_similarity >= 0:
            attendance_logger.debug(
                "image_recognition_below_threshold",
                session_id=session_id,
                best_similarity=round(face_best_similarity, 4),
                threshold=threshold,
            )

    _save_recognized_students(session_id, session.get("recognized") or [])
    _touch_active_session(session_id)
    
    return jsonify({
        "new_matches": new_matches,
        "faces_detected": len(faces),
        "total_recognized": len(session["recognized"]),
        "candidates_count": len(candidates),
        "threshold": threshold,
        "best_similarity_seen": round(best_similarity_seen, 4) if best_similarity_seen >= 0 else None,
        "saved_folder": saved_bundle["folder_path"],
        "original_path": saved_bundle["original_path"],
        "face_paths": saved_bundle["face_paths"],
    })


@lecturer_bp.route("/session/recognized", methods=["GET"])
@role_required("lecturer")
def session_recognized_list(user):
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Invalid session"}), 400

    session = _get_active_session(session_id)
    if not session:
        return jsonify({"error": "Invalid session"}), 400
    if str(session.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    students = []
    for uid in session["recognized"]:
        u = find_user_by_id(uid)
        if u:
            students.append({"user_id": uid, "name": u["name"], "email": u["email"]})

    _touch_active_session(session_id)
    return jsonify({"students": students})


@lecturer_bp.route("/session/stop", methods=["POST"])
@role_required("lecturer")
def stop_session(user):
    """Stop and discard an active attendance session without committing."""
    d = request.get_json(silent=True) or {}
    session_id = d.get("session_id")

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = _get_active_session(session_id)
    if not session:
        return jsonify({"message": "Session already stopped"}), 200

    if str(session.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    _delete_active_session(session_id)

    log_action(
        "STOP_ATTENDANCE_SESSION",
        str(user["_id"]),
        details=f"Session {session_id} stopped without commit",
    )

    return jsonify({"message": "Session stopped successfully"}), 200


@lecturer_bp.route("/auth-mode", methods=["GET"])
@role_required("lecturer")
def get_auth_mode(user):
    """Return the configured authentication mode (pin or face) for lecturers."""
    return jsonify({"mode": current_app.config.get("LECTURER_AUTH_MODE", "pin")}), 200


@lecturer_bp.route("/session/commit", methods=["POST"])
@role_required("lecturer")
def commit_session(user):
    """Validate PIN or Face, save attendance, and start 30-minute rollback window."""
    d = request.form if request.mimetype == "multipart/form-data" else request.get_json(silent=True) or {}
    session_id = d.get("session_id")
    
    auth_mode = current_app.config.get("LECTURER_AUTH_MODE", "pin")

    if not session_id:
        return jsonify({"error": "Invalid session"}), 400

    session = _get_active_session(session_id)
    if not session:
        return jsonify({"error": "Invalid session"}), 400
    if str(session.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    if auth_mode == "face":
        image = request.files.get("image")
        if not image:
            return jsonify({"error": "Lecturer face photo is required for biometric authentication."}), 400
        
        try:
            # Read and decode the image
            img_bytes = image.read()
            if not img_bytes:
                return jsonify({"error": "Invalid image file"}), 400

            img = decode_image_bytes(img_bytes)
            if img is None:
                return jsonify({"error": "Invalid image file"}), 400
            
            # Detect face
            detector = get_detector()
            faces = detector.detect_faces(img)
            if not faces:
                return jsonify({"error": "No face detected in your commit photo. Please ensure your face is clearly visible."}), 400
                
            # Generate embedding
            embedding = generate_embedding(faces[0]["crop"])
            
            # Get lecturer's profile (reusing student_profiles as generic biometric store)
            profile = get_profile_by_user(str(user["_id"]))
            if not profile or not profile.get("face_embeddings"):
                return jsonify({"error": "Biometric profile not found. Please ensure you have enrolled your face samples."}), 403
                
            # Compare against stored embeddings
            threshold = current_app.config.get("FACENET_THRESHOLD", 0.6)
            match = find_best_match(embedding, [profile], threshold=threshold)
            if not match:
                log_action("LECTURER_AUTH_FAILED", str(user["_id"]), details="Biometric verification failed during session commit")
                return jsonify({"error": "Biometric verification failed. Face does not match your enrolled profile."}), 403
                
            log_action("LECTURER_AUTH_SUCCESS", str(user["_id"]), details="Biometric verification successful")
        except Exception as exc:
            current_app.logger.exception("Biometric commit verification failed")
            return jsonify({"error": f"Biometric system error: {str(exc)}"}), 500
    else:
        pin = str(d.get("pin", "")).strip()
        has_pin = bool(str(user.get("pin_hash", "")).strip()) or bool(str(user.get("pin", "")).strip())
        if not has_pin:
            return jsonify({"error": "PIN not set. Generate or set your 4-digit PIN first."}), 400

        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            max_attempts = max(1, int(current_app.config.get("PIN_MAX_ATTEMPTS", 3)))
            blocked, _ = BruteForceProtector.is_session_pin_blocked(session_id, max_attempts=max_attempts)
            if blocked:
                return jsonify({"error": "Too many invalid PIN attempts. Try again later."}), 429

        if not verify_user_pin(user, pin):
            if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
                attempts = BruteForceProtector.record_pin_failure(session_id, str(user["_id"]), request.remote_addr)
                max_attempts = max(1, int(current_app.config.get("PIN_MAX_ATTEMPTS", 3)))
                if attempts >= max_attempts:
                    return jsonify({"error": "Too many invalid PIN attempts. Try again later."}), 429
            return jsonify({"error": "Invalid PIN"}), 403

        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            BruteForceProtector.clear_pin_failures(session_id)

    paper_id = session["paper_id"]
    lecturer_id = session["lecturer_id"]
    present_user_ids = list(session["recognized"])

    _replace_session_attendance(session_id, paper_id, lecturer_id, present_user_ids, method="biometric")
    increment_total_classes(paper_id)

    committed_at = datetime.now(timezone.utc)
    rollback_until = committed_at + timedelta(minutes=ROLLBACK_MINUTES)
    current_year = str(committed_at.year)
    sessions = get_collection("attendance", "attendance_sessions")
    sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "session_id": session_id,
                "paper_id": paper_id,
                "lecturer_id": lecturer_id,
                "user_ids": present_user_ids,
                "academic_session": current_year,
                "academic_year": current_year,
                "committed_at": committed_at,
                "rollback_until": rollback_until,
                "finalized": False,
                "last_updated_at": committed_at,
            }
        },
        upsert=True,
    )

    log_action(
        "COMMIT_ATTENDANCE",
        lecturer_id,
        details=f"Paper {paper_id}, {len(present_user_ids)} students, session {session_id}",
    )

    _delete_active_session(session_id)

    return jsonify({
        "message": "Attendance committed successfully",
        "students_marked": len(present_user_ids),
        "session_id": session_id,
        "rollback_until": rollback_until.isoformat() if rollback_until else None,
    })


@lecturer_bp.route("/session/<session_id>/review", methods=["GET"])
@role_required("lecturer")
def review_committed_session(user, session_id):
    session_doc = _get_session_doc(session_id)
    if not session_doc:
        return jsonify({"error": "Committed session not found"}), 404
    if str(session_doc.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    if not _within_rollback(session_doc):
        sessions = get_collection("attendance", "attendance_sessions")
        sessions.update_one(
            {"session_id": session_id}, {"$set": {"finalized": True}}
        )
        session_doc["finalized"] = True

    return jsonify(_session_review_payload(session_doc))


@lecturer_bp.route("/session/<session_id>/adjust", methods=["PUT"])
@role_required("lecturer")
def adjust_committed_session(user, session_id):
    """Allow corrections within 30-minute rollback window, re-committed with PIN."""
    session_doc = _get_session_doc(session_id)
    if not session_doc:
        return jsonify({"error": "Committed session not found"}), 404
    if str(session_doc.get("lecturer_id")) != str(user["_id"]):
        return jsonify({"error": "Unauthorized"}), 403

    if not _within_rollback(session_doc):
        sessions = get_collection("attendance", "attendance_sessions")
        sessions.update_one(
            {"session_id": session_id}, {"$set": {"finalized": True}}
        )
        return jsonify({"error": "Rollback window expired. Session is finalized."}), 403

    d = request.get_json(silent=True) or {}
    pin = str(d.get("pin", "")).strip()
    user_ids = d.get("user_ids") or []

    if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
        max_attempts = max(1, int(current_app.config.get("PIN_MAX_ATTEMPTS", 3)))
        blocked, _ = BruteForceProtector.is_session_pin_blocked(session_id, max_attempts=max_attempts)
        if blocked:
            return jsonify({"error": "Too many invalid PIN attempts. Try again later."}), 429

    if not verify_user_pin(user, pin):
        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            attempts = BruteForceProtector.record_pin_failure(session_id, str(user["_id"]), request.remote_addr)
            max_attempts = max(1, int(current_app.config.get("PIN_MAX_ATTEMPTS", 3)))
            if attempts >= max_attempts:
                return jsonify({"error": "Too many invalid PIN attempts. Try again later."}), 429
        return jsonify({"error": "Invalid PIN"}), 403

    if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
        BruteForceProtector.clear_pin_failures(session_id)

    _replace_session_attendance(
        session_id=session_id,
        paper_id=session_doc.get("paper_id"),
        lecturer_id=str(user["_id"]),
        user_ids=user_ids,
        method="manual-adjust",
    )

    sessions = get_collection("attendance", "attendance_sessions")
    sessions.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "user_ids": user_ids,
                "last_updated_at": datetime.now(timezone.utc),
            }
        },
    )

    log_action(
        "ADJUST_ATTENDANCE_WITHIN_ROLLBACK",
        str(user["_id"]),
        details=f"Session {session_id}, students {len(user_ids)}",
    )

    refreshed = _get_session_doc(session_id)
    return jsonify({
        "message": "Attendance updated and re-committed successfully",
        "review": _session_review_payload(refreshed),
    })


@lecturer_bp.route("/progress", methods=["GET"])
@role_required("lecturer")
def lecturer_progress(user):
    """Lecturer progress summary with paper/date filtering and class-wise attendance."""
    _normalize_attendance_sessions_once()

    lecturer_id = str(user["_id"])
    paper_id = request.args.get("paper_id", "").strip()
    tz_offset_minutes = request.args.get("tz_offset_minutes", 0)
    from_local = _parse_date(request.args.get("from_date", ""), end_of_day=False)
    to_local_exclusive = _parse_date(request.args.get("to_date", ""), end_of_day=True)
    from_date = _local_midnight_to_utc(from_local, tz_offset_minutes)
    to_date = _local_midnight_to_utc(to_local_exclusive, tz_offset_minutes)

    lecturer_id_variants = [lecturer_id]
    try:
        if ObjectId.is_valid(lecturer_id):
            lecturer_id_variants.append(ObjectId(lecturer_id))
    except Exception:
        pass  # nosec B110

    query = {"lecturer_id": {"$in": lecturer_id_variants}}
    if paper_id:
        query["paper_id"] = paper_id
    if from_date or to_date:
        ts = {}
        if from_date:
            ts["$gte"] = from_date
        if to_date:
            ts["$lt"] = to_date
        query["timestamp"] = ts

    logs_col = get_collection("attendance", "attendance_logs")
    logs = list(logs_col.find(query).sort("timestamp", 1))
    assigned_papers = [_enrich_paper(p) for p in get_papers_by_lecturer(lecturer_id)]
    paper_lookup = {p["_id"]: p for p in assigned_papers}

    # Load committed sessions directly so zero-attendance classes are still visible.
    sessions_col = get_collection("attendance", "attendance_sessions")
    session_query = {"lecturer_id": {"$in": lecturer_id_variants}}
    if paper_id:
        session_query["paper_id"] = paper_id
    if from_date or to_date:
        committed_ts = {}
        if from_date:
            committed_ts["$gte"] = from_date
        if to_date:
            committed_ts["$lt"] = to_date
        session_query["committed_at"] = committed_ts

    committed_docs = list(sessions_col.find(session_query))
    session_docs = {doc.get("session_id"): doc for doc in committed_docs if doc.get("session_id")}

    # Precompute total enrolled students per paper for attended/total metrics.
    enrolled_totals_by_paper = {}
    for paper in assigned_papers:
        pid = paper.get("_id")
        enrolled_totals_by_paper[pid] = len(get_profiles_for_paper(pid))

    # Group logs by session_id for enrichment.
    logs_by_session = defaultdict(list)
    for log in logs:
        sid = log.get("session_id")
        if sid:
            logs_by_session[sid].append(log)

    sessions = []
    seen_session_ids = set()

    # Source of truth: committed sessions collection.
    for session_doc in committed_docs:
        sid = str(session_doc.get("session_id") or session_doc.get("_id") or "")
        if not sid or sid in seen_session_ids:
            continue
        seen_session_ids.add(sid)

        entries = logs_by_session.get(sid, [])
        pid = str(session_doc.get("paper_id") or "")
        if not pid:
            pid = str(entries[0].get("paper_id") or "") if entries else ""
        if not pid:
            continue

        user_ids = session_doc.get("user_ids")
        if not isinstance(user_ids, list) or len(user_ids) == 0:
            user_ids = [entry.get("user_id") for entry in entries if entry.get("user_id")]

        students = []
        seen = set()
        for stu_id in user_ids:
            stu = str(stu_id).strip() if stu_id is not None else ""
            if not stu or stu in seen:
                continue
            seen.add(stu)
            u = find_user_by_id(stu)
            students.append({
                "user_id": stu,
                "name": u.get("name", "Unknown") if u else "Unknown",
                "email": u.get("email", "") if u else "",
            })

        paper = paper_lookup.get(pid)
        first_ts = (
            session_doc.get("committed_at")
            or session_doc.get("last_updated_at")
            or min((e.get("timestamp") for e in entries if e.get("timestamp")), default=None)
        )
        rollback_until = session_doc.get("rollback_until")
        editable = _within_rollback(session_doc) and not session_doc.get("finalized", False)

        sessions.append({
            "session_id": sid,
            "paper_id": pid,
            "paper_name": (paper or {}).get("name") or ((get_paper_by_id(pid) or {}).get("name") if pid else "Unknown"),
            "paper_code": (paper or {}).get("code") or ((get_paper_by_id(pid) or {}).get("code") if pid else ""),
            "course_name": (paper or {}).get("course_name"),
            "academic_year": session_doc.get("academic_year") or (paper or {}).get("academic_year"),
            "timestamp": first_ts.isoformat() if hasattr(first_ts, "isoformat") else first_ts,
            "students_count": len(students),
            "total_students": enrolled_totals_by_paper.get(pid, 0),
            "students": students,
            "rollback_until": rollback_until.isoformat() if hasattr(rollback_until, "isoformat") else rollback_until,
            "editable": editable,
        })

    # Fallback for legacy data where logs exist but session doc is missing.
    for sid, entries in logs_by_session.items():
        if sid in seen_session_ids:
            continue
        pid = str(entries[0].get("paper_id") or "") if entries else ""
        if not pid:
            continue

        students = []
        seen = set()
        for entry in entries:
            stu = str(entry.get("user_id") or "").strip()
            if not stu or stu in seen:
                continue
            seen.add(stu)
            u = find_user_by_id(stu)
            students.append({
                "user_id": stu,
                "name": u.get("name", "Unknown") if u else "Unknown",
                "email": u.get("email", "") if u else "",
            })

        paper = paper_lookup.get(pid)
        first_ts = min((e.get("timestamp") for e in entries if e.get("timestamp")), default=None)
        sessions.append({
            "session_id": sid,
            "paper_id": pid,
            "paper_name": (paper or {}).get("name") or ((get_paper_by_id(pid) or {}).get("name") if pid else "Unknown"),
            "paper_code": (paper or {}).get("code") or ((get_paper_by_id(pid) or {}).get("code") if pid else ""),
            "course_name": (paper or {}).get("course_name"),
            "academic_year": (paper or {}).get("academic_year"),
            "timestamp": first_ts.isoformat() if hasattr(first_ts, "isoformat") else first_ts,
            "students_count": len(students),
            "total_students": enrolled_totals_by_paper.get(pid, 0),
            "students": students,
            "rollback_until": None,
            "editable": False,
        })

    sessions.sort(key=lambda x: x.get("timestamp") or "", reverse=True)

    # Per-paper aggregate.
    paper_stats = defaultdict(lambda: {"classes_taken": 0, "attendance_marks": 0})
    for s in sessions:
        pid = s.get("paper_id")
        paper_stats[pid]["classes_taken"] += 1
        paper_stats[pid]["attendance_marks"] += s.get("students_count", 0)

    per_paper = []
    for pid, stat in paper_stats.items():
        paper = paper_lookup.get(pid)
        if not paper and pid:
            raw = get_paper_by_id(pid)
            paper = _enrich_paper(raw) if raw else None
        per_paper.append({
            "paper_id": pid,
            "paper_name": (paper or {}).get("name", "Unknown"),
            "paper_code": (paper or {}).get("code", ""),
            "course_name": (paper or {}).get("course_name"),
            "academic_year": (next((s for s in sessions if s.get("paper_id") == pid), {}) or {}).get("academic_year") or (paper or {}).get("academic_year"),
            "classes_taken": stat["classes_taken"],
            "attendance_marks": stat["attendance_marks"],
            "avg_attendance_per_class": round(
                stat["attendance_marks"] / stat["classes_taken"], 2
            ) if stat["classes_taken"] else 0,
        })

    total_classes = len(sessions)
    total_attendance_marks = sum(s.get("students_count", 0) for s in sessions)
    return jsonify({
        "filters": {
            "paper_id": paper_id or None,
            "from_date": request.args.get("from_date", "") or None,
            "to_date": request.args.get("to_date", "") or None,
        },
        "summary": {
            "total_classes_taken": total_classes,
            "total_attendance_marks": total_attendance_marks,
            "average_attendance_per_class": round(total_attendance_marks / total_classes, 2) if total_classes else 0,
        },
        "papers": assigned_papers,
        "per_paper": per_paper,
        "sessions": sessions,
    })


@lecturer_bp.route('/capabilities', methods=['GET'])
@role_required('lecturer')
def get_lecturer_capabilities(user):
    """Return a JSON object describing enabled lecturer features."""
    # Example: add more features as needed
    return jsonify({
        "can_stop_session": True,
        # Add other feature flags here as needed
    })
