"""Rate limiting configuration for Flask-Limiter."""

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Will be initialized in app factory
# Keep global defaults off; use explicit @limiter.limit decorators on sensitive endpoints.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    swallow_errors=False,
    in_memory_fallback_enabled=False,
    storage_options={"socket_connect_timeout": 1},
)

# Rate limit definitions for specific endpoints
RATE_LIMITS = {
    "auth.login": "5 per minute",  # 5 login attempts per minute per IP
    "auth.change_password": "10 per minute",  # nosec B105
    # 30 session commits per minute (PIN entry)
    "lecturer.commit_session": "30 per minute",
    "admin.students.enroll": "20 per minute",  # 20 enrollment operations per minute
    # 10 export operations per minute
    "admin.attendance_matrix.export": "10 per minute",
}


def get_rate_limit(endpoint):
    """Get rate limit for a specific endpoint, or default."""
    return RATE_LIMITS.get(endpoint, "100 per hour")
