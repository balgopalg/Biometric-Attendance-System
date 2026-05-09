# Observability

The application includes the main observability hooks needed for the current backend surface: structured logging, health checks, and metrics exposure.

## What Is Covered

- Structured logging for request and application events.
- Database, Redis, queue, and storage health checks.
- Metrics hooks for HTTP, auth, database, attendance, and queue operations.
- Error tracking integration for operational review and triage.

## Current Entry Points

- [backend/app/observability/health.py](../../backend/app/observability/health.py)
- [backend/app/observability/metrics.py](../../backend/app/observability/metrics.py)
- [backend/app/observability/logging.py](../../backend/app/observability/logging.py)
- [backend/app/observability/error_tracking.py](../../backend/app/observability/error_tracking.py)

## Health Checks

- `GET /api/auth/health`
- `GET /api/health/health`
- `GET /api/health/health/database`
- `GET /api/health/health/redis`
- `GET /api/health/health/queue`
- `GET /api/health/health/storage`

## Logging Notes

- Keep request IDs and actor context in logs where available.
- Prefer structured fields over ad hoc string concatenation.
- Avoid leaking biometric or password-related data into logs.

## Metrics Notes

- Track latency and status for the routes that drive attendance, enrollment, exports, and authentication.
- Keep queue and background-job health aligned with the actual queue keys used by the worker path.
- Use metrics to distinguish normal load from failed or blocked workflows.
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

**`GET /api/health/health`** - Full health check
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

**`GET /api/health/health/database`** - Database health only
**`GET /api/health/health/redis`** - Redis health only
**`GET /api/health/health/queue`** - Queue health only
**`GET /api/health/health/storage`** - Storage health only

**Kubernetes Probes**
- `GET /api/health/health/live` - Liveness probe (is process running?)
- `GET /api/health/health/ready` - Readiness probe (can accept traffic?)

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
        path: /api/health/health/live
        port: 5000
      initialDelaySeconds: 10
      periodSeconds: 30
    readinessProbe:
      httpGet:
        path: /api/health/health/ready
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

- [ ] Verify /api/health/health returns 200
- [ ] Test /api/health/health/database, /redis, /queue
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
- [ ] Setup alerting on /api/health/health failures
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

- [/docs/security/SECURITY_HARDENING.md](../security/SECURITY_HARDENING.md) - Security implementation
- [/docs/testing/TESTING.md](../testing/TESTING.md) - Test suite
- [backend/.env.example](../../backend/.env.example) - Configuration template

