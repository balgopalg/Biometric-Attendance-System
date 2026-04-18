"""Migration: Convert flat 3-role RBAC to 4-tier hierarchical RBAC with departments.

This migration:
1. Scans unique 'department' text values from users + courses.
2. Creates a 'departments' document for each unique name.
3. Converts existing 'admin' users to 'super_admin'.
4. Sets 'department_id' (ObjectId) on users, courses, papers, student_profiles,
   attendance_logs, attendance_sessions, and audit_logs.
5. Keeps old 'department' text field for backward compatibility.

Idempotent: safe to re-run — checks for existing department_id before overwriting.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from app.extensions import get_collection
from app.models.department import find_or_create_department_by_name


def upgrade() -> dict:
    """Run the RBAC / department migration.  Returns a summary dict."""
    stats = {
        "departments_created": 0,
        "users_migrated": 0,
        "courses_migrated": 0,
        "papers_migrated": 0,
        "profiles_migrated": 0,
        "attendance_logs_migrated": 0,
        "attendance_sessions_migrated": 0,
        "audit_logs_migrated": 0,
        "admins_promoted": 0,
    }

    users_col = get_collection("auth", "users")
    courses_col = get_collection("academic", "courses")
    papers_col = get_collection("academic", "papers")
    profiles_col = get_collection("academic", "student_profiles")
    att_logs_col = get_collection("attendance", "attendance_logs")
    att_sess_col = get_collection("attendance", "attendance_sessions")
    audit_col = get_collection("audit", "audit_logs")

    # ------------------------------------------------------------------
    # Step 1: Collect unique department names and create department docs
    # ------------------------------------------------------------------
    dept_names: set = set()
    for user in users_col.find({}, {"department": 1}):
        name = str(user.get("department") or "").strip()
        if name:
            dept_names.add(name)

    for course in courses_col.find({}, {"department": 1}):
        name = str(course.get("department") or "").strip()
        if name:
            dept_names.add(name)

    # Ensure at least a default department exists
    if not dept_names:
        dept_names.add("General")

    # Map: lowercase name → department doc
    dept_map: dict = {}
    for name in dept_names:
        dept_doc = find_or_create_department_by_name(name)
        dept_map[name.lower()] = dept_doc
        stats["departments_created"] += 1

    def _resolve_dept_id(text_name):
        """Resolve a free-text department name to an ObjectId."""
        clean = str(text_name or "").strip().lower()
        if not clean:
            return None
        doc = dept_map.get(clean)
        if doc:
            return doc["_id"]
        # Fallback — create on the fly
        new_doc = find_or_create_department_by_name(text_name)
        dept_map[clean] = new_doc
        return new_doc["_id"]

    # ------------------------------------------------------------------
    # Step 2: Promote admin users to super_admin
    # ------------------------------------------------------------------
    admin_users = list(users_col.find({"role": "admin"}))
    for user in admin_users:
        users_col.update_one(
            {"_id": user["_id"]},
            {"$set": {"role": "super_admin", "department_id": None}},
        )
        stats["admins_promoted"] += 1

    # ------------------------------------------------------------------
    # Step 3: Set department_id on all users (except super_admin)
    # ------------------------------------------------------------------
    for user in users_col.find({"department_id": {"$exists": False}}):
        role = user.get("role", "")
        if role == "super_admin":
            users_col.update_one(
                {"_id": user["_id"]},
                {"$set": {"department_id": None}},
            )
            stats["users_migrated"] += 1
            continue

        dept_id = _resolve_dept_id(user.get("department"))
        if dept_id:
            users_col.update_one(
                {"_id": user["_id"]},
                {"$set": {"department_id": dept_id}},
            )
            stats["users_migrated"] += 1

    # ------------------------------------------------------------------
    # Step 4: Set department_id on courses
    # ------------------------------------------------------------------
    for course in courses_col.find({"department_id": {"$exists": False}}):
        dept_id = _resolve_dept_id(course.get("department"))
        if dept_id:
            courses_col.update_one(
                {"_id": course["_id"]},
                {"$set": {"department_id": dept_id}},
            )
            stats["courses_migrated"] += 1

    # ------------------------------------------------------------------
    # Step 5: Set department_id on papers (inherit from course)
    # ------------------------------------------------------------------
    # Build course_id → department_id map
    course_dept_map: dict = {}
    for course in courses_col.find({}, {"_id": 1, "department_id": 1}):
        cid = course.get("_id")
        did = course.get("department_id")
        if cid and did:
            course_dept_map[str(cid)] = did

    for paper in papers_col.find({"department_id": {"$exists": False}}):
        course_id = str(paper.get("course_id") or "")
        dept_id = course_dept_map.get(course_id)
        if dept_id:
            papers_col.update_one(
                {"_id": paper["_id"]},
                {"$set": {"department_id": dept_id}},
            )
            stats["papers_migrated"] += 1

    # ------------------------------------------------------------------
    # Step 6: Set department_id on student_profiles (inherit from course)
    # ------------------------------------------------------------------
    for profile in profiles_col.find({"department_id": {"$exists": False}}):
        course_id = str(profile.get("course_id") or "")
        dept_id = course_dept_map.get(course_id)
        if dept_id:
            profiles_col.update_one(
                {"_id": profile["_id"]},
                {"$set": {"department_id": dept_id}},
            )
            stats["profiles_migrated"] += 1

    # ------------------------------------------------------------------
    # Step 7: Set department_id on attendance_logs (inherit from paper)
    # ------------------------------------------------------------------
    paper_dept_map: dict = {}
    for paper in papers_col.find({}, {"_id": 1, "department_id": 1}):
        pid = paper.get("_id")
        did = paper.get("department_id")
        if pid and did:
            paper_dept_map[str(pid)] = did

    for log in att_logs_col.find({"department_id": {"$exists": False}}):
        paper_id = str(log.get("paper_id") or "")
        dept_id = paper_dept_map.get(paper_id)
        if dept_id:
            att_logs_col.update_one(
                {"_id": log["_id"]},
                {"$set": {"department_id": dept_id}},
            )
            stats["attendance_logs_migrated"] += 1

    # ------------------------------------------------------------------
    # Step 8: Set department_id on attendance_sessions
    # ------------------------------------------------------------------
    for session in att_sess_col.find({"department_id": {"$exists": False}}):
        paper_id = str(session.get("paper_id") or "")
        dept_id = paper_dept_map.get(paper_id)
        if dept_id:
            att_sess_col.update_one(
                {"_id": session["_id"]},
                {"$set": {"department_id": dept_id}},
            )
            stats["attendance_sessions_migrated"] += 1

    # ------------------------------------------------------------------
    # Step 9: Set department_id on audit_logs (best-effort from actor)
    # ------------------------------------------------------------------
    # Build user_id → department_id map
    user_dept_map: dict = {}
    for user in users_col.find({}, {"_id": 1, "department_id": 1}):
        uid = user.get("_id")
        did = user.get("department_id")
        if uid and did:
            user_dept_map[str(uid)] = did

    for audit in audit_col.find({"department_id": {"$exists": False}}):
        actor_id = str(audit.get("performed_by") or "")
        dept_id = user_dept_map.get(actor_id)
        audit_col.update_one(
            {"_id": audit["_id"]},
            {"$set": {"department_id": dept_id}},  # None is acceptable for super_admin actions
        )
        stats["audit_logs_migrated"] += 1

    return stats
