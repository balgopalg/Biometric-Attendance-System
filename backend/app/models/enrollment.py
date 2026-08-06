"""Student enrollment / profile model helpers."""

import json
import logging
import logging.handlers
import os
import shutil
from datetime import datetime, timezone
from typing import Any, List, Optional

from app.extensions import get_collection
from app.models.audit import log_action
from app.utils.helpers import _current_env, _id_variants
from bson import ObjectId
from flask import current_app, g, has_app_context, has_request_context, request

try:
    from cryptography.fernet import Fernet, InvalidToken
except Exception:  # pragma: no cover - runtime dependency guard
    Fernet = None
    InvalidToken = Exception


_EMBEDDING_PREFIX = "enc:"
_EMBEDDING_CIPHER = None
_EMBEDDING_CIPHER_KEY = None
_LOCAL_ENVS = {"development", "dev", "local", "testing", "test"}
_NOISY_PAPER_PROFILE_ACTIONS = {"paper_profile_read", "paper_profile_count"}
_DEDUPED_BIOMETRIC_ACTIONS = {
    "student_profile_read",
    "student_profile_read_by_id",
    "student_profiles_bulk_read",
}

# Fix #10: Use Python logging with RotatingFileHandler instead of
# synchronous open/write/close on every profile read.
_noisy_logger = logging.getLogger("biometric.noisy_profile")
_noisy_logger.setLevel(logging.DEBUG)
_noisy_logger.propagate = False  # Don't send to root logger
_noisy_handler_initialized = False


def _ensure_noisy_handler():
    """Lazily attach a RotatingFileHandler once the app context is available."""
    global _noisy_handler_initialized
    if _noisy_handler_initialized or not has_app_context():
        return
    try:
        backend_dir = os.path.dirname(current_app.root_path)
        logs_dir = os.path.join(backend_dir, "logs")
        os.makedirs(logs_dir, exist_ok=True)
        logs_file = os.path.join(logs_dir, "logs.txt")
        handler = logging.handlers.RotatingFileHandler(
            logs_file,
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(message)s"))
        _noisy_logger.addHandler(handler)
        _noisy_handler_initialized = True
    except Exception:
        pass  # Fail silently — logging should never break the app


def _append_noisy_profile_log(payload: dict) -> None:
    """Persist high-volume profile access telemetry via rotating log handler."""
    try:
        _ensure_noisy_handler()
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{stamp}] {json.dumps(payload, default=str, separators=(',', ':'))}"
        _noisy_logger.debug(line)
    except Exception:
        pass  # Telemetry logging should never fail the request


def _legacy_safe_name(raw_value: Any) -> str:
    text = str(raw_value or "").strip()
    cleaned = "".join(
        ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in text
    )
    return cleaned.strip("_") or "unknown"


def _log_biometric_read(
    action: str, user_id: Optional[str] = None, details: Optional[dict] = None
) -> None:
    if not has_request_context():
        return

    current_user = getattr(g, "current_user", None) or {}
    actor_user_id = str(current_user.get("_id") or "").strip() or None
    target_user_id = str(user_id or "").strip() or None

    payload = {
        "action": action,
        "user_id": target_user_id,
        "details": details or {},
        "path": request.path,
        "method": request.method,
        "remote_addr": request.remote_addr,
    }
    try:
        current_app.logger.info(
            "biometric-read action=%s user_id=%s path=%s",
            action,
            target_user_id,
            request.path,
        )

        if action in _NOISY_PAPER_PROFILE_ACTIONS:
            _append_noisy_profile_log(payload)
            return

        dedupe_key = ""
        dedupe_seconds = 0
        if action in _DEDUPED_BIOMETRIC_ACTIONS:
            dedupe_key = "|".join(
                [
                    str(action or ""),
                    str(actor_user_id or "system"),
                    str(target_user_id or ""),
                    str(request.remote_addr or ""),
                    str(request.path or ""),
                    str(request.method or ""),
                ]
            )
            dedupe_seconds = 3

        log_action(
            action=action,
            performed_by=actor_user_id or "system",
            target_user=target_user_id,
            details=payload,
            resource_type="biometric_profile",
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent", ""),
            dedupe_key=dedupe_key,
            dedupe_seconds=dedupe_seconds,
        )
    except Exception:
        current_app.logger.debug(
            "biometric read audit logging skipped", exc_info=True
        )


def _get_embedding_cipher() -> Optional[Any]:
    global _EMBEDDING_CIPHER, _EMBEDDING_CIPHER_KEY

    key = (os.getenv("FACE_EMBEDDING_ENCRYPTION_KEY") or "").strip()
    if not key:
        if _current_env() in _LOCAL_ENVS:
            return None
        raise RuntimeError(
            "FACE_EMBEDDING_ENCRYPTION_KEY is required outside local/test environments."
        )

    if Fernet is None:
        raise RuntimeError(
            "cryptography is required for biometric embedding encryption"
        )

    if _EMBEDDING_CIPHER is None or _EMBEDDING_CIPHER_KEY != key:
        _EMBEDDING_CIPHER = Fernet(key.encode())
        _EMBEDDING_CIPHER_KEY = key

    return _EMBEDDING_CIPHER


def encode_face_embedding(embedding: Any) -> Any:
    """Encrypt a face embedding for storage when encryption is configured."""
    if isinstance(embedding, str) and embedding.startswith(_EMBEDDING_PREFIX):
        return embedding

    vector = (
        embedding.tolist()
        if hasattr(embedding, "tolist")
        else list(embedding or [])
    )
    cipher = _get_embedding_cipher()
    if cipher is None:
        return vector

    payload = json.dumps(vector, separators=(",", ":")).encode("utf-8")
    return _EMBEDDING_PREFIX + cipher.encrypt(payload).decode("utf-8")


def decode_face_embedding(stored_embedding: Any) -> Optional[List[Any]]:
    """Decrypt a stored embedding or pass through legacy plaintext vectors."""
    if stored_embedding is None:
        return None

    if hasattr(stored_embedding, "tolist"):
        return stored_embedding.tolist()

    if isinstance(stored_embedding, (list, tuple)):
        return list(stored_embedding)

    if isinstance(stored_embedding, str):
        if stored_embedding.startswith(_EMBEDDING_PREFIX):
            token = stored_embedding[len(_EMBEDDING_PREFIX) :]
            cipher = _get_embedding_cipher()
            if cipher is None:
                raise RuntimeError(
                    "Encrypted biometric template encountered without an encryption key"
                )
            try:
                payload = cipher.decrypt(token.encode("utf-8"))
                decoded = json.loads(payload.decode("utf-8"))
                return list(decoded) if isinstance(decoded, list) else None
            except (InvalidToken, ValueError, TypeError, json.JSONDecodeError):
                return None

        try:
            decoded = json.loads(stored_embedding)
            return list(decoded) if isinstance(decoded, list) else None
        except (ValueError, TypeError, json.JSONDecodeError):
            return None

    return None


def create_student_profile(
    user_id: str,
    reg_number: str,
    course_id: str,
    academic_year: Optional[Any] = None,
    department_id: Optional[Any] = None,
) -> dict:
    profiles = get_collection("academic", "student_profiles")

    # Auto-resolve department_id from course if not provided
    dept_oid = None
    if department_id is not None:
        try:
            dept_oid = (
                ObjectId(str(department_id))
                if not isinstance(department_id, ObjectId)
                else department_id
            )
        except Exception:
            dept_oid = None
    elif course_id:
        try:
            courses = get_collection("academic", "courses")
            course_doc = courses.find_one(
                {"_id": ObjectId(course_id)}, {"department_id": 1}
            )
            if course_doc:
                dept_oid = course_doc.get("department_id")
        except Exception:
            pass

    doc = {
        "user_id": user_id,
        "reg_number": reg_number,
        "course_id": course_id,
        "academic_year": academic_year,
        "academic_session": academic_year,
        "year": academic_year,
        "current_semester": 1,
        "department_id": dept_oid,
        "face_embeddings": [],
        "photo_urls": [],
        "enrolled_papers": [],
        "created_at": datetime.now(timezone.utc),
    }
    result = profiles.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_profile_by_user(user_id: str) -> Optional[dict]:
    profiles = get_collection("academic", "student_profiles")
    profile = profiles.find_one({"user_id": user_id})
    _log_biometric_read(
        "student_profile_read",
        user_id=str(user_id),
        details={
            "has_face_embeddings": bool((profile or {}).get("face_embeddings"))
        },
    )
    return profile


def get_profile_by_id(profile_id: str) -> Optional[dict]:
    try:
        oid = ObjectId(profile_id)
    except Exception:
        return None
    profiles = get_collection("academic", "student_profiles")
    profile = profiles.find_one({"_id": oid})
    _log_biometric_read(
        "student_profile_read_by_id",
        user_id=str((profile or {}).get("user_id") or ""),
        details={"profile_id": str(profile_id)},
    )
    return profile


def get_all_profiles(fields: Optional[List[str]] = None) -> List[dict]:
    profiles = get_collection("academic", "student_profiles")
    projection = None
    if fields:
        projection = {field: 1 for field in fields}
        projection["_id"] = 1
    cursor = profiles.find({}, projection) if projection else profiles.find()
    items = list(cursor)
    if not fields or "face_embeddings" in fields:
        _log_biometric_read(
            "student_profiles_bulk_read",
            details={"count": len(items), "fields": list(fields or [])},
        )
    return items


def add_face_embedding(
    user_id: str, embedding: Any, photo_url: Optional[str] = None
) -> None:
    """Append a new face embedding vector (list of floats) to the student profile."""
    push_fields = {"face_embeddings": encode_face_embedding(embedding)}
    if photo_url:
        push_fields["photo_urls"] = photo_url

    update = {"$push": push_fields}
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one({"user_id": user_id}, update)


def set_face_embeddings(user_id: str, embeddings: List[Any]) -> None:
    """Replace the full face embedding set for a student profile."""
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "face_embeddings": [
                    encode_face_embedding(embedding)
                    for embedding in (embeddings or [])
                ]
            }
        },
    )


def enroll_in_papers(user_id: str, paper_ids: List[str]) -> int:
    """Add papers to a students enrolled papers list."""
    normalized_user_id = str(user_id or "").strip()
    if not normalized_user_id:
        return 0

    user_id_filters = _id_variants(normalized_user_id)

    normalized_paper_ids = [
        str(pid).strip() for pid in (paper_ids or []) if str(pid).strip()
    ]
    if not normalized_paper_ids:
        return 0

    profiles = get_collection("academic", "student_profiles")
    result = profiles.update_one(
        {"user_id": {"$in": user_id_filters}},
        {"$addToSet": {"enrolled_papers": {"$each": normalized_paper_ids}}},
    )
    return int(result.modified_count or 0)


def get_profiles_for_paper(paper_id: str) -> List[dict]:
    """Return all student profiles enrolled in a given paper."""
    profiles = get_collection("academic", "student_profiles")
    filters = _id_variants(paper_id)
    items = list(profiles.find({"enrolled_papers": {"$in": filters}}))
    _log_biometric_read(
        "paper_profile_read",
        details={"paper_id": str(paper_id), "count": len(items)},
    )
    return items


def count_profiles_for_paper(paper_id: str) -> int:
    """Count enrolled students for a paper, handling string/ObjectId ids."""
    profiles = get_collection("academic", "student_profiles")
    filters = _id_variants(paper_id)
    count = int(
        profiles.count_documents({"enrolled_papers": {"$in": filters}})
    )
    _log_biometric_read(
        "paper_profile_count",
        details={"paper_id": str(paper_id), "count": count},
    )
    return count


def update_profile(user_id: str, fields: dict) -> Optional[dict]:
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one({"user_id": user_id}, {"$set": fields})
    return get_profile_by_user(user_id)


def _remove_path(path: str) -> None:
    if not path:
        return
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
    elif os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass


def _remove_prefix_matches(root_dir: str, prefixes: List[str]) -> None:
    if not os.path.isdir(root_dir):
        return

    for name in os.listdir(root_dir):
        if any(
            name == prefix or name.startswith(f"{prefix}_")
            for prefix in prefixes
            if prefix
        ):
            _remove_path(os.path.join(root_dir, name))


def delete_profile(user_id: str, user: Optional[dict] = None) -> None:
    profiles = get_collection("academic", "student_profiles")
    profile = profiles.find_one({"user_id": user_id})
    safe_name = _legacy_safe_name((user or {}).get("name") or "")
    if not safe_name and profile:
        safe_name = _legacy_safe_name(profile.get("reg_number") or "")

    user_id_text = str(user_id).strip()
    dataset_root = current_app.config.get(
        "DATASET_ABSOLUTE_PATH"
    ) or os.path.abspath(os.path.join(current_app.root_path, "..", "dataset"))
    uploads_root = current_app.config.get(
        "UPLOADS_ABSOLUTE_PATH"
    ) or os.path.abspath(os.path.join(current_app.root_path, "..", "uploads"))

    _remove_path(os.path.join(dataset_root, user_id_text))
    if safe_name:
        _remove_path(os.path.join(dataset_root, safe_name))
        _remove_prefix_matches(uploads_root, [safe_name, user_id_text])

    profiles.delete_one({"user_id": user_id})

    # Cascade cleanup: remove orphaned records from related collections
    # to prevent phantom entries in attendance reports and eligibility views.
    _cascade_cleanup_user_data(user_id_text)


def _cascade_cleanup_user_data(user_id: str) -> None:
    """Remove attendance, eligibility, and leave data tied to a deleted student."""
    from app.utils.helpers import _id_variants

    uid_variants = _id_variants(user_id)
    if not uid_variants:
        return

    try:
        # Attendance logs
        att_logs = get_collection("attendance", "attendance_logs")
        att_logs.delete_many({"user_id": {"$in": uid_variants}})

        # Exam eligibility overrides
        overrides = get_collection("attendance", "exam_eligibility_overrides")
        overrides.delete_many({"user_id": {"$in": uid_variants}})

        # Leave requests
        leaves = get_collection("attendance", "leave_requests")
        leaves.delete_many({"user_id": {"$in": uid_variants}})
    except Exception:
        # Cascade failures should not block the primary profile deletion.
        current_app.logger.exception(
            "Cascade cleanup failed for user_id=%s", user_id
        )
