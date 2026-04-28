"""Enhanced role-based access control and permission validation.

Updated for the 4-tier RBAC model:
    student → lecturer → department_admin → super_admin
"""

from functools import wraps
from flask import jsonify, request, g
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from app.extensions import get_collection
from app.security.rbac import (
    effective_allowed_roles,
    get_user_department_id,
    is_super_admin,
    ADMIN_ROLES,
)


# Define required permissions for sensitive operations
ROLE_PERMISSIONS = {
    "super_admin": {
        "manage_users": True,
        "manage_departments": True,
        "manage_department_admins": True,
        "manage_courses": True,
        "manage_papers": True,
        "manage_lecturers": True,
        "manage_students": True,
        "view_audit_logs": True,
        "view_global_audit_logs": True,
        "enroll_students": True,
        "export_attendance": True,
        "rollback_operations": True,
        "view_system_stats": True,
    },
    "department_admin": {
        "manage_users": True,
        "manage_courses": True,
        "manage_papers": True,
        "manage_lecturers": True,
        "manage_students": True,
        "view_audit_logs": True,
        "enroll_students": True,
        "export_attendance": True,
        "rollback_operations": True,
        "view_system_stats": True,
    },
    "lecturer": {
        "record_attendance": True,
        "view_session_details": True,
        "adjust_attendance": True,
        "commit_with_pin": True,
    },
    "student": {
        "view_profile": True,
        "view_attendance": True,
        "view_predictions": True,
        "check_eligibility": True,
    },
}

# Sensitive operations that require additional audit logging
SENSITIVE_OPERATIONS = [
    "admin.rollback",
    "admin.delete_user",
    "admin.reset_password",
    "admin.create_department_admin",
    "admin.delete_department",
    "lecturer.commit_session",
    "admin.enroll_student",
]


def role_required(*allowed_roles):
    """Decorator: Verify user role is one of allowed_roles (hierarchy-aware).

    .. deprecated::
        This is a **secondary** implementation that does NOT inject ``user``
        as a positional argument.  All route modules should import from
        ``app.utils.auth_decorators`` instead.  This copy is retained only
        for ``permission_required`` / ``owner_or_admin_required`` internal use.
    """
    roles = effective_allowed_roles(allowed_roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_email = get_jwt_identity()
            users = get_collection("auth", "users")
            user = users.find_one({"email": user_email})

            if not user:
                return jsonify({"error": "User not found"}), 404

            user_role = user.get("role")
            if user_role not in roles:
                return jsonify({"error": "Access denied: insufficient permissions"}), 403

            # Store user in g for access during request
            g.current_user = user
            g.department_id = get_user_department_id(user)
            return fn(*args, **kwargs)

        return wrapper
    return decorator


def permission_required(permission_name):
    """Decorator: Verify user has specific permission (hierarchy-aware)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_email = get_jwt_identity()
            users = get_collection("auth", "users")
            user = users.find_one({"email": user_email})

            if not user:
                return jsonify({"error": "User not found"}), 404

            user_role = user.get("role")

            # super_admin inherits all permissions
            if is_super_admin(user):
                g.current_user = user
                g.department_id = None
                return fn(*args, **kwargs)

            permissions = ROLE_PERMISSIONS.get(user_role, {})
            if not permissions.get(permission_name):
                return jsonify(
                    {"error": f"Access denied: missing '{permission_name}' permission"}
                ), 403

            g.current_user = user
            g.department_id = get_user_department_id(user)
            return fn(*args, **kwargs)

        return wrapper
    return decorator


def owner_or_admin_required(resource_user_id_param="user_id"):
    """Decorator: User must be resource owner or any admin role."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_email = get_jwt_identity()
            users = get_collection("auth", "users")
            user = users.find_one({"email": user_email})

            if not user:
                return jsonify({"error": "User not found"}), 404

            # Any admin can access anything (within their department scope)
            if user.get("role") in ADMIN_ROLES:
                g.current_user = user
                g.department_id = get_user_department_id(user)
                return fn(*args, **kwargs)

            # Others can only access their own resources
            resource_user_id = kwargs.get(resource_user_id_param) or request.args.get(resource_user_id_param)
            if str(user.get("_id")) != str(resource_user_id):
                return jsonify({"error": "Access denied: can only access own resources"}), 403

            g.current_user = user
            g.department_id = get_user_department_id(user)
            return fn(*args, **kwargs)

        return wrapper
    return decorator


def sensitive_operation(operation_name):
    """Decorator: Mark and audit sensitive operations."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_email = get_jwt_identity()
            users = get_collection("auth", "users")
            user = users.find_one({"email": user_email})

            if not user:
                return jsonify({"error": "User not found"}), 404

            # Audit the operation
            from app.models.audit import log_action
            from flask import request as flask_request

            log_action(
                user_id=user.get("_id"),
                action=operation_name,
                resource_type="sensitive_operation",
                description=f"User {user.get('email')} performed {operation_name}",
                ip_address=flask_request.remote_addr,
                user_agent=flask_request.headers.get("User-Agent", ""),
                department_id=get_user_department_id(user),
            )

            g.current_user = user
            g.department_id = get_user_department_id(user)
            return fn(*args, **kwargs)

        return wrapper
    return decorator


def validate_request_signature(required_fields):
    """Decorator: Validate request has required fields."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            data = request.get_json(silent=True) or {}
            missing = [field for field in required_fields if field not in data]

            if missing:
                return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

            return fn(*args, **kwargs)

        return wrapper
    return decorator
