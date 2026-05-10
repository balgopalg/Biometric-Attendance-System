"""Metrics collection and monitoring for observability."""

import time
from datetime import datetime, timezone

from flask import g, request
from prometheus_client import (REGISTRY, Counter, Gauge, Histogram,
                               generate_latest)

# Request metrics
http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)

# Authentication metrics
auth_attempts_total = Counter(
    "auth_attempts_total", "Total authentication attempts", ["status"]
)

account_lockouts_total = Counter(
    "account_lockouts_total",
    "Total account lockouts due to failed attempts",
    ["reason"],  # 'login', 'pin'
)

# Error metrics
errors_total = Counter(
    "errors_total", "Total errors by type", ["error_type", "status_code"]
)

# Database metrics
db_operations_total = Counter(
    "db_operations_total",
    "Total database operations",
    ["operation", "collection"],
)

db_operation_duration_seconds = Histogram(
    "db_operation_duration_seconds",
    "Database operation duration in seconds",
    ["operation", "collection"],
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0),
)

# Attendance metrics
attendance_sessions_total = Counter(
    "attendance_sessions_total",
    "Total attendance sessions",
    ["status"],  # 'created', 'committed', 'adjusted', 'rolled_back'
)

students_marked_total = Counter(
    "students_marked_total",
    "Total students marked in attendance",
    ["session_type"],  # 'manual', 'automatic'
)

# Cache metrics
cache_operations_total = Counter(
    "cache_operations_total",
    "Total cache operations",
    ["operation", "hit_or_miss"],  # operation: get/set, hit_or_miss: hit/miss
)

# Queue metrics
queue_jobs_total = Counter(
    "queue_jobs_total",
    "Total queue jobs",
    ["queue", "status"],  # status: queued, running, completed, failed
)

queue_job_duration_seconds = Histogram(
    "queue_job_duration_seconds",
    "Queue job duration in seconds",
    ["queue"],
    buckets=(1, 5, 10, 30, 60, 300),
)

# System health metrics
active_sessions = Gauge("active_sessions", "Number of active user sessions")

database_connection_failed = Counter(
    "database_connection_failed_total", "Total database connection failures"
)


class MetricsCollector:
    """Collect and aggregate metrics."""

    @classmethod
    def record_http_request(
        cls, method, endpoint, status_code, duration_seconds
    ):
        """Record HTTP request metrics."""
        http_requests_total.labels(
            method=method, endpoint=endpoint, status=status_code
        ).inc()

        http_request_duration_seconds.labels(
            method=method, endpoint=endpoint
        ).observe(duration_seconds)

    @classmethod
    def record_auth_attempt(cls, success):
        """Record authentication attempt."""
        status = "success" if success else "failed"
        auth_attempts_total.labels(status=status).inc()

    @classmethod
    def record_account_lockout(cls, reason="login"):
        """Record account lockout."""
        account_lockouts_total.labels(reason=reason).inc()

    @classmethod
    def record_error(cls, error_type, status_code):
        """Record error occurrence."""
        errors_total.labels(
            error_type=error_type, status_code=status_code
        ).inc()

    @classmethod
    def record_db_operation(cls, operation, collection, duration_seconds):
        """Record database operation."""
        db_operations_total.labels(
            operation=operation, collection=collection
        ).inc()

        db_operation_duration_seconds.labels(
            operation=operation, collection=collection
        ).observe(duration_seconds)

    @classmethod
    def record_attendance_session(cls, status):
        """Record attendance session status."""
        attendance_sessions_total.labels(status=status).inc()

    @classmethod
    def record_students_marked(cls, count, session_type="manual"):
        """Record students marked."""
        students_marked_total.labels(session_type=session_type).inc(count)

    @classmethod
    def record_cache_operation(cls, operation, hit):
        """Record cache operation."""
        hit_or_miss = "hit" if hit else "miss"
        cache_operations_total.labels(
            operation=operation, hit_or_miss=hit_or_miss
        ).inc()

    @classmethod
    def record_queue_job(cls, queue, status, duration_seconds=None):
        """Record queue job."""
        queue_jobs_total.labels(queue=queue, status=status).inc()

        if duration_seconds:
            queue_job_duration_seconds.labels(queue=queue).observe(
                duration_seconds
            )

    @classmethod
    def set_active_sessions(cls, count):
        """Set active sessions gauge."""
        active_sessions.set(count)

    @classmethod
    def increment_db_connection_failures(cls):
        """Increment database connection failures."""
        database_connection_failed.inc()

    @classmethod
    def get_metrics(cls):
        """Get Prometheus metrics in text format."""
        return generate_latest(REGISTRY)


def register_metrics_middleware(app):
    """Register metrics collection middleware."""

    @app.before_request
    def before_request():
        g.request_start_time = time.time()

    @app.after_request
    def after_request(response):
        if hasattr(g, "request_start_time"):
            duration = time.time() - g.request_start_time
            MetricsCollector.record_http_request(
                method=request.method,
                endpoint=request.endpoint or "unknown",
                status_code=response.status_code,
                duration_seconds=duration,
            )

        return response


class MetricsSnapshot:
    """Capture metrics snapshot for dashboards."""

    @classmethod
    def get_system_metrics(cls):
        """Get comprehensive system metrics."""
        try:
            from app.extensions import mongo

            # Database health
            try:
                mongo.cx.admin.command("ping")
                db_status = "healthy"
                db_latency_ms = 0
            except Exception:
                db_status = "unhealthy"
                db_latency_ms = None

            # Error statistics (last 24 hours)
            from app.observability.error_tracking import ErrorTracker

            error_stats = ErrorTracker.get_error_stats(hours=24)

            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "database": {
                    "status": db_status,
                    "latency_ms": db_latency_ms,
                },
                "errors": {
                    "total": sum(s["count"] for s in error_stats),
                    "by_type": {s["_id"]: s["count"] for s in error_stats},
                },
            }
        except Exception as e:
            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": str(e),
            }
