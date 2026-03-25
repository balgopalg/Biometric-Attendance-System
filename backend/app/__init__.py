"""Flask application factory."""

import os
from urllib.parse import urlparse
from datetime import timedelta
from flask import Flask
from pymongo import ASCENDING, DESCENDING
from .config import Config
from .extensions import mongo, jwt, cors, get_collection


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    _validate_production_config(app)
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        seconds=config_class.JWT_ACCESS_TOKEN_EXPIRES
    )

    # Ensure upload folder exists
    os.makedirs(app.config.get("UPLOAD_FOLDER", "uploads"), exist_ok=True)

    # Initialise extensions
    mongo.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

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

    # Seed default admin on first run
    with app.app_context():
        _bootstrap_isolated_databases(mongo, app.config)
        _ensure_indexes(mongo, app.config)
        _seed_admin(mongo)

    return app


def _validate_production_config(app):
    if app.config.get("ENV") != "production":
        return
    insecure_secrets = {"change-me", "admin123", "", None}
    if app.config.get("JWT_SECRET_KEY") in insecure_secrets:
        raise RuntimeError("JWT_SECRET_KEY must be set to a strong value in production")


def _ensure_indexes(mongo, config):
    client = mongo.cx

    auth_users = client[config["MONGO_DB_AUTH"]]["users"]
    auth_users.create_index([("email", ASCENDING)], unique=True, name="uq_users_email")
    auth_users.create_index([("role", ASCENDING)], name="ix_users_role")

    courses = client[config["MONGO_DB_ACADEMIC"]]["courses"]
    courses.create_index([("code", ASCENDING)], unique=True, name="uq_courses_code")

    papers = client[config["MONGO_DB_ACADEMIC"]]["papers"]
    papers.create_index([("code", ASCENDING)], unique=True, name="uq_papers_code")
    papers.create_index([("course_id", ASCENDING)], name="ix_papers_course")
    papers.create_index([("lecturer_id", ASCENDING)], name="ix_papers_lecturers")

    profiles = client[config["MONGO_DB_ACADEMIC"]]["student_profiles"]
    profiles.create_index([("user_id", ASCENDING)], unique=True, name="uq_profiles_user")
    profiles.create_index([("reg_number", ASCENDING)], unique=True, name="uq_profiles_reg")
    profiles.create_index([("course_id", ASCENDING)], name="ix_profiles_course")
    profiles.create_index([("academic_year", ASCENDING)], name="ix_profiles_year")

    attendance_logs = client[config["MONGO_DB_ATTENDANCE"]]["attendance_logs"]
    attendance_logs.create_index(
        [("session_id", ASCENDING), ("paper_id", ASCENDING), ("student_id", ASCENDING)],
        unique=True,
        name="uq_attendance_session_paper_student",
    )
    attendance_logs.create_index([("timestamp", DESCENDING)], name="ix_attendance_timestamp")
    attendance_logs.create_index([("paper_id", ASCENDING), ("student_id", ASCENDING)], name="ix_attendance_paper_student")

    sessions = client[config["MONGO_DB_ATTENDANCE"]]["attendance_sessions"]
    sessions.create_index([("session_id", ASCENDING)], unique=True, name="uq_sessions_id")
    sessions.create_index([("lecturer_id", ASCENDING), ("created_at", DESCENDING)], name="ix_sessions_lecturer_created")
    sessions.create_index([("rollback_until", ASCENDING)], name="ix_sessions_rollback_until")

    overrides = client[config["MONGO_DB_ATTENDANCE"]]["exam_eligibility_overrides"]
    overrides.create_index(
        [("student_id", ASCENDING), ("paper_id", ASCENDING)],
        unique=True,
        name="uq_overrides_student_paper",
    )

    audits = client[config["MONGO_DB_AUDIT"]]["audit_logs"]
    audits.create_index([("timestamp", DESCENDING)], name="ix_audit_timestamp")
    audits.create_index([("action", ASCENDING)], name="ix_audit_action")


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
