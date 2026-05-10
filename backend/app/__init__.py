"""Flask application factory."""

import os
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from flask import Flask, g, request
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import OperationFailure
from .config import Config
from .extensions import mongo, jwt, cors, get_collection


def create_app(config_class=Config, seed_default_admin=False):
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config["APP_STARTED_AT"] = datetime.now(timezone.utc)
    _validate_security_config(app)
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        seconds=config_class.JWT_ACCESS_TOKEN_EXPIRES
    )

    # Ensure upload folder exists
    uploads_dir = os.path.abspath(os.path.join(app.root_path, "..", app.config.get("UPLOAD_FOLDER", "uploads")))
    app.config["UPLOADS_ABSOLUTE_PATH"] = uploads_dir
    os.makedirs(uploads_dir, exist_ok=True)

    # Initialise extensions
    mongo.init_app(app)
    jwt.init_app(app)

    @jwt.token_in_blocklist_loader
    def _is_token_revoked(_jwt_header, jwt_payload):
        try:
            revoked = get_collection("auth", "revoked_jwts")
            if revoked.find_one({"jti": jwt_payload.get("jti")}) is not None:
                return True

            from app.models.user import find_user_by_email

            identity = str(jwt_payload.get("sub") or "").strip().lower()
            if not identity:
                return True

            user = find_user_by_email(identity)
            if not user:
                return True

            token_session_version = int(jwt_payload.get("sv", 1) or 1)
            current_session_version = int(user.get("session_version", 1) or 1)
            return token_session_version != current_session_version
        except Exception as exc:
            from flask import current_app
            current_app.logger.error("Token revocation check failed: %s", exc, exc_info=True)
            return True  # Fail-closed: deny access if revocation check fails

    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=app.config.get("CORS_SUPPORTS_CREDENTIALS", True),
    )
    
    # Initialize rate limiter with storage backend
    if app.config.get("RATELIMIT_ENABLED", True):
        try:
            from .security.rate_limiter import limiter
            # RATELIMIT_STORAGE_URI is now the canonical config key
            app.config["RATELIMIT_HEADERS_ENABLED"] = True
            limiter.init_app(app)
        except Exception as exc:
            if app.config.get("RATELIMIT_FAIL_CLOSED", False):
                raise RuntimeError(
                    "CRITICAL: Rate limiter initialization failed while RATELIMIT_FAIL_CLOSED=1. "
                    "Refusing to start without effective brute-force protection."
                ) from exc
            app.logger.warning("Rate limiter disabled: %s", exc)

    # Initialize observability (logging, error tracking, metrics)
    try:
        from .observability.logging import configure_logging
        from .observability.error_tracking import register_error_handlers
        from .observability.metrics import register_metrics_middleware
        from .observability.health import health_bp

        configure_logging(
            app,
            log_level=app.config.get("LOGGING_LEVEL", "INFO"),
            log_format=app.config.get("LOGGING_FORMAT", "text"),
        )
        register_error_handlers(app)
        register_metrics_middleware(app)
        app.register_blueprint(health_bp, url_prefix="/api/health")
    except Exception as exc:
        app.logger.warning("Observability features disabled: %s", exc)

    @app.after_request
    def _security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=()")

        csp = app.config.get("CONTENT_SECURITY_POLICY")
        if csp:
            response.headers.setdefault("Content-Security-Policy", csp)

        is_secure_request = request.is_secure or request.headers.get("X-Forwarded-Proto", "").lower() == "https"
        if app.config.get("HSTS_ENABLED", False) and is_secure_request:
            hsts = f"max-age={int(app.config.get('HSTS_MAX_AGE_SECONDS', 31536000))}"
            if app.config.get("HSTS_INCLUDE_SUBDOMAINS", True):
                hsts += "; includeSubDomains"
            if app.config.get("HSTS_PRELOAD", False):
                hsts += "; preload"
            response.headers.setdefault("Strict-Transport-Security", hsts)

        return response

    @app.before_request
    def _start_request_timer():
        g.request_started_at = time.perf_counter()

    @app.after_request
    def _log_request_duration(response):
        started_at = getattr(g, "request_started_at", None)
        if started_at is not None:
            elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
            response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
            threshold_ms = int(app.config.get("SLOW_REQUEST_THRESHOLD_MS", 500))
            if elapsed_ms >= threshold_ms and request.endpoint:
                app.logger.info(
                    "slow-request method=%s path=%s endpoint=%s status=%s duration_ms=%s",
                    request.method,
                    request.path,
                    request.endpoint,
                    response.status_code,
                    elapsed_ms,
                )
        return response

    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.admin import admin_bp
    from .routes.lecturer import lecturer_bp
    from .routes.student import student_bp
    from .routes.recognition import recognition_bp
    from .routes.timetable import timetable_bp
    from .routes.calendar import calendar_bp
    from .routes.notifications import notifications_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(lecturer_bp, url_prefix="/api/lecturer")
    app.register_blueprint(student_bp, url_prefix="/api/student")
    app.register_blueprint(recognition_bp, url_prefix="/api/recognition")
    app.register_blueprint(timetable_bp, url_prefix="/api/timetable")
    app.register_blueprint(calendar_bp, url_prefix="/api/calendar")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")

    with app.app_context():
        _bootstrap_isolated_databases(mongo, app.config)
        _ensure_indexes(mongo, app.config)
        _run_startup_health_checks(app)
        if seed_default_admin and app.config.get("ENABLE_DEFAULT_ADMIN_SEED", False):
            _seed_admin(mongo)

    return app


def _validate_security_config(app):
    env = (app.config.get("ENV") or "").lower()
    local_envs = {"development", "dev", "local", "testing", "test"}
    strict_always = bool(app.config.get("STRICT_JWT_SECRET", False))

    if not strict_always and env in local_envs:
        return

    insecure_secrets = {
        "change-me",
        "dev-only-change-this-secret",
        "replace-with-a-strong-random-secret",
        "admin123",  # gitleaks:allow
        "",
        None,
    }
    if app.config.get("JWT_SECRET_KEY") in insecure_secrets:
        raise RuntimeError(
            "JWT_SECRET_KEY is weak. Set a strong value for non-local environments "
            "or enable STRICT_JWT_SECRET=1 to enforce this everywhere."
        )

    if env not in local_envs and not str(app.config.get("FACE_EMBEDDING_ENCRYPTION_KEY") or "").strip():
        raise RuntimeError(
            "FACE_EMBEDDING_ENCRYPTION_KEY is required for non-local environments to protect biometric templates."
        )


def _ensure_indexes(mongo, config):
    def _create_index_safe(collection, keys, name, **kwargs):
        """Create index and auto-repair stale index definitions with same name."""
        try:
            collection.create_index(keys, name=name, **kwargs)
        except OperationFailure as exc:
            # Code 86: existing index has same name but different key spec.
            if getattr(exc, "code", None) == 86:
                collection.drop_index(name)
                collection.create_index(keys, name=name, **kwargs)
            else:
                raise

    client = mongo.cx

    auth_users = client[config["MONGO_DB_AUTH"]]["users"]
    _create_index_safe(auth_users, [("email", ASCENDING)], unique=True, name="uq_users_email")
    _create_index_safe(auth_users, [("role", ASCENDING)], name="ix_users_role")
    _create_index_safe(auth_users, [("department_id", ASCENDING)], name="ix_users_department")

    courses = client[config["MONGO_DB_ACADEMIC"]]["courses"]
    _create_index_safe(courses, [("code", ASCENDING)], unique=True, name="uq_courses_code")
    _create_index_safe(courses, [("department_id", ASCENDING)], name="ix_courses_department")

    papers = client[config["MONGO_DB_ACADEMIC"]]["papers"]
    _create_index_safe(papers, [("code", ASCENDING)], unique=True, name="uq_papers_code")
    _create_index_safe(papers, [("course_id", ASCENDING)], name="ix_papers_course")
    _create_index_safe(papers, [("lecturer_id", ASCENDING)], name="ix_papers_lecturers")

    timetables = client[config["MONGO_DB_ACADEMIC"]]["timetables"]
    _create_index_safe(timetables, [("department_id", ASCENDING), ("course_id", ASCENDING), ("semester", ASCENDING)], name="ix_timetables_scope")
    _create_index_safe(timetables, [("status", ASCENDING), ("updated_at", DESCENDING)], name="ix_timetables_status_updated")
    _create_index_safe(timetables, [("academic_session", ASCENDING)], name="ix_timetables_session")

    timetable_slots = client[config["MONGO_DB_ACADEMIC"]]["timetable_slots"]
    _create_index_safe(timetable_slots, [("timetable_id", ASCENDING), ("day_index", ASCENDING), ("start_minutes", ASCENDING)], name="ix_timetable_slots_grid")
    _create_index_safe(timetable_slots, [("lecturer_id", ASCENDING), ("day_index", ASCENDING), ("start_minutes", ASCENDING)], name="ix_timetable_slots_lecturer")
    _create_index_safe(timetable_slots, [("course_id", ASCENDING), ("semester", ASCENDING)], name="ix_timetable_slots_course_sem")

    profiles = client[config["MONGO_DB_ACADEMIC"]]["student_profiles"]
    _create_index_safe(profiles, [("user_id", ASCENDING)], unique=True, name="uq_profiles_user")
    _create_index_safe(profiles, [("reg_number", ASCENDING)], unique=True, name="uq_profiles_reg")
    _create_index_safe(profiles, [("course_id", ASCENDING)], name="ix_profiles_course")
    _create_index_safe(profiles, [("academic_year", ASCENDING)], name="ix_profiles_year")
    _create_index_safe(profiles, [("department_id", ASCENDING)], name="ix_profiles_department")

    # Department collection indexes
    departments = client[config["MONGO_DB_ACADEMIC"]]["departments"]
    _create_index_safe(departments, [("code", ASCENDING)], unique=True, name="uq_departments_code")
    _create_index_safe(departments, [("name", ASCENDING)], name="ix_departments_name")

    attendance_logs = client[config["MONGO_DB_ATTENDANCE"]]["attendance_logs"]
    _create_index_safe(
        attendance_logs,
        [("session_id", ASCENDING), ("paper_id", ASCENDING), ("user_id", ASCENDING)],
        unique=True,
        name="uq_attendance_session_paper_student",
    )
    _create_index_safe(attendance_logs, [("timestamp", DESCENDING)], name="ix_attendance_timestamp")
    _create_index_safe(attendance_logs, [("paper_id", ASCENDING), ("user_id", ASCENDING)], name="ix_attendance_paper_student")

    sessions = client[config["MONGO_DB_ATTENDANCE"]]["attendance_sessions"]
    _create_index_safe(sessions, [("session_id", ASCENDING)], unique=True, name="uq_sessions_id")
    _create_index_safe(sessions, [("lecturer_id", ASCENDING), ("created_at", DESCENDING)], name="ix_sessions_lecturer_created")
    _create_index_safe(sessions, [("rollback_until", ASCENDING)], name="ix_sessions_rollback_until")

    active_sessions = client[config["MONGO_DB_ATTENDANCE"]]["active_sessions"]
    _create_index_safe(active_sessions, [("session_id", ASCENDING)], unique=True, name="uq_active_sessions_id")
    _create_index_safe(active_sessions, [("lecturer_id", ASCENDING), ("updated_at", DESCENDING)], name="ix_active_sessions_lecturer_updated")
    _create_index_safe(active_sessions, [("expires_at", ASCENDING)], name="ix_active_sessions_expires_at")

    background_jobs = client[config["MONGO_DB_ATTENDANCE"]]["background_jobs"]
    _create_index_safe(background_jobs, [("job_id", ASCENDING)], unique=True, name="uq_jobs_id")
    _create_index_safe(background_jobs, [("status", ASCENDING), ("created_at", DESCENDING)], name="ix_jobs_status_created")
    _create_index_safe(background_jobs, [("status", ASCENDING), ("next_attempt_at", ASCENDING)], name="ix_jobs_status_next_attempt")
    _create_index_safe(background_jobs, [("updated_at", DESCENDING)], name="ix_jobs_updated")

    schema_migrations = client[config["MONGO_DB_ATTENDANCE"]]["schema_migrations"]
    _create_index_safe(schema_migrations, [("migration_id", ASCENDING)], unique=True, name="uq_schema_migrations_id")
    _create_index_safe(schema_migrations, [("applied_at", DESCENDING)], name="ix_schema_migrations_applied_at")

    overrides = client[config["MONGO_DB_ATTENDANCE"]]["exam_eligibility_overrides"]
    _create_index_safe(
        overrides,
        [("user_id", ASCENDING), ("paper_id", ASCENDING)],
        unique=True,
        name="uq_overrides_student_paper",
    )

    audits = client[config["MONGO_DB_AUDIT"]]["audit_logs"]
    _create_index_safe(audits, [("timestamp", DESCENDING)], name="ix_audit_timestamp")
    _create_index_safe(audits, [("action", ASCENDING)], name="ix_audit_action")
    _create_index_safe(
        audits,
        [
            ("action", ASCENDING),
            ("performed_by", ASCENDING),
            ("dedupe_key", ASCENDING),
            ("dedupe_bucket", ASCENDING),
        ],
        unique=True,
        name="uq_audit_dedupe_bucket",
        partialFilterExpression={"dedupe_key": {"$exists": True}, "dedupe_bucket": {"$exists": True}},
    )
    _create_index_safe(audits, [("department_id", ASCENDING), ("timestamp", DESCENDING)], name="ix_audit_department_timestamp")

    failed_login_attempts = client[config["MONGO_DB_AUTH"]]["failed_login_attempts"]
    _create_index_safe(failed_login_attempts, [("ttl", ASCENDING)], name="ix_failed_logins_ttl", expireAfterSeconds=0)

    ip_rate_limits = client[config["MONGO_DB_AUTH"]]["ip_rate_limits"]
    _create_index_safe(ip_rate_limits, [("ttl", ASCENDING)], name="ix_ip_rate_limits_ttl", expireAfterSeconds=0)

    notifications = client[config["MONGO_DB_AUTH"]]["notifications"]
    _create_index_safe(notifications, [("user_id", ASCENDING), ("is_read", ASCENDING), ("created_at", DESCENDING)], name="ix_notifications_user_read_created")

    calendars = client[config["MONGO_DB_ACADEMIC"]]["calendars"]
    _create_index_safe(calendars, [("department_id", ASCENDING), ("year", ASCENDING), ("status", ASCENDING)], name="ix_calendars_department_year_status")
    _create_index_safe(calendars, [("published_at", DESCENDING)], name="ix_calendars_published_at")

    pin_failures = client[config["MONGO_DB_ATTENDANCE"]]["pin_failures"]
    _create_index_safe(pin_failures, [("ttl", ASCENDING)], name="ix_pin_failures_ttl", expireAfterSeconds=0)

    revoked_jwts = client[config["MONGO_DB_AUTH"]]["revoked_jwts"]
    _create_index_safe(revoked_jwts, [("expires_at", ASCENDING)], name="ix_revoked_jwts_expires_at", expireAfterSeconds=0)

    password_reset_otps = client[config["MONGO_DB_AUTH"]]["password_reset_otps"]
    _create_index_safe(password_reset_otps, [("expires_at", ASCENDING)], name="ix_password_reset_otps_expires_at", expireAfterSeconds=0)

    # Leave requests: compound index for get_approved_leave_dates query pattern
    leave_requests = client[config["MONGO_DB_ACADEMIC"]]["leave_requests"]
    _create_index_safe(leave_requests, [("user_id", ASCENDING), ("status", ASCENDING)], name="ix_leave_requests_user_status")
    _create_index_safe(leave_requests, [("created_at", DESCENDING)], name="ix_leave_requests_created")


def _seed_admin(mongo):
    """Create a default super admin account only when explicit seed credentials are provided."""
    import bcrypt
    import logging

    admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "").strip().lower()
    admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        logging.getLogger(__name__).warning(
            "DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD not set; skipping admin seed."
        )
        return

    users = get_collection("auth", "users")
    # Check for any existing super_admin or legacy admin
    if users.count_documents({"role": {"$in": ["admin", "super_admin"]}}) == 0:
        users.insert_one(
            {
                "name": "Super Admin",
                "email": admin_email,
                "password_hash": bcrypt.hashpw(
                    admin_password.encode(), bcrypt.gensalt()
                ).decode(),
                "role": "super_admin",
                "department": "Administration",
                "department_id": None,
                "session_version": 1,
                "created_at": datetime.now(timezone.utc),
            }
        )


def _run_startup_health_checks(app):
    """Verify DB connectivity and critical indexes at startup."""
    client = mongo.cx

    try:
        client.admin.command("ping")
        app.logger.info("startup-health db=ok")
    except Exception as exc:
        app.logger.error("startup-health db=failed error=%s", exc)
        return

    required_indexes = {
        (app.config["MONGO_DB_AUTH"], "users"): {"uq_users_email", "ix_users_role", "ix_users_department"},
        (app.config["MONGO_DB_ACADEMIC"], "papers"): {"uq_papers_code", "ix_papers_course", "ix_papers_lecturers"},
        (app.config["MONGO_DB_ACADEMIC"], "student_profiles"): {"uq_profiles_user", "uq_profiles_reg", "ix_profiles_course", "ix_profiles_year", "ix_profiles_department"},
        (app.config["MONGO_DB_ACADEMIC"], "departments"): {"uq_departments_code"},
        (app.config["MONGO_DB_ACADEMIC"], "courses"): {"uq_courses_code", "ix_courses_department"},
        (app.config["MONGO_DB_ATTENDANCE"], "attendance_logs"): {"uq_attendance_session_paper_student", "ix_attendance_timestamp", "ix_attendance_paper_student"},
        (app.config["MONGO_DB_ATTENDANCE"], "attendance_sessions"): {"uq_sessions_id", "ix_sessions_lecturer_created", "ix_sessions_rollback_until"},
        (app.config["MONGO_DB_ATTENDANCE"], "exam_eligibility_overrides"): {"uq_overrides_student_paper"},
        (app.config["MONGO_DB_AUTH"], "failed_login_attempts"): {"ix_failed_logins_ttl"},
        (app.config["MONGO_DB_AUTH"], "ip_rate_limits"): {"ix_ip_rate_limits_ttl"},
        (app.config["MONGO_DB_AUTH"], "notifications"): {"ix_notifications_user_read_created"},
        (app.config["MONGO_DB_ACADEMIC"], "calendars"): {"ix_calendars_department_year_status", "ix_calendars_published_at"},
        (app.config["MONGO_DB_ATTENDANCE"], "pin_failures"): {"ix_pin_failures_ttl"},
        (app.config["MONGO_DB_AUTH"], "revoked_jwts"): {"ix_revoked_jwts_expires_at"},
    }

    missing = []
    for (db_name, collection_name), expected in required_indexes.items():
        collection = client[db_name][collection_name]
        index_names = set(collection.index_information().keys())
        for idx_name in expected:
            if idx_name not in index_names:
                missing.append(f"{db_name}.{collection_name}:{idx_name}")

    if missing:
        app.logger.warning("startup-health indexes=missing count=%s details=%s", len(missing), ",".join(missing))
    else:
        app.logger.info("startup-health indexes=ok")


def _legacy_db_name_from_uri(uri: str):
    parsed = urlparse(uri)
    path = (parsed.path or "").lstrip("/")
    if not path:
        return None
    # Ignore query params in db path part.
    return path.split("?", 1)[0]


def _copy_collection_if_needed(client, source_db, target_db, collection_name):
    source_col = client[source_db][collection_name]
    target_col = client[target_db][collection_name]
    if target_col.count_documents({}) > 0:
        return
    docs = list(source_col.find())
    if not docs:
        return
    target_col.insert_many(docs)


def _bootstrap_isolated_databases(mongo, config):
    """Migrate legacy single-db collections into isolated domain DBs if targets are empty."""
    legacy_db = _legacy_db_name_from_uri(config.get("MONGO_URI", ""))
    if not legacy_db:
        return

    client = mongo.cx
    domain_map = {
        config["MONGO_DB_AUTH"]: ["users"],
        config["MONGO_DB_ACADEMIC"]: ["courses", "papers", "student_profiles"],
        config["MONGO_DB_ATTENDANCE"]: ["attendance_logs", "attendance_sessions"],
        config["MONGO_DB_AUDIT"]: ["audit_logs"],
    }

    for target_db, collections in domain_map.items():
        if target_db == legacy_db:
            continue
        for col in collections:
            _copy_collection_if_needed(client, legacy_db, target_db, col)
