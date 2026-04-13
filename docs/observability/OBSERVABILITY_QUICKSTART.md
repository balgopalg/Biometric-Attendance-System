# Observability Quick Reference

Fast start guide for observability configuration and monitoring.

## 5-Minute Setup

### 1. Install Dependencies ✓ (Already added to requirements.txt)

```bash
pip install python-json-logger==2.0.7 prometheus-client==0.19.0 sentry-sdk==1.40.6
```

### 2. Configure Environment

```bash
# Copy .env template
cp .env.example .env

# Edit .env with your settings
LOGGING_LEVEL=INFO
ERROR_TRACKING_ENABLED=1
SENTRY_DSN=https://your-sentry-key@sentry.io/project-id
METRICS_ENABLED=1
HEALTH_CHECK_ENABLED=1
```

### 3. Start Application

```bash
python run.py
```

### 4. Test Health Endpoint

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:45.123456",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 5.23 },
    "redis": { "status": "healthy", "latency_ms": 2.1 },
    "queue": { "status": "healthy", "queue_length": 2 },
    "storage": { "status": "healthy", "available_gb": 150.2 }
  }
}
```

## Key Endpoints

### Health Checks

| Endpoint | Purpose | Status Codes |
|----------|---------|--------------|
| `GET /api/health` | Full health check | 200 (ok), 503 (failed) |
| `GET /api/health/database` | Database only | 200/503 |
| `GET /api/health/redis` | Redis only | 200/503 |
| `GET /api/health/queue` | Queue only | 200/503 |
| `GET /api/health/storage` | Storage only | 200/503 |
| `GET /api/health/live` | Kubernetes liveness | 200 |
| `GET /api/health/ready` | Kubernetes readiness | 200/503 |

### Metrics

| Endpoint | Purpose |
|----------|---------|
| `GET /api/metrics` | Prometheus metrics export |

### Error Information

Error responses include error_id for support reference:

```json
{
  "error": "An unexpected error occurred",
  "error_id": "507f1f77bcf86cd799439011",
  "timestamp": "2024-01-15T10:30:45.123456"
}
```

## Common Use Cases

### 1. Check System Health

```bash
# Quick health check
curl http://localhost:5000/api/health

# Database health only
curl http://localhost:5000/api/health/database

# Queue health
curl http://localhost:5000/api/health/queue
```

### 2. View Metrics

```bash
# Get Prometheus metrics
curl http://localhost:5000/api/metrics | grep http_requests_total

# Parse specific metric
curl http://localhost:5000/api/metrics | grep -A5 http_request_duration
```

### 3. Retrieve Error Details

```python
from app.observability.error_tracking import ErrorTracker

# Get recent errors
errors = ErrorTracker.get_recent_errors(hours=24)
for error in errors:
    print(f"Error ID: {error['_id']}")
    print(f"Type: {error['exception_type']}")
    print(f"Message: {error['message']}\n")

# Get error statistics
stats = ErrorTracker.get_error_stats(hours=24)
for stat in stats:
    print(f"{stat['_id']}: {stat['count']} errors")
```

### 4. Logging with Context

```python
from app.observability.logging import auth_logger

# Log with context
auth_logger.info(
    "User action",
    user_id=user["_id"],
    action="password_change",
    email=user["email"]
)

# All logs automatically include request context
# (request_id, method, path, remote_addr, etc.)
```

## Configuration Presets

### Development (Default)

```bash
LOGGING_LEVEL=DEBUG
ERROR_TRACKING_ENABLED=0
METRICS_ENABLED=1
HEALTH_CHECK_ENABLED=1
```

### Staging

```bash
LOGGING_LEVEL=INFO
ERROR_TRACKING_ENABLED=1
SENTRY_DSN=https://staging-key@sentry.io/project
SENTRY_SAMPLE_RATE=1.0
METRICS_ENABLED=1
HEALTH_CHECK_ENABLED=1
```

### Production

```bash
LOGGING_LEVEL=INFO
ERROR_TRACKING_ENABLED=1
SENTRY_DSN=https://prod-key@sentry.io/project
SENTRY_SAMPLE_RATE=0.5          # Sample 50% of errors
SENTRY_TRACES_SAMPLE_RATE=0.1   # Sample 10% of transactions
METRICS_ENABLED=1
HEALTH_CHECK_ENABLED=1
```

## Monitoring Setup

### Prometheus Configuration

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'biometric-app'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/api/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  app:
    image: biometric-app:latest
    environment:
      LOGGING_LEVEL: INFO
      SENTRY_DSN: ${SENTRY_DSN}
      METRICS_ENABLED: 1
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health/ready"]
      interval: 10s
      timeout: 5s
      retries: 3

  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: biometric-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: biometric-app:latest
        env:
        - name: LOGGING_LEVEL
          value: "INFO"
        - name: SENTRY_DSN
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: sentry-dsn
        
        livenessProbe:
          httpGet:
            path: /api/health/live
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 30
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /api/health/ready
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
```

## Alert Rules (Prometheus)

Create `alerts.yml`:

```yaml
groups:
  - name: app
    rules:
    # Alert on high error rate
    - alert: HighErrorRate
      expr: |
        rate(errors_total[5m]) > 0.1
      for: 5m
      annotations:
        summary: "High error rate detected"

    # Alert on slow responses
    - alert: SlowResponses
      expr: |
        histogram_quantile(0.95, http_request_duration_seconds) > 1.0
      for: 5m

    # Alert on health check failure
    - alert: HealthCheckFailed
      expr: |
        up{job="biometric-app"} == 0
      for: 1m

    # Alert on database unavailable
    - alert: DatabaseUnavailable
      expr: |
        probe_success{probe="database"} == 0

    # Alert on high account lockouts
    - alert: HighLockoutRate
      expr: |
        rate(account_lockouts_total[5m]) > 0.5
```

## Troubleshooting

### Health Check Returns 503

Check individual components:

```bash
# Database issue?
curl http://localhost:5000/api/health/database

# Redis issue?
curl http://localhost:5000/api/health/redis

# Storage issue?
curl http://localhost:5000/api/health/storage
```

### Metrics Not Appearing

```bash
# Check metrics endpoint accessibility
curl http://localhost:5000/api/metrics

# Verify METRICS_ENABLED=1 in config
# Check Prometheus scrape config points to /api/metrics
```

### Logging to File (Not JSON)

Default: logs to STDOUT as JSON

To send to file:

```python
# In app/__init__.py
import logging
file_handler = logging.FileHandler('app.log')
file_handler.setFormatter(json_formatter)
app.logger.addHandler(file_handler)
```

### Errors Not Updating to Sentry

```bash
# Verify SENTRY_DSN is set
echo $SENTRY_DSN

# Test Sentry connectivity
python -c "import sentry_sdk; sentry_sdk.capture_message('test')"

# Check ERROR_TRACKING_ENABLED=1
```

## Performance Tuning

### Reduce Logging Impact

```python
# Reduce to WARNING level in production
LOGGING_LEVEL=WARNING

# Reduces logs from 100+ per request to ~5
```

### Reduce Metrics Cardinality

```python
# Good - limited label values
MetricsCollector.record_http_request(
    method=method,           # 5-7 values
    endpoint=endpoint,       # ~30-50 values
    status_code=status_code  # ~20 values
)

# Bad - high cardinality
MetricsCollector.record_http_request(
    method=method,
    endpoint=f"/users/{user_id}",  # 100k+ unique values!
    status_code=status_code
)
```

### Reduce Sentry Sample Rate

```bash
# In production with high volume
SENTRY_SAMPLE_RATE=0.1        # Sample 10% of errors
SENTRY_TRACES_SAMPLE_RATE=0.01 # Sample 1% of transactions
```

## Support & Help

### Get Error Details for Support

```bash
# When user reports error_id
curl http://localhost:5000/api/admin/errors/507f1f77bcf86cd799439011
```

### Export Recent Errors

```python
from app.observability.error_tracking import ErrorTracker
import json

errors = ErrorTracker.get_recent_errors(hours=24)
print(json.dumps(errors, indent=2, default=str))
```

### Monitor in Real-Time

```bash
# Tail JSON logs
tail -f app.log | jq '.message, .error_type'

# Filter errors only
tail -f app.log | jq 'select(.level=="ERROR")'

# Filter by endpoint
tail -f app.log | jq 'select(.http.path=="/api/auth/login")'
```
