"""Authentication routes."""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from flask import Blueprint, request, jsonify, current_app, send_from_directory
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
from werkzeug.utils import secure_filename

from app.models.user import find_user_by_email, verify_password, change_user_password, normalize_email
from app.extensions import mongo, get_collection
from app.security.rate_limiter import limiter
from app.security.brute_force_protection import BruteForceProtector, IPRateLimiter
from app.utils.validation import validate_email, validate_password_strength
from app.models.audit import log_action
from app.services.email_service import send_password_recovery_otp_email, is_email_delivery_enabled
from app.services.notification_service import create_notification, ensure_welcome_notification
from app.utils.helpers import decode_image_bytes, save_jpeg_with_size_bounds

auth_bp = Blueprint("auth", __name__)


ALLOWED_PROFILE_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
OTP_LENGTH = 6


def _utc_now():
    return datetime.now(timezone.utc)


def _safe_profile_upload_folder():
    root_uploads = current_app.config.get("UPLOADS_ABSOLUTE_PATH") or os.path.abspath(
        os.path.join(current_app.root_path, "..", current_app.config.get("UPLOAD_FOLDER", "uploads"))
    )
    profile_dir = os.path.join(root_uploads, "profile_pictures")
    os.makedirs(profile_dir, exist_ok=True)
    return profile_dir


def _build_profile_picture_url(user):
    file_name = str(user.get("profile_picture_file") or "").strip()
    if not file_name:
        return ""

    updated_at = user.get("profile_picture_updated_at")
    if isinstance(updated_at, datetime):
        stamp = int(updated_at.timestamp())
    else:
        stamp = int(_utc_now().timestamp())
    return f"/api/auth/profile-picture/{file_name}?v={stamp}"


def _resolve_department_name(user):
    dept_name = user.get("department", "")
    if user.get("department_id"):
        try:
            from app.models.department import get_department_by_id

            dept_doc = get_department_by_id(str(user["department_id"]))
            if dept_doc:
                dept_name = dept_doc.get("name", dept_name)
        except Exception:
            pass
    return dept_name


def _serialize_auth_user(user):
    effective_role = _normalize_role(user["role"])
    return {
        "_id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": effective_role,
        "department": user.get("department", ""),
        "department_id": str(user.get("department_id") or ""),
        "department_name": _resolve_department_name(user),
        "must_change_password": user.get("must_change_password", False),
        "profile_picture_url": _build_profile_picture_url(user),
    }


def _otp_hash(email, otp):
    secret = str(current_app.config.get("JWT_SECRET_KEY") or "dev-only-otp-secret")
    payload = f"{normalize_email(email)}:{otp}:{secret}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _clean_expired_password_otps(email):
    otps = get_collection("auth", "password_reset_otps")
    otps.delete_many({
        "email": normalize_email(email),
        "$or": [
            {"expires_at": {"$lte": _utc_now()}},
            {"used_at": {"$exists": True}},
        ],
    })


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
        current_app.logger.warning("Token revocation failed", exc_info=True)


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
                "login_account_locked",
                None,
                details=f"Login attempt on locked account: {email}",
                resource_type="auth",
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
                "login_ip_blocked",
                None,
                details=f"Login attempt from blocked IP: {ip_address}",
                resource_type="auth",
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
                "login_success",
                str(user.get("_id")),
                details=f"Successful login for user {email}",
                resource_type="auth",
                ip_address=ip_address,
                user_agent=request.headers.get("User-Agent", ""),
            )

        # Normalize legacy "admin" → "super_admin" for backward compatibility
        effective_role = _normalize_role(user["role"])

        ensure_welcome_notification(user)

        sv_claim = {
            "sv": int(user.get("session_version", 1) or 1),
            "role": effective_role,
            "dept": str(user.get("department_id") or ""),
        }
        
        # Issue both access and refresh tokens
        access_token = create_access_token(identity=user["email"], additional_claims=sv_claim)
        refresh_token = create_refresh_token(identity=user["email"], additional_claims=sv_claim)

        response = jsonify({
            "user": _serialize_auth_user(user),
        })
        
        set_access_cookies(response, access_token)
        set_refresh_cookies(response, refresh_token)
        return response
    else:
        if current_app.config.get("BRUTE_FORCE_PROTECTION_ENABLED"):
            failed_count, is_locked, lockout_expiry = BruteForceProtector.record_failed_attempt_atomic(email, ip_address)

            log_action(
                "login_failed",
                None,
                details=f"Failed login attempt for {email} (attempt {failed_count})",
                resource_type="auth",
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

    return jsonify(_serialize_auth_user(user))


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

    response = jsonify({
        "message": "Token refreshed",
        "user": _serialize_auth_user(user),
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
            "change_password_failed",
            str(user["_id"]),
            details=f"Failed password change for {email}: Incorrect current password",
            resource_type="auth",
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
        "change_password_success",
        str(user["_id"]),
        details=f"Password changed successfully for {email}",
        resource_type="auth",
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

    create_notification(
        user_id=str(user["_id"]),
        title="Password updated",
        body="Your account password was changed successfully. If this was not you, contact an administrator immediately.",
        category="security",
        priority="high",
        action_url="/change-password",
        template_key="password_changed",
        metadata={"role": refreshed_user.get("role")},
    )
    
    response = jsonify({"message": "Password changed successfully"})
    set_access_cookies(response, new_access_token)
    set_refresh_cookies(response, new_refresh_token)
    return response


@auth_bp.route("/profile-picture/<path:file_name>", methods=["GET"])
@jwt_required()
def get_profile_picture(file_name):
    """Serve profile pictures for authenticated users (ownership validated)."""
    email = get_jwt_identity()
    user = find_user_by_email(email)

    safe_name = os.path.basename(file_name or "")
    if not user or not safe_name:
        return jsonify({"error": "Profile picture not found"}), 404

    # Verify ownership: user can only download their own profile picture
    if user.get("profile_picture_file") != safe_name:
        return jsonify({"error": "Profile picture not found"}), 404

    profile_dir = _safe_profile_upload_folder()
    file_path = os.path.join(profile_dir, safe_name)
    if not os.path.isfile(file_path):
        return jsonify({"error": "Profile picture not found"}), 404

    return send_from_directory(profile_dir, safe_name)


@auth_bp.route("/profile-picture", methods=["POST"])
@jwt_required()
@limiter.limit("20 per hour")
def upload_profile_picture():
    """Upload the authenticated user's profile picture and return updated user payload."""
    email = get_jwt_identity()
    user = find_user_by_email(email)
    claims = get_jwt()

    if not user or int(user.get("session_version", 1)) != claims.get("sv"):
        return jsonify({"error": "Session expired or invalidated"}), 401

    file = request.files.get("profile_picture")
    if not file or not file.filename:
        return jsonify({"error": "Profile picture file is required"}), 400

    original_name = secure_filename(file.filename)
    _, ext = os.path.splitext(original_name)
    ext = ext.lower()
    if ext not in ALLOWED_PROFILE_IMAGE_EXTENSIONS:
        return jsonify({"error": "Invalid image format. Use JPG, PNG, or WEBP."}), 400

    profile_dir = _safe_profile_upload_folder()
    unique_name = f"{str(user['_id'])}_{secrets.token_hex(8)}.jpg"
    destination = os.path.join(profile_dir, unique_name)

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Profile picture file is empty"}), 400

    try:
        image_rgb = decode_image_bytes(file_bytes)
        image_bgr = image_rgb[:, :, ::-1]
        min_kb = max(1, current_app.config.get("PHOTO_MIN_KB", 100))
        max_kb = max(min_kb, current_app.config.get("PHOTO_MAX_KB", 300))
        save_jpeg_with_size_bounds(
            destination,
            image_bgr,
            min_kb=min_kb,
            max_kb=max_kb,
        )
    except ValueError:
        return jsonify({"error": "Invalid image format. Use JPG, PNG, or WEBP."}), 400
    except Exception:
        return jsonify({"error": "Failed to process profile picture"}), 500

    users = get_collection("auth", "users")
    previous_name = str(user.get("profile_picture_file") or "").strip()
    now = _utc_now()
    users.update_one(
        {"_id": user["_id"]},
        {"$set": {"profile_picture_file": unique_name, "profile_picture_updated_at": now}},
    )

    create_notification(
        user_id=str(user["_id"]),
        title="Profile picture updated",
        body="Your profile picture was updated successfully.",
        category="profile",
        priority="normal",
        action_url="",
        template_key="profile_picture_updated",
        metadata={"role": user.get("role")},
    )

    if previous_name and previous_name != unique_name:
        old_file = os.path.join(profile_dir, os.path.basename(previous_name))
        if os.path.isfile(old_file):
            try:
                os.remove(old_file)
            except OSError:
                pass

    refreshed_user = find_user_by_email(email)
    return jsonify({
        "message": "Profile picture updated successfully",
        "user": _serialize_auth_user(refreshed_user),
    })


@auth_bp.route("/forgot-password/request-otp", methods=["POST"])
@limiter.limit("8 per hour")
def request_password_reset_otp():
    """Generate and email password recovery OTP for the linked account email."""
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    if not email or not validate_email(email):
        return jsonify({"error": "A valid email address is required"}), 400

    user = find_user_by_email(email)
    generic_response = {
        "message": "If an account exists for that email, a recovery OTP has been sent.",
        "email_delivery_enabled": is_email_delivery_enabled(),
    }
    if not user:
        return jsonify(generic_response)

    # First-time users must complete initial login password change using
    # the temporary password provided by admin; forgot-password is disabled.
    if bool(user.get("must_change_password", False)):
        return jsonify({
            "error": "First-time users must sign in with the temporary password and complete initial password change before using forgot password.",
            "code": "INITIAL_PASSWORD_CHANGE_REQUIRED",
        }), 403

    _clean_expired_password_otps(email)
    otps = get_collection("auth", "password_reset_otps")
    now = _utc_now()

    existing_count = otps.count_documents(
        {
            "email": email,
            "created_at": {"$gte": now - timedelta(minutes=15)},
        }
    )
    if existing_count >= 5:
        return jsonify({"error": "Too many OTP requests. Try again in a few minutes."}), 429

    otp = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    ttl_minutes = int(current_app.config.get("PASSWORD_RESET_OTP_TTL_MINUTES", 10))
    expires_at = now + timedelta(minutes=ttl_minutes)
    otps.insert_one(
        {
            "email": email,
            "otp_hash": _otp_hash(email, otp),
            "created_at": now,
            "expires_at": expires_at,
            "attempts": 0,
            "max_attempts": int(current_app.config.get("PASSWORD_RESET_OTP_MAX_ATTEMPTS", 5)),
        }
    )

    send_password_recovery_otp_email(
        to_email=user["email"],
        name=user.get("name", "User"),
        otp=otp,
        expires_in_minutes=ttl_minutes,
    )

    return jsonify(generic_response)


@auth_bp.route("/forgot-password/reset", methods=["POST"])
@limiter.limit("10 per hour")
def reset_password_with_otp():
    """Verify OTP and update account password for forgot-password flow."""
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    otp = str(data.get("otp", "")).strip()
    new_pw = data.get("new_password", "")
    confirm_pw = data.get("confirm_password", "")

    if not email or not validate_email(email):
        return jsonify({"error": "A valid email address is required"}), 400
    if not otp:
        return jsonify({"error": "Recovery OTP is required"}), 400
    if not new_pw or not confirm_pw:
        return jsonify({"error": "New password and confirmation are required"}), 400
    if new_pw != confirm_pw:
        return jsonify({"error": "New passwords do not match"}), 400

    is_strong, msg = validate_password_strength(new_pw)
    if not is_strong:
        return jsonify({"error": f"Password does not meet security requirements: {msg}"}), 400

    user = find_user_by_email(email)
    if not user:
        return jsonify({"error": "Invalid OTP or email"}), 400

    if bool(user.get("must_change_password", False)):
        return jsonify({
            "error": "First-time users must sign in with the temporary password and complete initial password change before using forgot password.",
            "code": "INITIAL_PASSWORD_CHANGE_REQUIRED",
        }), 403

    _clean_expired_password_otps(email)
    otps = get_collection("auth", "password_reset_otps")
    otp_doc = otps.find_one(
        {
            "email": email,
            "expires_at": {"$gt": _utc_now()},
            "used_at": {"$exists": False},
        },
        sort=[("created_at", -1)],
    )
    if not otp_doc:
        return jsonify({"error": "OTP expired or invalid. Please request a new OTP."}), 400

    attempts = int(otp_doc.get("attempts", 0))
    max_attempts = int(otp_doc.get("max_attempts", current_app.config.get("PASSWORD_RESET_OTP_MAX_ATTEMPTS", 5)))
    otp_matches = hmac.compare_digest(str(otp_doc.get("otp_hash") or ""), _otp_hash(email, otp))
    if not otp_matches:
        attempts += 1
        if attempts >= max_attempts:
            otps.update_one({"_id": otp_doc["_id"]}, {"$set": {"used_at": _utc_now(), "attempts": attempts}})
            return jsonify({"error": "OTP verification failed too many times. Request a new OTP."}), 400

        otps.update_one({"_id": otp_doc["_id"]}, {"$set": {"attempts": attempts}})
        return jsonify({"error": "Invalid OTP"}), 400

    if verify_password(user["password_hash"], new_pw):
        return jsonify({"error": "New password must be different from current password"}), 400

    users = get_collection("auth", "users")
    pw_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"password_hash": pw_hash, "must_change_password": False},
            "$inc": {"session_version": 1},
        },
    )

    otps.update_one({"_id": otp_doc["_id"]}, {"$set": {"used_at": _utc_now()}})
    BruteForceProtector.clear_failed_attempts(email)

    log_action(
        "forgot_password_reset_success",
        str(user["_id"]),
        details=f"Password reset completed via OTP for {email}",
        resource_type="auth",
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent", ""),
    )

    return jsonify({"message": "Password reset successful. You can now log in with the new password."})