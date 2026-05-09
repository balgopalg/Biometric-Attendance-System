import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=BACKEND_ENV_PATH)


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name, default=0):
    """Safely parse an integer env var, returning default on invalid values."""
    try:
        return int(os.getenv(name, str(default)))
    except (ValueError, TypeError):
        return default


def _env_float(name, default=0.0):
    """Safely parse a float env var, returning default on invalid values."""
    try:
        return float(os.getenv(name, str(default)))
    except (ValueError, TypeError):
        return default


class Config:
    """Application configuration loaded from environment variables."""
    # Feature flag: Enable leave-adjusted attendance (exclude approved leaves from denominator)
    LEAVE_ADJUSTED_ATTENDANCE_ENABLED = _env_bool("LEAVE_ADJUSTED_ATTENDANCE_ENABLED", False)

    ENV = os.getenv("FLASK_ENV", "development").lower()
    _IS_PROD_LIKE = ENV in {"production", "prod", "staging"}
    DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"

    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/biometric_attendance")
    MONGO_DB_AUTH = os.getenv("MONGO_DB_AUTH", "biometric_auth")
    MONGO_DB_ACADEMIC = os.getenv("MONGO_DB_ACADEMIC", "biometric_academic")
    MONGO_DB_ATTENDANCE = os.getenv("MONGO_DB_ATTENDANCE", "biometric_attendance_ops")
    MONGO_DB_AUDIT = os.getenv("MONGO_DB_AUDIT", "biometric_audit")
    
    # JWT Secret: MUST be strong in production (64+ chars, random)
    # Dev fallback only for local/test environments
    _JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    if not _JWT_SECRET_KEY and ENV in {"production", "prod", "staging"}:
        raise RuntimeError(
            "CRITICAL: JWT_SECRET_KEY not set in production. "
            "Set via environment variable to a strong random string (64+ characters)"
        )
    JWT_SECRET_KEY = _JWT_SECRET_KEY or ("dev_secret_key_change_in_production" if ENV not in {"production", "prod", "staging"} else os.urandom(32).hex())
    
    # Enforce secret strength validation
    STRICT_JWT_SECRET = _env_bool("STRICT_JWT_SECRET", ENV in {"production", "prod", "staging"})
    
    # Validate JWT secret strength in production
    if STRICT_JWT_SECRET and len(JWT_SECRET_KEY) < 32:
        raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters in production")
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
    JWT_ACCESS_TOKEN_EXPIRES = _env_int("JWT_ACCESS_TOKEN_EXPIRES_SECONDS", 3600)

    ENABLE_DEFAULT_ADMIN_SEED = _env_bool("ENABLE_DEFAULT_ADMIN_SEED", False)
    LECTURER_AUTH_MODE = os.getenv("LECTURER_AUTH_MODE", "pin").lower()
    DEFAULT_ADMIN_EMAIL = os.getenv("DEFAULT_ADMIN_EMAIL", "")
    DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "")
    FACE_EMBEDDING_ENCRYPTION_KEY = os.getenv("FACE_EMBEDDING_ENCRYPTION_KEY", "")
    TEMP_PASS_DISPLAY_ENABLED = _env_bool("TEMP_PASS_DISPLAY_ENABLED", False)

    # ============ SECURITY HARDENING SETTINGS ============
    
    # Rate Limiting
    RATELIMIT_ENABLED = _env_bool("RATELIMIT_ENABLED", True)
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")  # Use "redis://localhost:6379" for distributed
    RATELIMIT_FAIL_CLOSED = _env_bool("RATELIMIT_FAIL_CLOSED", _IS_PROD_LIKE)

    if RATELIMIT_ENABLED and _IS_PROD_LIKE:
        if not RATELIMIT_STORAGE_URI:
            raise RuntimeError(
                "CRITICAL: RATELIMIT_STORAGE_URI must be set in production/staging "
                "(for example redis://redis:6379/1)."
            )
        if RATELIMIT_STORAGE_URI.strip().lower() == "memory://":
            raise RuntimeError(
                "CRITICAL: RATELIMIT_STORAGE_URI=memory:// is not allowed in production/staging. "
                "Use a shared backend such as Redis."
            )
    
    # Brute Force Protection
    BRUTE_FORCE_PROTECTION_ENABLED = _env_bool("BRUTE_FORCE_PROTECTION_ENABLED", True)
    LOGIN_LOCKOUT_THRESHOLD = _env_int("LOGIN_LOCKOUT_THRESHOLD", 5)
    LOGIN_LOCKOUT_DURATION_MINUTES = _env_int("LOGIN_LOCKOUT_DURATION_MINUTES", 15)
    LOGIN_ATTEMPT_WINDOW_MINUTES = _env_int("LOGIN_ATTEMPT_WINDOW_MINUTES", 15)
    
    PIN_MAX_ATTEMPTS = _env_int("PIN_MAX_ATTEMPTS", 3)
    PIN_LOCKOUT_DURATION_MINUTES = _env_int("PIN_LOCKOUT_DURATION_MINUTES", 5)
    
    # IP-based Rate Limiting
    IP_RATELIMIT_THRESHOLD = _env_int("IP_RATELIMIT_THRESHOLD", 100)
    IP_RATELIMIT_WINDOW_MINUTES = _env_int("IP_RATELIMIT_WINDOW_MINUTES", 10)
    
    # Password Policy
    PASSWORD_MIN_LENGTH = _env_int("PASSWORD_MIN_LENGTH", 8)
    PASSWORD_REQUIRE_UPPERCASE = _env_bool("PASSWORD_REQUIRE_UPPERCASE", True)
    PASSWORD_REQUIRE_LOWERCASE = _env_bool("PASSWORD_REQUIRE_LOWERCASE", True)
    PASSWORD_REQUIRE_DIGITS = _env_bool("PASSWORD_REQUIRE_DIGITS", True)
    PASSWORD_REQUIRE_SPECIAL = _env_bool("PASSWORD_REQUIRE_SPECIAL", True)
    PASSWORD_RESET_OTP_TTL_MINUTES = _env_int("PASSWORD_RESET_OTP_TTL_MINUTES", 10)
    PASSWORD_RESET_OTP_MAX_ATTEMPTS = _env_int("PASSWORD_RESET_OTP_MAX_ATTEMPTS", 5)
    
    # Session Security
    SECURE_SESSION_TIMEOUT_MINUTES = _env_int("SECURE_SESSION_TIMEOUT_MINUTES", 30)
    REQUIRE_CSRF_ON_MUTATION = _env_bool("REQUIRE_CSRF_ON_MUTATION", True)
    CONTENT_SECURITY_POLICY = os.getenv(
        "CONTENT_SECURITY_POLICY",
        "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; connect-src 'self'; "
        "font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
    HSTS_ENABLED = _env_bool("HSTS_ENABLED", ENV in {"production", "prod", "staging"})
    HSTS_MAX_AGE_SECONDS = _env_int("HSTS_MAX_AGE_SECONDS", 31536000)
    HSTS_INCLUDE_SUBDOMAINS = _env_bool("HSTS_INCLUDE_SUBDOMAINS", True)
    HSTS_PRELOAD = _env_bool("HSTS_PRELOAD", False)
    
    # Audit Logging
    AUDIT_LOGGING_ENABLED = _env_bool("AUDIT_LOGGING_ENABLED", True)
    LOG_SENSITIVE_OPERATIONS = _env_bool("LOG_SENSITIVE_OPERATIONS", True)
    AUDIT_LOG_RETENTION_DAYS = _env_int("AUDIT_LOG_RETENTION_DAYS", 90)

    # ============ OBSERVABILITY SETTINGS ============

    # Structured Logging
    LOGGING_LEVEL = os.getenv("LOGGING_LEVEL", "INFO")
    LOGGING_FORMAT = os.getenv("LOGGING_FORMAT", "text")  # json or text

    # Error Tracking
    ERROR_TRACKING_ENABLED = _env_bool("ERROR_TRACKING_ENABLED", ENV in {"production", "prod", "staging"})
    SENTRY_DSN = os.getenv("SENTRY_DSN", "")
    SENTRY_SAMPLE_RATE = _env_float("SENTRY_SAMPLE_RATE", 1.0)
    SENTRY_TRACES_SAMPLE_RATE = _env_float("SENTRY_TRACES_SAMPLE_RATE", 0.1)

    # Metrics Collection
    METRICS_ENABLED = _env_bool("METRICS_ENABLED", True)
    METRICS_PORT = _env_int("METRICS_PORT", 9090)

    # Health Checks
    HEALTH_CHECK_ENABLED = _env_bool("HEALTH_CHECK_ENABLED", True)

    # FaceNet cosine similarity threshold (0.65 recommended for reliable matching)
    # Higher = stricter matching, fewer false positives (absent marked as present)
    # Lower = lenient matching, may have false positives
    # Range guide: 0.55 = very lenient, 0.65 = balanced, 0.75 = strict
    
    # Attendance percentage threshold for exam eligibility
    ATTENDANCE_THRESHOLD = _env_float("ATTENDANCE_THRESHOLD", 75.0)

    FACENET_THRESHOLD = _env_float("FACENET_THRESHOLD", 0.65)
    DROWSINESS_EAR_THRESHOLD = _env_float("DROWSINESS_EAR_THRESHOLD", 0.25)
    DROWSINESS_MAR_THRESHOLD = _env_float("DROWSINESS_MAR_THRESHOLD", 0.60)
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
    PHOTO_MIN_KB = _env_int("PHOTO_MIN_KB", 100)
    PHOTO_MAX_KB = _env_int("PHOTO_MAX_KB", 300)
    SLOW_REQUEST_THRESHOLD_MS = _env_int("SLOW_REQUEST_THRESHOLD_MS", 500)
    QUERY_CACHE_MAX_ENTRIES = _env_int("QUERY_CACHE_MAX_ENTRIES", 500)
    TASK_QUEUE_ENABLED = _env_bool("TASK_QUEUE_ENABLED", False)
    TASK_QUEUE_REDIS_URL = os.getenv("TASK_QUEUE_REDIS_URL", "redis://localhost:6379/0")
    TASK_QUEUE_NAME = os.getenv("TASK_QUEUE_NAME", "biometric:jobs")
    TASK_QUEUE_MAX_RETRIES = _env_int("TASK_QUEUE_MAX_RETRIES", 3)
    TASK_QUEUE_BASE_BACKOFF_SECONDS = _env_int("TASK_QUEUE_BASE_BACKOFF_SECONDS", 10)
    TASK_QUEUE_MAX_BACKOFF_SECONDS = _env_int("TASK_QUEUE_MAX_BACKOFF_SECONDS", 300)
    TASK_QUEUE_BACKOFF_JITTER_RATIO = _env_float("TASK_QUEUE_BACKOFF_JITTER_RATIO", 0.25)
    TASK_QUEUE_RUNNING_TIMEOUT_SECONDS = _env_int("TASK_QUEUE_RUNNING_TIMEOUT_SECONDS", 900)
    ACTIVE_SESSION_TIMEOUT_MINUTES = _env_int("ACTIVE_SESSION_TIMEOUT_MINUTES", 180)

    # Data lifecycle retention defaults
    UPLOAD_RETENTION_DAYS = _env_int("UPLOAD_RETENTION_DAYS", 14)
    DATASET_RETENTION_DAYS = _env_int("DATASET_RETENTION_DAYS", 365)
    TRAINER_ARTIFACT_RETENTION_DAYS = _env_int("TRAINER_ARTIFACT_RETENTION_DAYS", 30)
    BACKUP_RETENTION_DAYS = _env_int("BACKUP_RETENTION_DAYS", 30)

    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload

