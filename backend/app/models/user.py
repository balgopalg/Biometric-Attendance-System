"""User model helpers — thin wrappers around PyMongo operations."""

import secrets
import hmac
from datetime import datetime

import bcrypt
from bson import ObjectId

from app.extensions import get_collection
from app.repositories import find_many_by_ids
from app.security.brute_force_protection import BruteForceProtector
from app.utils.helpers import sanitise_mongo_doc
from app.utils.validation import validate_password_strength


def normalize_email(email):
    return str(email or "").strip().lower()


def generate_temp_password(length=12):
    """Generate a temporary password that satisfies the password policy."""
    upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    lower = "abcdefghijkmnopqrstuvwxyz"
    digits = "23456789"
    symbols = "!@#$%^&*"
    all_chars = f"{upper}{lower}{digits}{symbols}"

    def pick(chars):
        return secrets.choice(chars)

    password_chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
    while len(password_chars) < max(12, int(length or 12)):
        password_chars.append(pick(all_chars))

    secrets.SystemRandom().shuffle(password_chars)
    return "".join(password_chars)


def hash_pin(pin):
    """Hash a lecturer PIN using bcrypt."""
    return bcrypt.hashpw(str(pin).encode(), bcrypt.gensalt()).decode()


def verify_user_pin(user, provided_pin):
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


def set_user_pin(user_id, pin):
    """Set a lecturer PIN using hashed storage and clear legacy plaintext field."""
    users = get_collection("auth", "users")
    users.update_one(
        {"_id": ObjectId(user_id)},
        {
            "$set": {
                "pin_hash": hash_pin(pin),
                "pin_last_set": datetime.utcnow(),
                "pin": "",
            }
        },
    )
    return find_user_by_id(user_id)


def create_user(name, email, password, role, department="", pin=None, must_change_password=False):
    """Insert a new user and return the inserted document."""
    normalized_email = normalize_email(email)
    doc = {
        "name": name,
        "email": normalized_email,
        "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        "role": role,
        "department": department,
        "must_change_password": must_change_password,
        "created_at": datetime.utcnow(),
    }
    if role == "lecturer" and pin:
        doc["pin_hash"] = hash_pin(pin)
        doc["pin_last_set"] = datetime.utcnow()
        doc["pin"] = ""
    users = get_collection("auth", "users")
    result = users.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def find_user_by_email(email):
    users = get_collection("auth", "users")
    normalized_email = normalize_email(email)
    user = users.find_one({"email": normalized_email})
    if user:
        return user

    if normalized_email:
        return users.find_one({"email": {"$regex": f"^{normalized_email}$", "$options": "i"}})
    return None


def find_user_by_id(user_id):
    users = get_collection("auth", "users")
    return users.find_one({"_id": ObjectId(user_id)})


def get_users_by_role(role):
    users = get_collection("auth", "users")
    return list(users.find({"role": role}))


def get_users_by_ids(user_ids):
    """Return users keyed by stringified _id for a list of ids."""
    return find_many_by_ids("auth", "users", user_ids)


def update_user(user_id, update_fields):
    users = get_collection("auth", "users")
    users.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})
    return find_user_by_id(user_id)


def delete_user(user_id):
    users = get_collection("auth", "users")
    users.delete_one({"_id": ObjectId(user_id)})


def verify_password(stored_hash, password):
    return bcrypt.checkpw(password.encode(), stored_hash.encode())


def reset_user_password(user_id, temp_password=None):
    """Set a temporary password for a user and require password change on next login."""
    temp_pw = temp_password or generate_temp_password()
    pw_hash = bcrypt.hashpw(temp_pw.encode(), bcrypt.gensalt()).decode()
    users = get_collection("auth", "users")
    user = users.find_one({"_id": ObjectId(user_id)}, {"email": 1})
    users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password_hash": pw_hash, "must_change_password": True}},
    )

    if user and user.get("email"):
        BruteForceProtector.clear_failed_attempts(user["email"])

    return temp_pw


def change_user_password(user_id, old_password, new_password):
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
        {"$set": {"password_hash": pw_hash, "must_change_password": False}},
    )
    return True, None
