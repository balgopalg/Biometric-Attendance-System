# Observability Guide

Comprehensive observability infrastructure for the biometric attendance system, enabling structured logging, centralized error tracking, metrics collection, and health monitoring for production deployments.

## Overview

The observability stack includes:

- **Structured JSON Logging**: Contextual logging with request tracing
- **Centralized Error Tracking**: Sentry integration for error grouping and alerting
- **Prometheus Metrics**: Request/response metrics and system health indicators
- **Health Checks**: Comprehensive endpoints for API, database, queue, and storage health

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Flask Application                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Structured  │  │   Error      │  │  Metrics     │       │
│  │  Logging     │  │  Tracking    │  │  Collection  │       │
│  │  (JSON)      │  │  (Sentry)    │  │ (Prometheus) │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                  │                  │              │
└─────────────────────────────────────────────────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
    ┌─────────┐      ┌─────────┐       ┌──────────┐
    │  STDOUT │      │ Sentry  │       │Prometheus│
    │  (JSON) │      │  Cloud  │       │ Metrics  │
    └─────────┘      └─────────┘       └──────────┘
         │                  │                  │
         ▼                  ▼                  ▼
    ┌─────────┐      ┌─────────┐       ┌──────────┐
    │   ELK   │      │Sentry   │       │ Grafana  │
    │ Stack   │      │Dashboard│       │ Dashboard│
    └─────────┘      └─────────┘       └──────────┘
```

## Components

### 1. Structured Logging (`app/observability/logging.py`)

#### Purpose
JSON-structured logging with automatic request context propagation for correlation and debugging.

#### Key Features
- **JSON Format**: Machine-readable logs for ELK/Datadog integration
- **Request Context**: Automatic inclusion of request ID, user ID, method, path
- **Correlation IDs**: X-Request-ID header support for request tracing
- **Contextual Loggers**: Pre-configured loggers for auth, database, attendance, etc.

#### Usage

```python
from app.observability.logging import auth_logger, db_logger

# Simple logging
auth_logger.info("User login attempt", user_email="john@example.com")

# With context
auth_logger.set_context(user_id="12345", ip_address="192.168.1.1")
auth_logger.info("Login successful")

# Error logging
try:
    risky_operation()
except Exception as e:
    auth_logger.error(f"Operation failed: {str(e)}", exception_type="ValidationError")
```

#### Log Output Format

```json
{
  "timestamp": "2024-01-15T10:30:45.123456",
  "level": "INFO",
  "logger": "app.auth",
  "message": "User login attempt",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "http": {
    "method": "POST",
    "path": "/api/auth/login",
    "remote_addr": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  },
  "user_email": "john@example.com"
}
```

### 2. Error Tracking (`app/observability/error_tracking.py`)

#### Purpose
Centralized error tracking with MongoDB storage and Sentry integration for error grouping and alerting.

#### Key Features
- **Error Recording**: Automatic logging of exceptions with full traceback
- **MongoDB Storage**: Error history in audit database with TTL cleanup
- **Error IDs**: Unique identifiers for client reference and support
- **Error Hierarchy**: Tracking of error types (validation, auth, database, etc.)

#### Usage

```python
from app.observability.error_tracking import ErrorTracker, ErrorHandler

# Track exceptions
try:
    process_user_data(user_id)
except Exception as e:
    user_id = session.get('user_id')
    error_id = ErrorTracker.track_error(e, user_id=user_id, context={
        'operation': 'process_user_data',
        'user_id': user_id
    })
    return {"error": "Operation failed", "error_id": error_id}, 500

# Track validation errors
error_id = ErrorTracker.track_validation_error(
    "Email format invalid",
    field="email",
    value="invalid-email"
)

# Track auth errors
error_id = ErrorTracker.track_auth_error(
    "Too many login attempts",
    email="user@example.com"
)

# Retrieve error details
error_details = ErrorTracker.get_error(error_id)
print(error_details)  # Full error document with traceback

# Get recent errors
recent_errors = ErrorTracker.get_recent_errors(hours=24, limit=50)
stats = ErrorTracker.get_error_stats(hours=24)
print(f"Total errors: {stats}")
```

#### MongoDB Collection Schema

```javascript
{
  "_id": "507f1f77bcf86cd799439011",
  "type": "exception",
  "exception_type": "ValidationError",
  "message": "Email format invalid",
  "traceback": "Traceback (most recent call last)...",
  "timestamp": ISODate("2024-01-15T10:30:45.123Z"),
  "user_id": "507f1f77bcf86cd799439012",
  "http": {
    "method": "POST",
    "path": "/api/auth/login",
    "remote_addr": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  },
  "context": {
    "operation": "login",
    "email_domain": "example.com"
  }
}
```

### 3. Metrics Collection (`app/observability/metrics.py`)

#### Purpose
Prometheus-compatible metrics for request/response monitoring, system health, and performance dashboards.

#### Key Metrics

**HTTP Metrics**
- `http_requests_total` - Total requests by method/endpoint/status
- `http_request_duration_seconds` - Request latency histogram

**Authentication Metrics**
- `auth_attempts_total` - Auth attempts by success/failure
- `account_lockouts_total` - Account lockouts by reason (login/PIN)

**Error Metrics**
- `errors_total` - Errors by type and HTTP status

**Database Metrics**
- `db_operations_total` - Operations count by type/collection
- `db_operation_duration_seconds` - DB operation latency

**Attendance Metrics**
- `attendance_sessions_total` - Sessions by status
- `students_marked_total` - Students marked by type

**Queue Metrics**
- `queue_jobs_total` - Jobs by queue/status
- `queue_job_duration_seconds` - Job execution time

#### Usage

```python
from app.observability.metrics import MetricsCollector, MetricsSnapshot

# Record HTTP request (automatic via middleware)
MetricsCollector.record_http_request(
    method="POST",
    endpoint="auth.login",
    status_code=200,
    duration_seconds=0.195
)

# Record authentication event
MetricsCollector.record_auth_attempt(success=True)

# Record errors
MetricsCollector.record_error(error_type="ValueError", status_code=400)

# Record database operation
MetricsCollector.record_db_operation(
    operation="find",
    collection="users",
    duration_seconds=0.012
)

# Get metrics snapshot
metrics = MetricsSnapshot.get_system_metrics()
print(metrics)
```

#### Prometheus Endpoint

Access metrics at `/api/metrics`:

```bash
curl http://localhost:5000/api/metrics
```

Output format:
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{endpoint="auth.login",method="POST",status="200"} 156.0

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{endpoint="auth.login",le="0.005",method="POST"} 24.0
http_request_duration_seconds_bucket{endpoint="auth.login",le="0.1",method="POST"} 150.0
```

### 4. Health Checks (`app/observability/health.py`)

#### Purpose
Comprehensive health check endpoints for API, database, Redis, queue, and storage subsystems.

#### Endpoints

**`GET /api/health`** - Full health check
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:45.123456",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 5.23,
      "databases": {
        "biometric_auth": "ok",
        "biometric_academic": "ok"
      }
    },
    "redis": {
      "status": "healthy",
      "latency_ms": 2.1,
      "memory_mb": 24.5,
      "connected_clients": 3
    },
    "queue": {
      "status": "healthy",
      "queue_length": 2,
      "running_jobs": 1,
      "dead_letter_count": 0,
      "recent_failures": 0
    },
    "storage": {
      "status": "healthy",
      "available_gb": 150.2,
      "used_gb": 45.3,
      "total_gb": 250.0
    }
  }
}
```

**`GET /api/health/database`** - Database health only
**`GET /api/health/redis`** - Redis health only
**`GET /api/health/queue`** - Queue health only
**`GET /api/health/storage`** - Storage health only

**Kubernetes Probes**
- `GET /api/health/live` - Liveness probe (is process running?)
- `GET /api/health/ready` - Readiness probe (can accept traffic?)

#### Usage

```python
from app.observability.health import HealthChecker

# Run all checks
health = HealthChecker.check_all()

# Run specific checks
db_status = HealthChecker.check_database()
redis_status = HealthChecker.check_redis()
queue_status = HealthChecker.check_queue()
storage_status = HealthChecker.check_storage()
```

#### Kubernetes Integration

Add to deployment manifest:

```yaml
spec:
  containers:
  - name: app
    livenessProbe:
      httpGet:
        path: /api/health/live
        port: 5000
      initialDelaySeconds: 10
      periodSeconds: 30
    readinessProbe:
      httpGet:
        path: /api/health/ready
        port: 5000
      initialDelaySeconds: 5
      periodSeconds: 10
```

## Configuration

### Environment Variables

```bash
# Logging
LOGGING_LEVEL=INFO                          # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOGGING_FORMAT=json                         # json or text

# Error Tracking (Sentry)
ERROR_TRACKING_ENABLED=1                    # Enable/disable Sentry
SENTRY_DSN=https://key@sentry.io/proj      # Sentry project DSN
SENTRY_SAMPLE_RATE=1.0                      # Error sample rate (0.0-1.0)
SENTRY_TRACES_SAMPLE_RATE=0.1              # Transaction sample rate

# Metrics
METRICS_ENABLED=1                           # Enable/disable metrics
METRICS_PORT=9090                           # Port for metrics export

# Health Checks
HEALTH_CHECK_ENABLED=1                      # Enable/disable health endpoints
```

### Configuration in Code

```python
from app.config import Config

# Logging level
log_level = Config.LOGGING_LEVEL  # INFO, DEBUG, etc.

# Error tracking enabled in prod/staging
error_tracking = Config.ERROR_TRACKING_ENABLED

# Metrics enabled
metrics_enabled = Config.METRICS_ENABLED
```

## Integration Patterns

### Structured Logging Best Practices

**1. Always Include Context**
```python
# Good - includes contextual fields
auth_logger.info("Login successful", 
    user_id=user.get("_id"), 
    email=user.get("email"),
    ip_address=request.remote_addr)

# Bad - no context
auth_logger.info("Login successful")
```

**2. Use Appropriate Log Levels**
```python
auth_logger.debug("Processing login request")      # Low-level details
auth_logger.info("Login successful")               # Key events
auth_logger.warning("Unusual login pattern")       # Potential issues
auth_logger.error("Database connection failed")    # Errors
```

**3. Correlation IDs**
```python
# Client can pass X-Request-ID header
# Automatically included in all logs for this request
POST /api/auth/login
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000

# All logs from this request include: "request_id": "550e8400-..."
```

### Error Tracking Best Practices

**1. Track Meaningful Errors**
```python
# Good - specific error with context
try:
    user = find_user_by_email(email)
except UserNotFound:
    error_id = ErrorTracker.track_auth_error(
        f"User not found: {email}",
        email=email
    )
    return {"error": "Invalid credentials", "error_id": error_id}, 401

# Bad - all exceptions tracked equally
try:
    ...
except Exception:
    ErrorTracker.track_error(...)  # Too broad
```

**2. Use Error Types**
```python
# Categorize errors properly
ErrorTracker.track_validation_error(...)    # Input validation
ErrorTracker.track_auth_error(...)          # Authentication
ErrorTracker.track_error(..., error_type="database")  # Database
```

### Metrics Best Practices

**1. Label Cardinality**
```python
# Good - limited label combinations
MetricsCollector.record_http_request(
    method="POST",              # Few values: GET, POST, etc.
    endpoint="auth.login",      # Limited endpoints
    status_code=200,            # Limited status codes
    duration_seconds=0.195
)

# Bad - high cardinality
MetricsCollector.record_http_request(
    method="POST",
    endpoint=f"/users/{user_id}",  # Too many unique values!
    ...
)
```

**2. Record All Significant Operations**
```python
# Record database operations
MetricsCollector.record_db_operation(
    operation="find_one",
    collection="users",
    duration_seconds=db_time
)

# Record authentication attempts
MetricsCollector.record_auth_attempt(success=is_valid)

# Record business events
MetricsCollector.record_attendance_session(status="committed")
```

## Monitoring & Dashboards

### Prometheus + Grafana Setup

**1. Add Prometheus data source**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'biometric-app'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/api/metrics'
    scrape_interval: 15s
```

**2. Grafana Dashboard Queries**

```promql
# Request rate (req/sec)
rate(http_requests_total[5m])

# Error rate
rate(errors_total[5m])

# Request latency (p95)
histogram_quantile(0.95, http_request_duration_seconds)

# Auth failures per minute
rate(auth_attempts_total{status="failed"}[1m])

# Account lockouts
rate(account_lockouts_total[1m])
```

### ELK Stack Integration

**1. Filebeat configuration**

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/app/*.log
    json.message_key: message
    json.keys_under_root: true

output.elasticsearch:
  hosts: ["localhost:9200"]
```

**2. Kibana queries**

```
# All errors in last hour
level: "ERROR" AND timestamp >= now-1h

# Authentication failures
message: "login_failed"

# Slow requests (>500ms)
duration_ms >= 500

# Errors by type
ERROR AND exception_type: *
```

### Sentry Integration

**1. Configure Sentry environment**

```python
# In app/__init__.py or production config
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn=app.config['SENTRY_DSN'],
    integrations=[FlaskIntegration()],
    traces_sample_rate=app.config['SENTRY_TRACES_SAMPLE_RATE'],
    sample_rate=app.config['SENTRY_SAMPLE_RATE'],
    environment=app.config['ENV'],
)
```

**2. Sentry Release Tracking**

```python
# Tag releases for better tracking
sentry_sdk.set_tag("version", "1.2.3")
sentry_sdk.set_tag("deployment", "prod-us-west")
```

## Performance Considerations

### Logging Impact

- **JSON formatting**: ~0.5ms per log
- **Disk I/O**: ~2-5ms per 100 logs to file
- **Network**: ~10-20ms per batch to ELK/Datadog

**Optimization**:
- Use sampling for high-volume logs
- Batch log shipment
- Filter sensitive data

### Metrics Impact

- **Prometheus scrape**: ~10-50ms per scrape
- **Cardinality**: Keep < 10k unique metric combinations
- **Storage**: 300 bytes-1KB per time series per day

**Optimization**:
- Use metric aggregation
- Drop low-value metrics
- Configure appropriate retention periods

### Error Tracking Impact

- **Error reporting**: ~5-10ms per error
- **Network**: ~20-50ms to Sentry
- **Storage**: ~10KB per error in MongoDB

**Optimization**:
- Use sampling for high-volume errors
- Filter noisy errors
- Cleanup old errors with TTL

## Troubleshooting

### Common Issues

**1. High CPU Usage**
- Reduce logging level to WARNING
- Disable high-cardinality metrics
- Reduce metrics sample rate

**2. Disk Space**
- Implement log rotation
- Configure metric retention
- Set error log TTL (90 days default)

**3. Missing Metrics**
- Check METRICS_ENABLED=1
- Verify /api/metrics endpoint accessible
- Check Prometheus scrape configuration

**4. Sentry Integration Not Working**
- Verify SENTRY_DSN set
- Check ERROR_TRACKING_ENABLED=1
- Test with sentry_sdk.capture_exception()

## Deployment Checklist

### Pre-Production

- [ ] Verify /api/health returns 200
- [ ] Test /api/health/database, /redis, /queue
- [ ] Configure Prometheus scraping
- [ ] Setup Grafana dashboards
- [ ] Configure Sentry project
- [ ] Setup log aggregation (ELK/Datadog)
- [ ] Test error tracking in staging
- [ ] Verify log retention policies

### Production Deployment

- [ ] Set LOGGING_LEVEL=INFO (not DEBUG)
- [ ] Enable ERROR_TRACKING_ENABLED=1
- [ ] Configure SENTRY_DSN
- [ ] Set METRICS_ENABLED=1
- [ ] Configure health check monitoring
- [ ] Setup alerting on /api/health failures
- [ ] Monitor error rate increase
- [ ] Reserve 500MB+ for logs/metrics

## API Reference

### Logging

```python
from app.observability.logging import (
    configure_logging,
    auth_logger,
    db_logger,
    attendance_logger,
    admin_logger,
    error_logger,
    StructuredLogger
)
```

### Error Tracking

```python
from app.observability.error_tracking import (
    ErrorTracker,        # Main tracking class
    ErrorHandler,        # Error response utilities
    register_error_handlers  # Flask error handler registration
)
```

### Metrics

```python
from app.observability.metrics import (
    MetricsCollector,           # Record metrics
    MetricsSnapshot,            # Get current metrics
    register_metrics_middleware # Flask middleware
)
```

### Health

```python
from app.observability.health import (
    HealthChecker,  # Run health checks
    health_bp       # Blueprint for health endpoints
)
```

## Related Documentation

- [SECURITY_HARDENING.md](SECURITY_HARDENING.md) - Security implementation
- [TESTING.md](TESTING.md) - Test suite
- [.env.example](.env.example) - Configuration template
