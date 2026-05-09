import re

from . import admin_bp
from ._helpers import *

@admin_bp.route("/departments", methods=["GET"])
@super_admin_required
def list_departments(user):
    """Return all departments."""
    include_inactive = _as_text(request.args.get("include_inactive", "")).lower() in ("1", "true", "yes")
    depts = get_all_departments(include_inactive=include_inactive)

    # Enrich with user counts. Support legacy records where users may only have a department name.
    users_col = get_collection("auth", "users")
    for dept in depts:
        dept["_id"] = str(dept["_id"])
        dept_oid = ObjectId(dept["_id"]) if dept["_id"] else None
        dept_name = _as_text(dept.get("name", "")).strip()

        def count_role(role):
            query = {"role": role}
            if dept_oid:
                query["$or"] = [{"department_id": dept_oid}]
                if dept_name:
                    query["$or"].append({
                        "department": {
                            "$regex": f"^{re.escape(dept_name)}$",
                            "$options": "i",
                        },
                    })
            elif dept_name:
                query["department"] = {
                    "$regex": f"^{re.escape(dept_name)}$",
                    "$options": "i",
                }
            return users_col.count_documents(query)

        dept["admin_count"] = count_role("department_admin")
        dept["lecturer_count"] = count_role("lecturer")
        dept["student_count"] = count_role("student")
        dept["created_at"] = str(dept.get("created_at") or "")
        dept["updated_at"] = str(dept.get("updated_at") or "")

    return jsonify(depts)


@admin_bp.route("/departments", methods=["POST"])
@super_admin_required
def add_department(user):
    """Create a new department."""
    d = request.get_json(silent=True) or {}
    name = _as_text(d.get("name", "")).strip()
    code = _as_text(d.get("code", "")).strip().upper()

    if not name or not code:
        return jsonify({"error": "name and code are required"}), 400

    # Check uniqueness
    if get_department_by_code(code):
        return jsonify({"error": f"Department code '{code}' already exists"}), 409

    dept = create_department(name, code)
    log_action(
        "CREATE_DEPARTMENT",
        str(user["_id"]),
        details=f"Department {code} — {name}",
    )
    return jsonify(sanitise_mongo_doc(dept)), 201


@admin_bp.route("/departments/<dept_id>", methods=["GET"])
@super_admin_required
@validate_ids("dept_id")
def get_department(user, dept_id):
    """Return a single department."""
    dept = get_department_by_id(dept_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404
    return jsonify(sanitise_mongo_doc(dept))


@admin_bp.route("/departments/<dept_id>", methods=["PUT"])
@super_admin_required
@validate_ids("dept_id")
def edit_department(user, dept_id):
    """Update a department's name, code, or status."""
    d = request.get_json(silent=True) or {}
    fields = {}
    if "name" in d:
        fields["name"] = _as_text(d["name"]).strip()
    if "code" in d:
        new_code = _as_text(d["code"]).strip().upper()
        existing = get_department_by_code(new_code)
        if existing and str(existing["_id"]) != dept_id:
            return jsonify({"error": f"Department code '{new_code}' already in use"}), 409
        fields["code"] = new_code
    if "status" in d and d["status"] in ("active", "inactive"):
        fields["status"] = d["status"]

    if not fields:
        return jsonify({"error": "No valid fields to update"}), 400

    updated = update_department(dept_id, fields)
    if not updated:
        return jsonify({"error": "Department not found"}), 404

    log_action(
        "UPDATE_DEPARTMENT",
        str(user["_id"]),
        details=f"Department {dept_id}: {fields}",
    )
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/departments/<dept_id>", methods=["DELETE"])
@super_admin_required
@validate_ids("dept_id")
def remove_department(user, dept_id):
    """Soft-delete a department (set status=inactive)."""
    dept = get_department_by_id(dept_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404

    # Prevent deletion if department has active users
    users_col = get_collection("auth", "users")
    active_users = users_col.count_documents({"department_id": ObjectId(dept_id)})
    if active_users > 0:
        return jsonify({
            "error": f"Cannot delete department with {active_users} active users. Reassign them first."
        }), 409

    soft_delete_department(dept_id)
    log_action(
        "DELETE_DEPARTMENT",
        str(user["_id"]),
        details=f"Department {dept.get('code')} deactivated",
    )
    return jsonify({"message": "Department deactivated successfully"})


# ─── Department Admin Management (Super Admin only) ────────────────────────


@admin_bp.route("/department-admins", methods=["GET"])
@super_admin_required
def list_department_admins(user):
    """List all department admin users with their department info."""
    dept_admins = sanitise_many(get_users_by_role("department_admin"))

    # Enrich with department info
    for admin in dept_admins:
        dept_id = admin.get("department_id")
        if dept_id:
            dept = get_department_by_id(str(dept_id))
            admin["department_name"] = dept.get("name") if dept else "Unknown"
            admin["department_code"] = dept.get("code") if dept else "?"
        else:
            admin["department_name"] = "Unassigned"
            admin["department_code"] = "—"
        # Remove sensitive fields
        admin.pop("password_hash", None)
        admin.pop("session_version", None)

    return jsonify(dept_admins)


@admin_bp.route("/department-admins", methods=["POST"])
@super_admin_required
def add_department_admin(user):
    """Create a new department admin user."""
    d = request.get_json(silent=True) or {}
    name = _as_text(d.get("name", "")).strip()
    email = _as_text(d.get("email", "")).strip().lower()
    department_id = _as_text(d.get("department_id", "")).strip()
    initial_password = _as_text(d.get("initial_password", "")).strip()

    if not name or not email or not department_id:
        return jsonify({"error": "name, email, and department_id are required"}), 400

    # Validate department exists
    dept = get_department_by_id(department_id)
    if not dept:
        return jsonify({"error": "Department not found"}), 404

    # Check email uniqueness
    if find_user_by_email(email):
        return jsonify({"error": "A user with this email already exists"}), 409

    # Generate temp password if not provided
    if not initial_password:
        initial_password = f"DeptAdmin{secrets.randbelow(90000) + 10000}!"

    # Validate password strength
    is_strong, pw_error = validate_password_strength(initial_password)
    if not is_strong:
        return jsonify({"error": pw_error}), 400

    new_admin = create_user(
        name=name,
        email=email,
        password=initial_password,
        role="department_admin",
        department=dept.get("name", ""),
        department_id=department_id,
        must_change_password=True,
    )

    log_action(
        "CREATE_DEPARTMENT_ADMIN",
        str(user["_id"]),
        target_user=str(new_admin.get("_id", "")),
        details=f"Dept admin {email} for {dept.get('code')}",
    )

    return jsonify({
        "message": f"Department admin created. Temp password: {initial_password}",
        "user": sanitise_mongo_doc(new_admin),
        "temp_password": initial_password,
    }), 201


@admin_bp.route("/department-admins/<uid>", methods=["PUT"])
@super_admin_required
@validate_ids("uid")
def edit_department_admin(user, uid):
    """Update a department admin's basic info or reassign their department."""
    d = request.get_json(silent=True) or {}
    target = find_user_by_id(uid)
    if not target:
        return jsonify({"error": "User not found"}), 404
    if target.get("role") != "department_admin":
        return jsonify({"error": "User is not a department admin"}), 400

    update_fields = {}
    if "name" in d:
        update_fields["name"] = _as_text(d["name"]).strip()
    if "department_id" in d:
        new_dept_id = _as_text(d["department_id"]).strip()
        dept = get_department_by_id(new_dept_id)
        if not dept:
            return jsonify({"error": "Target department not found"}), 404
        update_fields["department_id"] = ObjectId(new_dept_id)
        update_fields["department"] = dept.get("name", "")

    if not update_fields:
        return jsonify({"error": "No valid fields to update"}), 400

    users_col = get_collection("auth", "users")
    users_col.update_one({"_id": ObjectId(uid)}, {"$set": update_fields})

    log_action(
        "UPDATE_DEPARTMENT_ADMIN",
        str(user["_id"]),
        target_user=uid,
        details=f"Updated dept admin {uid}: {update_fields}",
    )
    updated = find_user_by_id(uid)
    return jsonify(sanitise_mongo_doc(updated))


@admin_bp.route("/department-admins/<uid>", methods=["DELETE"])
@super_admin_required
@validate_ids("uid")
def remove_department_admin(user, uid):
    """Delete a department admin user."""
    target = find_user_by_id(uid)
    if not target:
        return jsonify({"error": "User not found"}), 404
    if target.get("role") != "department_admin":
        return jsonify({"error": "User is not a department admin"}), 400

    delete_user(uid)
    log_action(
        "DELETE_DEPARTMENT_ADMIN",
        str(user["_id"]),
        target_user=uid,
        details=f"Deleted dept admin {target.get('email')}",
    )
    return jsonify({"message": "Department admin deleted"})


@admin_bp.route("/department-admins/<uid>/reset-password", methods=["POST"])
@super_admin_required
@validate_ids("uid")
def reset_department_admin_password(user, uid):
    """Reset a department admin's password."""
    target = find_user_by_id(uid)
    if not target:
        return jsonify({"error": "User not found"}), 404
    if target.get("role") != "department_admin":
        return jsonify({"error": "User is not a department admin"}), 400

    d = request.get_json(silent=True) or {}
    temp_password = reset_user_password(uid, temp_password=_as_text(d.get("temp_password", "")).strip() or None)

    log_action(
        "RESET_PASSWORD",
        str(user["_id"]),
        target_user=uid,
        details=f"Password reset for dept admin {target.get('email')}",
    )
    return jsonify({"message": "Password reset", "temp_password": temp_password})
