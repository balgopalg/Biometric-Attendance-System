"""Authentication routes."""

from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
    set_access_cookies,
    unset_jwt_cookies,
)

from app.models.user import find_user_by_email, verify_password, change_user_password, normalize_email
from app.extensions import mongo, get_collection
from app.security.rate_limiter import limiter
from app.security.brute_force_protection import BruteForceProtector, IPRateLimiter
from app.utils.validation import validate_email, validate_password_strength, ValidationError, RequestValidator
from app.models.audit import log_action

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
@limiter.limit("5 per minute")  # 5 login attempts per minute per IP
def login():
    """
    Authenticate user and set JWT in secure HttpOnly cookie.
    
    Security features:
    - Rate limited to 5 attempts per minute per IP
    - Account lockout after 5 failed attempts for 15 minutes
    - IP-based rate limiting
    - Email and password validation
    """
    ip_address = request.remote_addr
    
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    password = data.get("password", "")

    # Input validation
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400
    
    # Verify credentials
    user = find_user_by_email(email)
    password_ok = bool(user and verify_password(user["password_hash"], password))

    if password_ok:
        # Successful login should always be allowed, even if stale lockout records exist.
        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            BruteForceProtector.clear_failed_attempts(email)
            IPRateLimiter.record_request(ip_address, "auth.login", weight=0)  # Don't count successful logins

            log_action(
                user_id=str(user.get("_id")),
                action="login_success",
                resource_type="auth",
                description=f"Successful login for user {email}",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )

        token = create_access_token(identity=user["email"])
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

    # Check account lockout only for invalid credentials.
    if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
        is_locked, lockout_expiry = BruteForceProtector.is_account_locked(email)
        if is_locked:
            log_action(
                user_id=None,
                action="login_account_locked",
                resource_type="auth",
                description=f"Login attempt on locked account: {email}",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )
            return jsonify({
                "error": f"Account temporarily locked. Try again after {lockout_expiry.isoformat()}",
                "lockout_until": lockout_expiry.isoformat()
            }), 429

        is_ip_blocked = IPRateLimiter.is_ip_blocked(
            ip_address,
            "auth.login",
            threshold=current_app.config.get("IP_RATELIMIT_THRESHOLD", 100),
            window_minutes=current_app.config.get("IP_RATELIMIT_WINDOW_MINUTES", 10),
        )
        if is_ip_blocked:
            log_action(
                user_id=None,
                action="login_ip_blocked",
                resource_type="auth",
                description=f"Login attempt from blocked IP: {ip_address}",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )
            return jsonify({"error": "Too many login attempts from your IP. Try again later."}), 429

    if not user or not verify_password(user["password_hash"], password):
        # Record failed attempt
        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            BruteForceProtector.record_failed_attempt(email, ip_address)
            failed_count = BruteForceProtector.get_failed_attempt_count(email)
            
            log_action(
                user_id=None,
                action="login_failed",
                resource_type="auth",
                description=f"Failed login attempt for {email} (attempt {failed_count})",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )
            
            if failed_count >= current_app.config.get("LOGIN_LOCKOUT_THRESHOLD", 5):
                return jsonify({
                    "error": "Account locked after too many failed attempts"
                }), 429
        
        return jsonify({"error": "Invalid email or password"}), 401


@auth_bp.route("/logout", methods=["POST"])
@jwt_required(optional=True)
def logout():
    """Clear auth cookies."""
    try:
        jwt_payload = get_jwt() or {}
    except Exception:
        jwt_payload = {}

    jti = jwt_payload.get("jti")
    expires_at = jwt_payload.get("exp")
    if jti and expires_at:
        revoked = get_collection("auth", "revoked_jwts")
        revoked.update_one(
            {"jti": jti},
            {
                "$setOnInsert": {
                    "jti": jti,
                    "expires_at": datetime.utcfromtimestamp(int(expires_at)),
                    "revoked_at": datetime.utcnow(),
                }
            },
            upsert=True,
        )

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
@limiter.limit("10 per minute")  # 10 password change attempts per minute
def change_password():
    """
    Change the authenticated user's password.
    
    Security features:
    - Password strength validation required
    - Rate limited to 10 attempts per minute
    - Audit logged
    """
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
    
    # Validate password strength
    is_strong, msg = validate_password_strength(new_pw)
    if not is_strong:
        return jsonify({"error": f"Password does not meet security requirements: {msg}"}), 400
    
    # Ensure new password is different from old
    if old_pw == new_pw:
        return jsonify({"error": "New password must be different from current password"}), 400

    success, error = change_user_password(str(user["_id"]), old_pw, new_pw)
    if not success:
        log_action(
            user_id=str(user["_id"]),
            action="change_password_failed",
            resource_type="auth",
            description=f"Failed password change for {email}: {error}",
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent", ""),
        )
        return jsonify({"error": error}), 400
    
    log_action(
        user_id=str(user["_id"]),
        action="change_password_success",
        resource_type="auth",
        description=f"Password changed successfully for {email}",
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent", ""),
    )

    return jsonify({"message": "Password changed successfully"})
