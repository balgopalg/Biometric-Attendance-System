"""Auth & role decorators for protecting routes."""

from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from app.extensions import get_collection


from flask import jsonify, request
from app.utils.validation import validate_object_id


def role_required(*allowed_roles):
    """Decorator: only allow users whose role is in *allowed_roles*."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_email = get_jwt_identity()
            users = get_collection("auth", "users")
            user = users.find_one({"email": user_email})
            if not user or user.get("role") not in allowed_roles:
                return jsonify({"error": "Access denied"}), 403
            return fn(user, *args, **kwargs)

        return wrapper

    return decorator


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
