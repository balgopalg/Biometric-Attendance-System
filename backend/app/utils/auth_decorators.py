"""Auth & role decorators for protecting routes.

Updated to support the 4-tier hierarchical RBAC model:
    student → lecturer → department_admin → super_admin

Key behaviours:
    • ``role_required("department_admin")`` also allows ``super_admin``.
    • Legacy ``role_required("admin")`` maps to ``department_admin`` + ``super_admin``.
    • Every protected handler receives the authenticated ``user`` dict as its first
      positional argument  **and**  the user is stored on ``flask.g.current_user``.
    • ``g.department_id`` is set for downstream query scoping.
"""

from __future__ import annotations

from functools import wraps

from flask import g, jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.extensions import get_collection
from app.security.rbac import (
    effective_allowed_roles,
    get_user_department_id,
    is_super_admin,
)
from app.utils.validation import validate_object_id


# ---------------------------------------------------------------------------
# Primary role-based decorator
# ---------------------------------------------------------------------------

def role_required(*allowed_roles):
    """Decorator: only allow users whose role is in *allowed_roles*.

    ``super_admin`` is **always** included when ``department_admin`` (or the
    legacy ``"admin"``) is listed, because super_admin inherits every lower
    role's permissions.

    Injects the authenticated ``user`` dict as the **first** positional
    argument of the wrapped function (existing pattern kept for backward
    compatibility).
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
                return jsonify({"error": "Access denied"}), 403

            # Normalize legacy "admin" role → "super_admin"
            user_role = user.get("role", "")
            if user_role == "admin":
                user["role"] = "super_admin"

            if user["role"] not in roles:
                return jsonify({"error": "Access denied"}), 403

            # Populate request-level context for downstream helpers
            g.current_user = user
            g.department_id = get_user_department_id(user)

            return fn(user, *args, **kwargs)

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Convenience shortcuts
# ---------------------------------------------------------------------------

def super_admin_required(fn):
    """Decorator: restrict access to ``super_admin`` only."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_email = get_jwt_identity()
        users = get_collection("auth", "users")
        user = users.find_one({"email": user_email})

        if not user or not is_super_admin(user):
            return jsonify({"error": "Access denied: super admin required"}), 403

        g.current_user = user
        g.department_id = None  # super_admin has no department scope

        return fn(user, *args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# ID validation decorator (unchanged)
# ---------------------------------------------------------------------------

def validate_ids(*param_names):
    """Decorator: ensure specified route parameters are valid MongoDB ObjectIds."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for name in param_names:
                val = kwargs.get(name)
                if val and not validate_object_id(str(val)):
                    return jsonify({"error": f"Invalid ID format for '{name}'"}), 400
            return fn(*args, **kwargs)

        return wrapper

    return decorator
