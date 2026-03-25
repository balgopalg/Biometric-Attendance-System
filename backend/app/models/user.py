"""User model helpers — thin wrappers around PyMongo operations."""

import secrets
from datetime import datetime

import bcrypt
from bson import ObjectId

from app.extensions import get_collection
from app.utils.helpers import sanitise_mongo_doc


def generate_temp_password(length=5):
    """Generate a readable temporary password (10 hex chars)."""
    return secrets.token_hex(length)


def create_user(name, email, password, role, department="", pin=None, must_change_password=False):
    """Insert a new user and return the inserted document."""
    doc = {
        "name": name,
        "email": email,
        "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        "role": role,
        "department": department,
        "must_change_password": must_change_password,
        "created_at": datetime.utcnow(),
    }
    if role == "lecturer" and pin:
        doc["pin"] = pin
    users = get_collection("auth", "users")
    result = users.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def find_user_by_email(email):
    users = get_collection("auth", "users")
    return users.find_one({"email": email})


def find_user_by_id(user_id):
    users = get_collection("auth", "users")
    return users.find_one({"_id": ObjectId(user_id)})


def get_users_by_role(role):
    users = get_collection("auth", "users")
    return list(users.find({"role": role}))


def update_user(user_id, update_fields):
    users = get_collection("auth", "users")
    users.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})
    return find_user_by_id(user_id)


def delete_user(user_id):
    users = get_collection("auth", "users")
    users.delete_one({"_id": ObjectId(user_id)})


def verify_password(stored_hash, password):
    return bcrypt.checkpw(password.encode(), stored_hash.encode())


def reset_user_password(user_id):
    """Generate a new temp password for a user and set must_change_password."""
    temp_pw = generate_temp_password()
    pw_hash = bcrypt.hashpw(temp_pw.encode(), bcrypt.gensalt()).decode()
    users = get_collection("auth", "users")
    users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password_hash": pw_hash, "must_change_password": True}},
    )
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
    if len(new_password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isdigit() for c in new_password):
        return False, "Password must contain at least one number"

    pw_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    users = get_collection("auth", "users")
    users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password_hash": pw_hash, "must_change_password": False}},
    )
    return True, None
