"""Enhanced role-based access control and permission validation.

Updated for the 4-tier RBAC model:
    student → lecturer → department_admin → super_admin
"""

from functools import wraps

from app.extensions import get_collection
from app.security.rbac import (ADMIN_ROLES, effective_allowed_roles,
                               get_user_department_id, is_super_admin,
                               validate_department_access)
from flask import g, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

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
                return (
                    jsonify(
                        {
                            "error": f"Access denied: missing '{permission_name}' permission"
                        }
                    ),
                    403,
                )

            g.current_user = user
            g.department_id = get_user_department_id(user)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def owner_or_admin_required(resource_user_id_param="user_id"):
    """Decorator: User must be resource owner or any admin role.

    H-5 fix: department_admin is scoped to their own department.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_email = get_jwt_identity()
            users = get_collection("auth", "users")
            user = users.find_one({"email": user_email})

            if not user:
                return jsonify({"error": "User not found"}), 404

            g.current_user = user
            g.department_id = get_user_department_id(user)

            # Super admin can access anything globally
            if is_super_admin(user):
                return fn(*args, **kwargs)

            # Department admin: verify the target resource is in their department
            if user.get("role") in ADMIN_ROLES:
                resource_user_id = kwargs.get(
                    resource_user_id_param
                ) or request.args.get(resource_user_id_param)
                if resource_user_id:
                    target_user = users.find_one(
                        {
                            "_id": __import__("bson").ObjectId(
                                str(resource_user_id)
                            )
                        }
                    )
                    if target_user and not validate_department_access(
                        user, target_user.get("department_id")
                    ):
                        return (
                            jsonify(
                                {
                                    "error": "Access denied: resource outside your department"
                                }
                            ),
                            403,
                        )
                return fn(*args, **kwargs)

            # Others can only access their own resources
            resource_user_id = kwargs.get(
                resource_user_id_param
            ) or request.args.get(resource_user_id_param)
            if str(user.get("_id")) != str(resource_user_id):
                return (
                    jsonify(
                        {
                            "error": "Access denied: can only access own resources"
                        }
                    ),
                    403,
                )

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def sensitive_operation(operation_name):
    """Decorator: Gate and audit sensitive operations.

    H-6 fix: Now also verifies the user is authenticated and has an admin role.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_email = get_jwt_identity()
            users = get_collection("auth", "users")
            user = users.find_one({"email": user_email})

            if not user:
                return jsonify({"error": "User not found"}), 404

            # Only admin roles can perform sensitive operations
            if user.get("role") not in ADMIN_ROLES and not is_super_admin(
                user
            ):
                return (
                    jsonify(
                        {"error": "Access denied: insufficient permissions"}
                    ),
                    403,
                )

            # Audit the operation
            from app.models.audit import log_action
            from flask import request as flask_request

            log_action(
                action=operation_name,
                performed_by=str(user.get("_id")),
                details=f"User {user.get('email')} performed {operation_name}",
                resource_type="sensitive_operation",
                ip_address=flask_request.remote_addr,
                user_agent=flask_request.headers.get("User-Agent", ""),
                department_id=get_user_department_id(user),
            )

            g.current_user = user
            g.department_id = get_user_department_id(user)
            return fn(*args, **kwargs)

        return wrapper

    return decorator
