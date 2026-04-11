"""Flask application factory."""

import os
from urllib.parse import urlparse
from datetime import timedelta
from flask import Flask
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import OperationFailure
from .config import Config
from .extensions import mongo, jwt, cors, get_collection


def create_app(config_class=Config, seed_default_admin=True):
    app = Flask(__name__)
    app.config.from_object(config_class)
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
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=app.config.get("CORS_SUPPORTS_CREDENTIALS", True),
    )

    @app.after_request
    def _security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=()")
        return response

    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.admin import admin_bp
    from .routes.lecturer import lecturer_bp
    from .routes.student import student_bp
    from .routes.recognition import recognition_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(lecturer_bp, url_prefix="/api/lecturer")
    app.register_blueprint(student_bp, url_prefix="/api/student")
    app.register_blueprint(recognition_bp, url_prefix="/api/recognition")

    with app.app_context():
        _bootstrap_isolated_databases(mongo, app.config)
        _ensure_indexes(mongo, app.config)
        if seed_default_admin:
            _seed_admin(mongo)

    return app


def _validate_security_config(app):
    env = (app.config.get("ENV") or "").lower()
    local_envs = {"development", "dev", "local", "testing", "test"}
    strict_always = bool(app.config.get("STRICT_JWT_SECRET", False))

    if not strict_always and env in local_envs:
        return

    insecure_secrets = {"change-me", "admin123", "", None}
    if app.config.get("JWT_SECRET_KEY") in insecure_secrets:
        raise RuntimeError(
            "JWT_SECRET_KEY is weak. Set a strong value for non-local environments "
            "or enable STRICT_JWT_SECRET=1 to enforce this everywhere."
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

    courses = client[config["MONGO_DB_ACADEMIC"]]["courses"]
    _create_index_safe(courses, [("code", ASCENDING)], unique=True, name="uq_courses_code")

    papers = client[config["MONGO_DB_ACADEMIC"]]["papers"]
    _create_index_safe(papers, [("code", ASCENDING)], unique=True, name="uq_papers_code")
    _create_index_safe(papers, [("course_id", ASCENDING)], name="ix_papers_course")
    _create_index_safe(papers, [("lecturer_id", ASCENDING)], name="ix_papers_lecturers")

    profiles = client[config["MONGO_DB_ACADEMIC"]]["student_profiles"]
    _create_index_safe(profiles, [("user_id", ASCENDING)], unique=True, name="uq_profiles_user")
    _create_index_safe(profiles, [("reg_number", ASCENDING)], unique=True, name="uq_profiles_reg")
    _create_index_safe(profiles, [("course_id", ASCENDING)], name="ix_profiles_course")
    _create_index_safe(profiles, [("academic_year", ASCENDING)], name="ix_profiles_year")

    attendance_logs = client[config["MONGO_DB_ATTENDANCE"]]["attendance_logs"]
    _create_index_safe(
        attendance_logs,
        [("session_id", ASCENDING), ("paper_id", ASCENDING), ("student_id", ASCENDING)],
        unique=True,
        name="uq_attendance_session_paper_student",
    )
    _create_index_safe(attendance_logs, [("timestamp", DESCENDING)], name="ix_attendance_timestamp")
    _create_index_safe(attendance_logs, [("paper_id", ASCENDING), ("student_id", ASCENDING)], name="ix_attendance_paper_student")

    sessions = client[config["MONGO_DB_ATTENDANCE"]]["attendance_sessions"]
    _create_index_safe(sessions, [("session_id", ASCENDING)], unique=True, name="uq_sessions_id")
    _create_index_safe(sessions, [("lecturer_id", ASCENDING), ("created_at", DESCENDING)], name="ix_sessions_lecturer_created")
    _create_index_safe(sessions, [("rollback_until", ASCENDING)], name="ix_sessions_rollback_until")

    overrides = client[config["MONGO_DB_ATTENDANCE"]]["exam_eligibility_overrides"]
    _create_index_safe(
        overrides,
        [("student_id", ASCENDING), ("paper_id", ASCENDING)],
        unique=True,
        name="uq_overrides_student_paper",
    )

    audits = client[config["MONGO_DB_AUDIT"]]["audit_logs"]
    _create_index_safe(audits, [("timestamp", DESCENDING)], name="ix_audit_timestamp")
    _create_index_safe(audits, [("action", ASCENDING)], name="ix_audit_action")


def _seed_admin(mongo):
    """Create a default admin account if none exists."""
    import bcrypt

    users = get_collection("auth", "users")
    if users.count_documents({"role": "admin"}) == 0:
        users.insert_one(
            {
                "name": "System Admin",
                "email": "admin@system.com",
                "password_hash": bcrypt.hashpw(
                    "admin123".encode(), bcrypt.gensalt()
                ).decode(),
                "role": "admin",
                "department": "Administration",
                "created_at": __import__("datetime").datetime.utcnow(),
            }
        )


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
