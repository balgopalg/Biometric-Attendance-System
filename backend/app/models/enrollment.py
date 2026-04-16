"""Student enrollment / profile model helpers."""


import json
import os
import shutil
from datetime import datetime, timezone
from typing import Any, Optional, List, Dict
from bson import ObjectId
from flask import current_app, has_app_context, has_request_context, request, g
from app.extensions import get_collection
from app.models.audit import log_action

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


def _append_noisy_profile_log(payload: dict) -> None:
    """Persist high-volume profile access telemetry to backend/logs/logs.txt."""
    try:
        backend_dir = os.path.dirname(current_app.root_path)
        logs_dir = os.path.join(backend_dir, "logs")
        os.makedirs(logs_dir, exist_ok=True)
        logs_file = os.path.join(logs_dir, "logs.txt")

        stamp = datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{stamp}] {json.dumps(payload, default=str, separators=(',', ':'))}"
        with open(logs_file, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except Exception:
        current_app.logger.debug("noisy profile file logging skipped", exc_info=True)


def _current_env() -> str:
    if has_app_context():
        try:
            env = current_app.config.get("ENV")
            if env:
                return str(env).strip().lower()
        except Exception:
            pass  # nosec B110

    return (os.getenv("FLASK_ENV") or os.getenv("ENV") or "").strip().lower()


def _legacy_safe_name(raw_value: Any) -> str:
    text = str(raw_value or "").strip()
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in text)
    return cleaned.strip("_") or "unknown"


def _log_biometric_read(action: str, user_id: Optional[str] = None, details: Optional[dict] = None) -> None:
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
        current_app.logger.debug("biometric read audit logging skipped", exc_info=True)


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
        raise RuntimeError("cryptography is required for biometric embedding encryption")

    if _EMBEDDING_CIPHER is None or _EMBEDDING_CIPHER_KEY != key:
        _EMBEDDING_CIPHER = Fernet(key.encode())
        _EMBEDDING_CIPHER_KEY = key

    return _EMBEDDING_CIPHER


def encode_face_embedding(embedding: Any) -> Any:
    """Encrypt a face embedding for storage when encryption is configured."""
    if isinstance(embedding, str) and embedding.startswith(_EMBEDDING_PREFIX):
        return embedding

    vector = embedding.tolist() if hasattr(embedding, "tolist") else list(embedding or [])
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
            token = stored_embedding[len(_EMBEDDING_PREFIX):]
            cipher = _get_embedding_cipher()
            if cipher is None:
                raise RuntimeError("Encrypted biometric template encountered without an encryption key")
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
    roll_number: str,
    course_id: str,
    academic_year: Optional[Any] = None
) -> dict:
    profiles = get_collection("academic", "student_profiles")
    doc = {
        "user_id": user_id,
        "roll_number": roll_number,
        "reg_number": roll_number,
        "course_id": course_id,
        "academic_year": academic_year,
        "academic_session": academic_year,
        "year": academic_year,
        "current_semester": 1,
        "face_embeddings": [],
        "photo_urls": [],
        "enrolled_papers": [],
        "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }
    result = profiles.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_profile_by_user(user_id: str) -> Optional[dict]:
    profiles = get_collection("academic", "student_profiles")
    profile = profiles.find_one({"user_id": user_id})
    _log_biometric_read("student_profile_read", user_id=str(user_id), details={"has_face_embeddings": bool((profile or {}).get("face_embeddings"))})
    return profile


def get_profile_by_id(profile_id: str) -> Optional[dict]:
    profiles = get_collection("academic", "student_profiles")
    profile = profiles.find_one({"_id": ObjectId(profile_id)})
    _log_biometric_read("student_profile_read_by_id", user_id=str((profile or {}).get("user_id") or ""), details={"profile_id": str(profile_id)})
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
        _log_biometric_read("student_profiles_bulk_read", details={"count": len(items), "fields": list(fields or [])})
    return items


def add_face_embedding(user_id: str, embedding: Any, photo_url: Optional[str] = None) -> None:
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
        {"$set": {"face_embeddings": [encode_face_embedding(embedding) for embedding in (embeddings or [])]}},
    )


def enroll_in_papers(user_id: str, paper_ids: List[str]) -> None:
    """Add papers to a students enrolled papers list."""
    profiles = get_collection("academic", "student_profiles")
    profiles.update_one(
        {"user_id": user_id},
        {"$addToSet": {"enrolled_papers": {"$each": paper_ids}}},
    )


def get_profiles_for_paper(paper_id: str) -> List[dict]:
    """Return all student profiles enrolled in a given paper."""
    profiles = get_collection("academic", "student_profiles")
    filters = [paper_id, str(paper_id)]
    try:
        filters.append(ObjectId(str(paper_id)))
    except Exception:
        pass  # nosec B110
    items = list(profiles.find({"enrolled_papers": {"$in": filters}}))
    _log_biometric_read("paper_profile_read", details={"paper_id": str(paper_id), "count": len(items)})
    return items


def count_profiles_for_paper(paper_id: str) -> int:
    """Count enrolled students for a paper, handling string/ObjectId ids."""
    profiles = get_collection("academic", "student_profiles")
    filters = [paper_id, str(paper_id)]
    try:
        filters.append(ObjectId(str(paper_id)))
    except Exception:
        pass  # nosec B110
    count = int(profiles.count_documents({"enrolled_papers": {"$in": filters}}))
    _log_biometric_read("paper_profile_count", details={"paper_id": str(paper_id), "count": count})
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
        if any(name == prefix or name.startswith(f"{prefix}_") for prefix in prefixes if prefix):
            _remove_path(os.path.join(root_dir, name))


def delete_profile(user_id: str, user: Optional[dict] = None) -> None:
    profiles = get_collection("academic", "student_profiles")
    profile = profiles.find_one({"user_id": user_id})
    safe_name = _legacy_safe_name((user or {}).get("name") or "")
    if not safe_name and profile:
        safe_name = _legacy_safe_name(profile.get("roll_number") or profile.get("reg_number") or "")

    user_id_text = str(user_id).strip()
    dataset_root = "dataset"
    uploads_root = "uploads"

    _remove_path(os.path.join(dataset_root, user_id_text))
    if safe_name:
        _remove_path(os.path.join(dataset_root, safe_name))
        _remove_prefix_matches(uploads_root, [safe_name, user_id_text])

    profiles.delete_one({"user_id": user_id})
