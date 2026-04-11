import os
from dotenv import load_dotenv

load_dotenv()


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    """Application configuration loaded from environment variables."""

    ENV = os.getenv("FLASK_ENV", "development").lower()
    DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"

    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/biometric_attendance")
    MONGO_DB_AUTH = os.getenv("MONGO_DB_AUTH", "biometric_auth")
    MONGO_DB_ACADEMIC = os.getenv("MONGO_DB_ACADEMIC", "biometric_academic")
    MONGO_DB_ATTENDANCE = os.getenv("MONGO_DB_ATTENDANCE", "biometric_attendance_ops")
    MONGO_DB_AUDIT = os.getenv("MONGO_DB_AUDIT", "biometric_audit")
    # Keep an explicit dev fallback while requiring strong secrets outside local envs.
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-this-secret")
    STRICT_JWT_SECRET = _env_bool("STRICT_JWT_SECRET", False)
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]
    CORS_SUPPORTS_CREDENTIALS = True

    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = ENV not in {"development", "dev", "local", "testing", "test"}
    JWT_COOKIE_SAMESITE = os.getenv("JWT_COOKIE_SAMESITE", "Lax")
    JWT_COOKIE_CSRF_PROTECT = _env_bool("JWT_COOKIE_CSRF_PROTECT", True)
    JWT_ACCESS_COOKIE_PATH = "/api/"
    JWT_COOKIE_DOMAIN = os.getenv("JWT_COOKIE_DOMAIN") or None
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours in seconds

    # FaceNet cosine similarity threshold (0.6+ recommended for reliable matching)
    # Higher = stricter matching, fewer false positives (absent marked as present)
    # Lower = lenient matching, may have false positives
    FACENET_THRESHOLD = float(os.getenv("FACENET_THRESHOLD", "0.60"))
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")

    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload
