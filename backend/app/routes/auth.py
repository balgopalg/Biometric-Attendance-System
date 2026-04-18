"""Authentication routes."""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,  # Added for proper refresh logic
    jwt_required,
    get_jwt_identity,
    get_jwt,
    set_access_cookies,
    set_refresh_cookies,   # Added to set refresh cookie
    unset_jwt_cookies,
)

from app.models.user import find_user_by_email, verify_password, change_user_password, normalize_email
from app.extensions import mongo, get_collection
from app.security.rate_limiter import limiter
from app.security.brute_force_protection import BruteForceProtector, IPRateLimiter
from app.utils.validation import validate_email, validate_password_strength, ValidationError, RequestValidator
from app.models.audit import log_action

auth_bp = Blueprint("auth", __name__)


def _to_utc_iso8601(value):
    """Serialize datetimes as explicit UTC ISO-8601 strings."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _revoke_current_token():
    """Helper function to revoke the current JWT based on its JTI."""
    try:
        jwt_payload = get_jwt() or {}
        jti = jwt_payload.get("jti")
        expires_at = jwt_payload.get("exp")
        if jti and expires_at:
            revoked = get_collection("auth", "revoked_jwts")
            revoked.update_one(
                {"jti": jti},
                {
                    "$setOnInsert": {
                        "jti": jti,
                        "expires_at": datetime.fromtimestamp(int(expires_at), timezone.utc),
                        "revoked_at": datetime.now(timezone.utc),
                    }
                },
                upsert=True,
            )
    except Exception:
        pass  # Failsafe: if no token exists, silently pass


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
        (cfg.get("MONGO_DB_AUTH", "auth"), "users"): ["uq_users_email", "ix_users_role"],
        (cfg.get("MONGO_DB_ACADEMIC", "academic"), "papers"): ["uq_papers_code", "ix_papers_course", "ix_papers_lecturers"],
        (cfg.get("MONGO_DB_ACADEMIC", "academic"), "student_profiles"): ["uq_profiles_user", "uq_profiles_reg", "ix_profiles_course"],
        (cfg.get("MONGO_DB_ATTENDANCE", "attendance"), "attendance_logs"): ["uq_attendance_session_paper_student", "ix_attendance_timestamp"],
        (cfg.get("MONGO_DB_ATTENDANCE", "attendance"), "attendance_sessions"): ["uq_sessions_id", "ix_sessions_lecturer_created"],
    }

    missing = []
    for (db_name, collection_name), names in required_indexes.items():
        try:
            info = mongo.cx[db_name][collection_name].index_information()
            present = set(info.keys())
            for name in names:
                if name not in present:
                    missing.append(f"{db_name}.{collection_name}:{name}")
        except Exception:
            missing.extend(names) # Collection might not exist yet

    if missing and status == "ok":
        status = "degraded"

    # Security Fix: Only expose detailed index names in debug/development mode
    if current_app.debug:
        checks["indexes_missing"] = missing
    else:
        checks["indexes_missing_count"] = len(missing)

    return jsonify({"status": status, "checks": checks})


def _normalize_role(role):
    """Map legacy 'admin' role to 'super_admin' for backward compatibility."""
    return "super_admin" if role == "admin" else role


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("20 per minute")
def login():
    """Authenticate user and set Access & Refresh JWTs in secure HttpOnly cookies."""
    ip_address = request.remote_addr
    
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    
    if not validate_email(email):
        return jsonify({"error": "Invalid email format"}), 400
    
    user = find_user_by_email(email)

    if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
        is_locked, lockout_expiry = BruteForceProtector.is_account_locked(email)
        if is_locked:
            lockout_until = _to_utc_iso8601(lockout_expiry)
            log_action(
                user_id=None,
                action="login_account_locked",
                resource_type="auth",
                description=f"Login attempt on locked account: {email}",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )
            return jsonify({
                "error": f"Account temporarily locked. Try again after {lockout_until}",
                "lockout_until": lockout_until
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

    password_ok = bool(user and verify_password(user["password_hash"], password))
    if password_ok:
        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            BruteForceProtector.clear_failed_attempts(email)
            IPRateLimiter.record_request(ip_address, "auth.login", weight=0)

            log_action(
                user_id=str(user.get("_id")),
                action="login_success",
                resource_type="auth",
                description=f"Successful login for user {email}",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )

        # Normalize legacy "admin" → "super_admin" for backward compatibility
        effective_role = user["role"]
        if effective_role == "admin":
            effective_role = "super_admin"

        sv_claim = {
            "sv": int(user.get("session_version", 1) or 1),
            "role": effective_role,
            "dept": str(user.get("department_id") or ""),
        }
        
        # Issue both access and refresh tokens
        access_token = create_access_token(identity=user["email"], additional_claims=sv_claim)
        refresh_token = create_refresh_token(identity=user["email"], additional_claims=sv_claim)

        # Resolve department name for display
        dept_name = user.get("department", "")
        if user.get("department_id"):
            try:
                from app.models.department import get_department_by_id
                dept_doc = get_department_by_id(str(user["department_id"]))
                if dept_doc:
                    dept_name = dept_doc.get("name", dept_name)
            except Exception:
                pass

        response = jsonify({
            "user": {
                "_id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"],
                "role": effective_role,
                "department": user.get("department", ""),
                "department_id": str(user.get("department_id") or ""),
                "department_name": dept_name,
                "must_change_password": user.get("must_change_password", False),
            },
        })
        
        set_access_cookies(response, access_token)
        set_refresh_cookies(response, refresh_token)
        return response
    else:
        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            failed_count, is_locked, lockout_expiry = BruteForceProtector.record_failed_attempt_atomic(email, ip_address)

            log_action(
                user_id=None,
                action="login_failed",
                resource_type="auth",
                description=f"Failed login attempt for {email} (attempt {failed_count})",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )

            if is_locked:
                lockout_until = _to_utc_iso8601(lockout_expiry) if lockout_expiry else None
                payload = {"error": "Account locked after too many failed attempts"}
                if lockout_until:
                    payload["lockout_until"] = lockout_until
                return jsonify(payload), 429
                
        return jsonify({"error": "Invalid email or password"}), 401


@auth_bp.route("/logout", methods=["POST"])
@jwt_required(optional=True)
def logout():
    """Clear auth cookies and revoke token."""
    _revoke_current_token()
    response = jsonify({"message": "Logged out"})
    # unset_jwt_cookies clears BOTH access and refresh cookies in flask_jwt_extended
    unset_jwt_cookies(response)
    return response


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Return current authenticated user."""
    email = get_jwt_identity()
    user = find_user_by_email(email)
    claims = get_jwt()
    
    # Security Fix: Ensure the user exists AND their session hasn't been forcefully invalidated
    if not user or int(user.get("session_version", 1)) != claims.get("sv"):
        return jsonify({"error": "Session expired or invalidated"}), 401

    # Resolve department name for display
    dept_name = user.get("department", "")
    if user.get("department_id"):
        try:
            from app.models.department import get_department_by_id
            dept_doc = get_department_by_id(str(user["department_id"]))
            if dept_doc:
                dept_name = dept_doc.get("name", dept_name)
        except Exception:
            pass

    # Normalize legacy role
    effective_role = _normalize_role(user["role"])

    return jsonify({
        "_id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": effective_role,
        "department": user.get("department", ""),
        "department_id": str(user.get("department_id") or ""),
        "department_name": dept_name,
        "must_change_password": user.get("must_change_password", False),
    })


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)  # Security Fix: Only allow Refresh tokens here, not Access tokens
@limiter.limit("60 per minute")
def refresh_token():
    """Issue a new access token using a valid refresh token."""
    email = get_jwt_identity()
    user = find_user_by_email(email)
    claims = get_jwt()
    
    # Security Fix: Ensure the session version matches (prevents refreshing banned/logged-out accounts)
    if not user or int(user.get("session_version", 1)) != claims.get("sv"):
        return jsonify({"error": "Session expired or invalidated. Please log in again."}), 401

    # Normalize legacy role
    effective_role = _normalize_role(user["role"])

    access_token = create_access_token(
        identity=user["email"],
        additional_claims={
            "sv": int(user.get("session_version", 1) or 1),
            "role": effective_role,
            "dept": str(user.get("department_id") or ""),
        },
    )

    # Resolve department name for display
    dept_name = user.get("department", "")
    if user.get("department_id"):
        try:
            from app.models.department import get_department_by_id
            dept_doc = get_department_by_id(str(user["department_id"]))
            if dept_doc:
                dept_name = dept_doc.get("name", dept_name)
        except Exception:
            pass

    response = jsonify({
        "message": "Token refreshed",
        "user": {
            "_id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": effective_role,
            "department": user.get("department", ""),
            "department_id": str(user.get("department_id") or ""),
            "department_name": dept_name,
            "must_change_password": user.get("must_change_password", False),
        },
    })
    set_access_cookies(response, access_token)
    return response


@auth_bp.route("/change-password", methods=["POST"])
@jwt_required()
@limiter.limit("10 per minute")
def change_password():
    """Change the authenticated user's password."""
    email = get_jwt_identity()
    user = find_user_by_email(email)
    claims = get_jwt()
    
    if not user or int(user.get("session_version", 1)) != claims.get("sv"):
        return jsonify({"error": "Session expired or invalidated"}), 401

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

    # Security Fix: Check brute-force limits BEFORE processing password change
    if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
        is_locked, lockout_expiry = BruteForceProtector.is_account_locked(email)
        if is_locked:
            return jsonify({"error": "Account temporarily locked due to too many failed attempts."}), 429

    # Security Fix: Explicitly check current password to trigger BruteForce logic if they are guessing
    if not verify_password(user["password_hash"], old_pw):
        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            BruteForceProtector.record_failed_attempt_atomic(email, request.remote_addr)
        
        log_action(
            user_id=str(user["_id"]),
            action="change_password_failed",
            resource_type="auth",
            description=f"Failed password change for {email}: Incorrect current password",
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent", ""),
        )
        return jsonify({"error": "Incorrect current password"}), 401
        
    if old_pw == new_pw:
        return jsonify({"error": "New password must be different from current password"}), 400

    success, error = change_user_password(str(user["_id"]), old_pw, new_pw)
    if not success:
        return jsonify({"error": error}), 400
    
    # If successful, clear any accumulated failed attempts
    if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
        BruteForceProtector.clear_failed_attempts(email)
    
    log_action(
        user_id=str(user["_id"]),
        action="change_password_success",
        resource_type="auth",
        description=f"Password changed successfully for {email}",
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent", ""),
    )

    # Security Fix: DRY up revocation logic
    _revoke_current_token()

    refreshed_user = find_user_by_email(email)
    effective_role = _normalize_role(refreshed_user.get("role"))
    sv_claim = {
        "sv": int(refreshed_user.get("session_version", 1) or 1),
        "role": effective_role,
        "dept": str(refreshed_user.get("department_id") or ""),
    }

    # Re-issue both tokens so they don't get logged out immediately
    new_access_token = create_access_token(identity=email, additional_claims=sv_claim)
    new_refresh_token = create_refresh_token(identity=email, additional_claims=sv_claim)
    
    response = jsonify({"message": "Password changed successfully"})
    set_access_cookies(response, new_access_token)
    set_refresh_cookies(response, new_refresh_token)
    return response