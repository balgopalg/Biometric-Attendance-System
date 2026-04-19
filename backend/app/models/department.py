"""Department model helpers — thin wrappers around PyMongo operations."""

from datetime import datetime, timezone
from typing import Any, Optional, List

from bson import ObjectId
from bson.errors import InvalidId

from app.extensions import get_collection


def create_department(name: str, code: str) -> dict:
    """Insert a new department and return the inserted document."""
    departments = get_collection("academic", "departments")
    doc = {
        "name": name.strip(),
        "code": code.strip().upper(),
        "status": "active",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = departments.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def get_all_departments(include_inactive: bool = False) -> List[dict]:
    """Return all departments (optionally including inactive ones)."""
    departments = get_collection("academic", "departments")
    query: dict = {}
    if not include_inactive:
        query["status"] = "active"
    return list(departments.find(query))


def get_department_by_id(department_id: str) -> Optional[dict]:
    """Return a single department by its _id."""
    try:
        oid = ObjectId(department_id)
    except (InvalidId, Exception):
        return None
    departments = get_collection("academic", "departments")
    return departments.find_one({"_id": oid})


def get_department_by_code(code: str) -> Optional[dict]:
    """Return a single department by its unique code."""
    departments = get_collection("academic", "departments")
    return departments.find_one({"code": code.strip().upper()})

    def get_department_by_name(name: str) -> Optional[dict]:
        """Return a single department by its name."""
        departments = get_collection("academic", "departments")
        return departments.find_one({"name": name.strip()})


def update_department(department_id: str, fields: dict) -> Optional[dict]:
    """Update a department and return the updated document."""
    try:
        oid = ObjectId(department_id)
    except (InvalidId, Exception):
        return None
    departments = get_collection("academic", "departments")
    fields["updated_at"] = datetime.now(timezone.utc)
    departments.update_one({"_id": oid}, {"$set": fields})
    return get_department_by_id(department_id)


def delete_department(department_id: str) -> bool:
    """Soft-delete a department (set status to inactive)."""
    try:
        oid = ObjectId(department_id)
    except (InvalidId, Exception):
        return False
    departments = get_collection("academic", "departments")
    result = departments.update_one(
        {"_id": oid},
        {"$set": {"status": "inactive", "updated_at": datetime.now(timezone.utc)}},
    )
    return result.modified_count > 0


def hard_delete_department(department_id: str) -> bool:
    """Permanently delete a department document."""
    try:
        oid = ObjectId(department_id)
    except (InvalidId, Exception):
        return False
    departments = get_collection("academic", "departments")
    result = departments.delete_one({"_id": oid})
    return result.deleted_count > 0


def find_or_create_department_by_name(name: str) -> dict:
    """Lookup a department by name; create one if it doesn't exist.

    Used by the data migration script to convert free-text department
    strings into proper ObjectId references.
    """
    if not name or not name.strip():
        name = "General"

    clean_name = name.strip()
    # Build a simple code from the name (first 6 chars, uppercase, no spaces)
    code = "".join(ch for ch in clean_name.upper() if ch.isalnum())[:6] or "GEN"

    departments = get_collection("academic", "departments")
    existing = departments.find_one({"name": clean_name})
    if existing:
        return existing

    # Also check by code to avoid duplicates
    existing_by_code = departments.find_one({"code": code})
    if existing_by_code:
        return existing_by_code

    return create_department(clean_name, code)
