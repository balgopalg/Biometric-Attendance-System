"""Enhanced health checks for API, database, and queue subsystems."""

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify

health_bp = Blueprint("health", __name__)


class HealthChecker:
    """Comprehensive health check utilities."""

    @staticmethod
    def check_database():
        """Check MongoDB database health."""
        try:
            import time

            from app.extensions import mongo

            start = time.time()

            # Ping database
            mongo.cx.admin.command("ping")

            latency_ms = (time.time() - start) * 1000

            # Check required databases
            db_names = [
                "biometric_auth",
                "biometric_academic",
                "biometric_attendance_ops",
                "biometric_audit",
            ]

            db_status = {}
            for db_name in db_names:
                try:
                    db = mongo.cx[db_name]
                    # Try to access a collection to verify database exists
                    db.command("dbStats")
                    db_status[db_name] = "ok"
                except Exception as e:
                    db_status[db_name] = f"error: {str(e)}"

            return {
                "status": "healthy",
                "latency_ms": round(latency_ms, 2),
                "databases": db_status,
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }

    @staticmethod
    def check_redis():
        """Check Redis connectivity."""
        try:
            import time

            import redis

            redis_url = (
                current_app.config.get("TASK_QUEUE_REDIS_URL")
                or "redis://localhost:6379/0"
            )
            r = redis.from_url(
                redis_url, socket_connect_timeout=5, socket_keepalive=True
            )

            start = time.time()
            r.ping()
            latency_ms = (time.time() - start) * 1000

            # Get info
            info = r.info()

            return {
                "status": "healthy",
                "latency_ms": round(latency_ms, 2),
                "memory_mb": round(
                    info.get("used_memory", 0) / 1024 / 1024, 2
                ),
                "connected_clients": info.get("connected_clients", 0),
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }

    @staticmethod
    def check_queue():
        """Check task queue health."""
        try:
            if not current_app.config.get("TASK_QUEUE_ENABLED", False):
                return {
                    "status": "disabled",
                }

            import redis

            redis_url = (
                current_app.config.get("TASK_QUEUE_REDIS_URL")
                or "redis://localhost:6379/0"
            )
            r = redis.from_url(redis_url)

            queue_name = (
                current_app.config.get("TASK_QUEUE_NAME") or "biometric:jobs"
            )

            # Get queue stats - check actual queue keys used by implementation
            queue_length = r.llen(queue_name)
            delayed_count = r.zcard(f"{queue_name}:delayed")

            return {
                "status": "healthy",
                "queue_length": queue_length,
                "delayed_jobs": delayed_count,
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }

    @staticmethod
    def check_storage():
        """Check file storage availability."""
        try:
            import os

            upload_dir = current_app.config.get(
                "UPLOADS_ABSOLUTE_PATH", "uploads"
            )

            # Check if directory exists and is writable
            if not os.path.exists(upload_dir):
                os.makedirs(upload_dir, exist_ok=True)

            # Try to write test file
            test_file = os.path.join(upload_dir, ".health_check")
            with open(test_file, "w") as f:
                f.write("health_check")

            # Check available space
            import shutil

            stat = shutil.disk_usage(upload_dir)
            available_gb = stat.free / (1024**3)
            used_gb = stat.used / (1024**3)
            total_gb = stat.total / (1024**3)

            # Clean up
            os.remove(test_file)

            return {
                "status": "healthy",
                "path": upload_dir,
                "available_gb": round(available_gb, 2),
                "used_gb": round(used_gb, 2),
                "total_gb": round(total_gb, 2),
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }

    @staticmethod
    def check_all():
        """Run all health checks."""
        checks = {
            "database": HealthChecker.check_database(),
            "redis": HealthChecker.check_redis(),
            "queue": HealthChecker.check_queue(),
            "storage": HealthChecker.check_storage(),
        }

        # Overall status
        overall_status = "healthy"
        for check_name, check_result in checks.items():
            status = check_result.get("status", "unknown")
            if status == "unhealthy":
                overall_status = "unhealthy"
            elif status == "degraded" and overall_status == "healthy":
                overall_status = "degraded"

        return {
            "status": overall_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
        }


@health_bp.route("/health", methods=["GET"])
def health_check():
    """Full health check endpoint."""
    result = HealthChecker.check_all()

    # Set HTTP status based on health
    if result["status"] == "healthy":
        status_code = 200
    elif result["status"] == "degraded":
        status_code = 200  # Still OK but degraded
    else:
        status_code = 503  # Service Unavailable

    return jsonify(result), status_code


@health_bp.route("/health/database", methods=["GET"])
def database_health():
    """Database-specific health check."""
    result = HealthChecker.check_database()
    status_code = 200 if result["status"] == "healthy" else 503
    return jsonify(result), status_code


@health_bp.route("/health/redis", methods=["GET"])
def redis_health():
    """Redis-specific health check."""
    result = HealthChecker.check_redis()
    status_code = 200 if result["status"] == "healthy" else 503
    return jsonify(result), status_code


@health_bp.route("/health/queue", methods=["GET"])
def queue_health():
    """Queue-specific health check."""
    result = HealthChecker.check_queue()
    status_code = 200 if result["status"] in {"healthy", "disabled"} else 503
    return jsonify(result), status_code


@health_bp.route("/health/storage", methods=["GET"])
def storage_health():
    """Storage-specific health check."""
    result = HealthChecker.check_storage()
    status_code = 200 if result["status"] == "healthy" else 503
    return jsonify(result), status_code


@health_bp.route("/health/live", methods=["GET"])
def liveness_probe():
    """Kubernetes-style liveness probe (is process running?)."""
    return jsonify({"status": "alive"}), 200


@health_bp.route("/health/ready", methods=["GET"])
def readiness_probe():
    """Kubernetes-style readiness probe (can accept traffic?)."""
    # Check if database is healthy
    db_check = HealthChecker.check_database()

    if db_check["status"] == "healthy":
        return jsonify({"status": "ready"}), 200
    else:
        return (
            jsonify({"status": "not_ready", "reason": "database_unavailable"}),
            503,
        )
