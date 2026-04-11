"""Authentication routes."""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
    set_access_cookies,
    unset_jwt_cookies,
)

from app.models.user import find_user_by_email, verify_password, change_user_password
from app.extensions import mongo

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/health", methods=["GET"])
def health():
    """Lightweight health endpoint for DB connectivity and index verification."""
    status = "ok"
    checks = {}

    try:
        mongo.cx.admin.command("ping")
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"failed: {exc}"
        status = "degraded"

    cfg = current_app.config
    required_indexes = {
        (cfg["MONGO_DB_AUTH"], "users"): ["uq_users_email", "ix_users_role"],
        (cfg["MONGO_DB_ACADEMIC"], "papers"): ["uq_papers_code", "ix_papers_course", "ix_papers_lecturers"],
        (cfg["MONGO_DB_ACADEMIC"], "student_profiles"): ["uq_profiles_user", "uq_profiles_reg", "ix_profiles_course"],
        (cfg["MONGO_DB_ATTENDANCE"], "attendance_logs"): ["uq_attendance_session_paper_student", "ix_attendance_timestamp"],
        (cfg["MONGO_DB_ATTENDANCE"], "attendance_sessions"): ["uq_sessions_id", "ix_sessions_lecturer_created"],
    }

    missing = []
    for (db_name, collection_name), names in required_indexes.items():
        info = mongo.cx[db_name][collection_name].index_information()
        present = set(info.keys())
        for name in names:
            if name not in present:
                missing.append(f"{db_name}.{collection_name}:{name}")

    checks["indexes_missing"] = missing
    if missing and status == "ok":
        status = "degraded"

    return jsonify({"status": status, "checks": checks})


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate user and set JWT in secure HttpOnly cookie."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = find_user_by_email(email)
    if not user or not verify_password(user["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_access_token(identity=email)
    response = jsonify(
        {
            "user": {
                "_id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"],
                "role": user["role"],
                "department": user.get("department", ""),
                "must_change_password": user.get("must_change_password", False),
            },
        }
    )
    set_access_cookies(response, token)
    return response


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Clear auth cookies."""
    response = jsonify({"message": "Logged out"})
    unset_jwt_cookies(response)
    return response


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Return current authenticated user."""
    email = get_jwt_identity()
    user = find_user_by_email(email)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(
        {
            "_id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "department": user.get("department", ""),
            "must_change_password": user.get("must_change_password", False),
        }
    )


@auth_bp.route("/change-password", methods=["POST"])
@jwt_required()
def change_password():
    """Change the authenticated user's password."""
    email = get_jwt_identity()
    user = find_user_by_email(email)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}
    old_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")
    confirm_pw = data.get("confirm_password", "")

    if not old_pw or not new_pw or not confirm_pw:
        return jsonify({"error": "All fields are required"}), 400
    if new_pw != confirm_pw:
        return jsonify({"error": "New passwords do not match"}), 400

    success, error = change_user_password(str(user["_id"]), old_pw, new_pw)
    if not success:
        return jsonify({"error": error}), 400

    return jsonify({"message": "Password changed successfully"})
