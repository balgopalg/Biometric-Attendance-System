"""User model helpers — thin wrappers around PyMongo operations."""

import secrets
import hmac
from datetime import datetime, timezone
from typing import Any, Optional, Dict, List, Tuple

import bcrypt
from bson import ObjectId
from bson.errors import InvalidId

from app.extensions import get_collection
from app.repositories import find_many_by_ids
from app.security.brute_force_protection import BruteForceProtector
from app.utils.validation import validate_password_strength
import re

# Valid role values for the 4-tier RBAC model
VALID_ROLES = {"super_admin", "department_admin", "lecturer", "student"}
# Legacy alias kept to avoid breaking old code paths
LEGACY_ROLE_MAP = {"admin": "super_admin"}


def normalize_email(email: Any) -> str:
    return str(email or "").strip().lower()


def generate_temp_password(length: int = 8) -> str:
    """Generate a temporary password that satisfies the password policy."""
    upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    lower = "abcdefghijkmnopqrstuvwxyz"
    digits = "23456789"
    symbols = "!@#$%^&*"
    all_chars = f"{upper}{lower}{digits}{symbols}"

    def pick(chars: str) -> str:
        return secrets.choice(chars)

    password_chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
    while len(password_chars) < max(8, int(length or 8)):
        password_chars.append(pick(all_chars))

    secrets.SystemRandom().shuffle(password_chars)
    return "".join(password_chars)


def hash_pin(pin: Any) -> str:
    """Hash a lecturer PIN using bcrypt."""
    return bcrypt.hashpw(str(pin).encode(), bcrypt.gensalt()).decode()


def verify_user_pin(user: dict, provided_pin: Any) -> bool:
    """Verify PIN against hashed value, with one-time migration from legacy plaintext PIN."""
    provided = str(provided_pin or "").strip()
    if not provided:
        return False

    stored_hash = str(user.get("pin_hash") or "").strip()
    if stored_hash:
        try:
            return bcrypt.checkpw(provided.encode(), stored_hash.encode())
        except Exception:
            return False

    legacy_pin = str(user.get("pin") or "").strip()
    return bool(legacy_pin) and hmac.compare_digest(provided, legacy_pin)


def set_user_pin(user_id: str, pin: Any) -> Optional[dict]:
    """Set a lecturer PIN using hashed storage and clear legacy plaintext field."""
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None

    users = get_collection("auth", "users")
    users.update_one(
        {"_id": oid},
        {
            "$set": {
                "pin_hash": hash_pin(pin),
                "pin_last_set": datetime.now(timezone.utc),
                "pin": "",
            }
        },
    )
    return find_user_by_id(user_id)


def create_user(
    name: str,
    email: str,
    password: str,
    role: str,
    department: str = "",
    pin: Optional[Any] = None,
    must_change_password: bool = False,
    department_id: Optional[Any] = None,
) -> dict:
    """Insert a new user and return the inserted document."""
    # Normalise legacy role aliases
    effective_role = LEGACY_ROLE_MAP.get(role, role)
    normalized_email = normalize_email(email)

    # Coerce department_id to ObjectId when provided
    dept_oid = None
    if department_id is not None and str(department_id).strip():
        try:
            dept_oid = ObjectId(str(department_id))
        except (InvalidId, Exception):
            dept_oid = None

    doc = {
        "name": name,
        "email": normalized_email,
        "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        "role": effective_role,
        "department": department,
        "department_id": dept_oid,
        "must_change_password": must_change_password,
        "session_version": 1,
        "created_at": datetime.now(timezone.utc),
    }
    if effective_role == "lecturer" and pin:
        doc["pin_hash"] = hash_pin(pin)
        doc["pin_last_set"] = datetime.now(timezone.utc)
        doc["pin"] = ""

    users = get_collection("auth", "users")
    result = users.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def find_user_by_email(email: str) -> Optional[dict]:
    normalized_email = normalize_email(email)
    if not normalized_email:
        return None

    users = get_collection("auth", "users")
    # Exact match on the normalized (lowercased) email.
    # All emails are lowercased at write time (create_user), so regex fallback
    # is unnecessary and was a security/performance concern (bypassed index).
    return users.find_one({"email": normalized_email})


def find_user_by_id(user_id: str) -> Optional[dict]:
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None
        
    users = get_collection("auth", "users")
    return users.find_one({"_id": oid})


def get_users_by_role(role: str, department_id: Optional[Any] = None) -> List[dict]:
    """Return users by role, optionally filtered by department_id."""
    users = get_collection("auth", "users")
    query: Dict[str, Any] = {"role": role}
    if department_id is not None:
        try:
            query["department_id"] = ObjectId(str(department_id))
        except (InvalidId, Exception):
            pass
    return list(users.find(query))


def get_users_by_ids(user_ids: List[str]) -> Dict[str, dict]:
    """Return users keyed by stringified _id for a list of ids."""
    return find_many_by_ids("auth", "users", user_ids)


def update_user(user_id: str, update_fields: dict) -> Optional[dict]:
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None
        
    users = get_collection("auth", "users")
    users.update_one({"_id": oid}, {"$set": update_fields})
    return find_user_by_id(user_id)


def delete_user(user_id: str) -> bool:
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return False
        
    users = get_collection("auth", "users")
    result = users.delete_one({"_id": oid})
    return result.deleted_count > 0


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except Exception:
        return False


def reset_user_password(user_id: str, temp_password: Optional[str] = None) -> Optional[str]:
    """Set a temporary password for a user and require password change on next login."""
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        return None

    temp_pw = temp_password or generate_temp_password()
    pw_hash = bcrypt.hashpw(temp_pw.encode(), bcrypt.gensalt()).decode()
    
    users = get_collection("auth", "users")
    user = users.find_one({"_id": oid}, {"email": 1})
    
    if not user:
        return None
        
    users.update_one(
        {"_id": oid},
        {
            "$set": {"password_hash": pw_hash, "must_change_password": True},  # nosec B105
            "$inc": {"session_version": 1},
        },
    )

    if user.get("email"):
        BruteForceProtector.clear_failed_attempts(user["email"])

    return temp_pw


def change_user_password(
    user_id: str, old_password: str, new_password: str
) -> Tuple[bool, Optional[str]]:
    """Verify old password, set new one, and clear must_change_password flag.
    Returns (success: bool, error: str | None).
    """
    user = find_user_by_id(user_id)
    if not user:
        return False, "User not found"
        
    if not verify_password(user["password_hash"], old_password):
        return False, "Current password is incorrect"
        
    is_strong, msg = validate_password_strength(new_password)
    if not is_strong:
        return False, msg

    pw_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    users = get_collection("auth", "users")
    users.update_one(
        {"_id": ObjectId(user_id)},
        {
            "$set": {"password_hash": pw_hash, "must_change_password": False},  # nosec B105
            "$inc": {"session_version": 1},
        },
    )
    return True, None