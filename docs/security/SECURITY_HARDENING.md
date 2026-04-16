# Security Hardening Implementation Guide

## Overview

This document outlines the comprehensive security hardening implemented for the biometric attendance system, including rate limiting, brute-force protection, CSRF validation, role-based access control, and input validation.

---

## 1. Rate Limiting

### Endpoints Protected

| Endpoint | Limit | Description |
|----------|-------|-------------|
| `POST /api/auth/login` | 20 per minute per IP | Login attempts |
| `POST /api/auth/change-password` | 10 per minute per user | Password changes |
| `POST /api/lecturer/session/commit` | 30 per minute per lecturer | Session commits (PIN entry) |
| `POST /api/admin/students/enroll` | 20 per minute | Student enrollments |
| `GET /api/admin/attendance-matrix/export*` | 10 per minute | Export operations |

### Configuration

```bash
# environment variables
RATELIMIT_ENABLED=true
RATELIMIT_STORAGE_URL=memory://  # or redis://localhost:6379 for distributed
```

### Implementation

- Uses **Flask-Limiter** with configurable storage backends
- Defaults to in-memory storage; use Redis for distributed deployments
- Automatically responds with `429 Too Many Requests` when limit exceeded
- X-RateLimit headers included in all responses

---

## 2. Brute-Force Protection

### Login Protection

**Mechanism:**
- Tracks failed login attempts per email over 15-minute windows
- Locks account after 5 failed attempts for 15 minutes
- IP-based rate limiting to detect distributed attacks

**Configuration:**

```bash
BRUTE_FORCE_PROTECTION_ENABLED=true
LOGIN_LOCKOUT_THRESHOLD=5              # Failed attempts before lockout
LOGIN_LOCKOUT_DURATION_MINUTES=15      # How long to lock account
LOGIN_ATTEMPT_WINDOW_MINUTES=15        # Time window to count attempts
IP_RATELIMIT_THRESHOLD=100             # Max requests from single IP in window
IP_RATELIMIT_WINDOW_MINUTES=10         # Time window for IP rate limit
```

**Response When Locked:**

```json
{
  "error": "Account temporarily locked. Try again after 2026-04-12T15:45:30",
  "lockout_until": "2026-04-12T15:45:30"
}
```

### PIN Protection (Attendance Sessions)

**Mechanism:**
- Tracks failed PIN attempts per session
- Blocks session after 3 failed PIN entries for 5 minutes
- Prevents brute-force attacks on 4-6 digit PINs

**Implementation:**

```python
from app.security.brute_force_protection import BruteForceProtector

# Record failed PIN attempt
attempt_count = BruteForceProtector.record_pin_failure(
    session_id=session_id,
    lecturer_id=lecturer_id,
    ip_address=request.remote_addr,
    attempt_number=1
)

# Check if blocked
is_blocked, count = BruteForceProtector.is_session_pin_blocked(session_id, max_attempts=3)
if is_blocked:
    return jsonify({"error": f"Too many PIN attempts. Try again later."}), 429

# On success, clear failures
BruteForceProtector.clear_pin_failures(session_id)
```

---

## 3. CSRF Protection

### Cookie-Based CSRF Protection

**Configuration:**

```python
JWT_TOKEN_LOCATION = ["cookies"]
JWT_COOKIE_CSRF_PROTECT = True
JWT_COOKIE_SAMESITE = "Lax"  # or "Strict" for maximum protection
JWT_COOKIE_SECURE = True     # HTTPS only in production
```

**Safety Measures:**

- All modifying requests (POST, PUT, DELETE) must include valid CSRF token
- Token extracted from request headers (`X-CSRF-TOKEN`) or form data
- SameSite cookie attribute prevents cross-site cookie submission
- Secure flag ensures HTTPS-only transmission in production

**Usage in Frontend:**

```javascript
// Get CSRF token from cookies
function getCSRFToken() {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('csrf_access_token='))
    ?.split('=')[1];
}

// Include in requests
fetch('/api/auth/change-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-TOKEN': getCSRFToken()
  },
  credentials: 'include',
  body: JSON.stringify({...})
});
```

---

## 4. Role-Based Access Control (RBAC)

### Role Definitions

```python
ROLE_PERMISSIONS = {
    "admin": {
        "manage_users": True,
        "manage_courses": True,
        "manage_papers": True,
        "manage_lecturers": True,
        "manage_students": True,
        "view_audit_logs": True,
        "enroll_students": True,
        "export_attendance": True,
        "rollback_operations": True,
        "view_system_stats": True,
    },
    "lecturer": {
        "record_attendance": True,
        "view_session_details": True,
        "adjust_attendance": True,
        "commit_with_pin": True,
    },
    "student": {
        "view_profile": True,
        "view_attendance": True,
        "view_predictions": True,
        "check_eligibility": True,
    },
}
```

### Route Protection Decorators

**Role-Based Access:**

```python
from app.security.access_control import role_required

@admin_bp.route("/stats", methods=["GET"])
@role_required("admin")
def get_stats():
    """Only admin role allowed."""
    pass
```

**Permission-Based Access:**

```python
from app.security.access_control import permission_required

@admin_bp.route("/students/enroll", methods=["POST"])
@permission_required("enroll_students")
def enroll_student():
    """Only users with enroll_students permission."""
    pass
```

**Owner or Admin Access:**

```python
from app.security.access_control import owner_or_admin_required

@student_bp.route("/profile/<user_id>", methods=["GET"])
@owner_or_admin_required(resource_user_id_param="user_id")
def get_profile(user_id):
    """User can view own profile or admin can view any."""
    pass
```

**Sensitive Operations:**

```python
from app.security.access_control import sensitive_operation

@admin_bp.route("/audit-logs/<log_id>/rollback", methods=["POST"])
@sensitive_operation("admin.rollback")
@role_required("admin")
def rollback_operation(log_id):
    """Automatically audits this sensitive operation."""
    pass
```

### Audit Logging

All sensitive operations are automatically logged:

```python
from app.models.audit import log_action

log_action(
    user_id=str(user_id),
    action="enroll_student",
    resource_type="student",
    description=f"Enrolled student {user_id}",
    ip_address=request.remote_addr,
    user_agent=request.headers.get("User-Agent", ""),
)
```

---

## 5. Input Validation & Sanitization

### Validation Utilities

Located in `app/utils/validation.py`:

```python
from app.utils.validation import (
    validate_email,
    validate_password_strength,
    validate_pin,
    validate_role,
    validate_object_id,
    validate_course_code,
    validate_registration_number,
    RequestValidator,
)

# Email validation
if not validate_email(email):
    return jsonify({"error": "Invalid email format"}), 400

# Password strength validation
is_strong, msg = validate_password_strength(password)
if not is_strong:
    return jsonify({"error": msg}), 400

# PIN validation (4-6 digits)
if not validate_pin(pin):
    return jsonify({"error": "Invalid PIN format"}), 400

# Role validation
if not validate_role(role):
    return jsonify({"error": "Invalid role"}), 400
```

### Request Validation

```python
from app.utils.validation import RequestValidator, ValidationError

@auth_bp.route("/login", methods=["POST"])
def login():
    try:
        data = RequestValidator.validate_json_request(
            required_fields=["email", "password"],
            field_validators={
                "email": validate_email,
                "password": lambda p: len(p) > 0,
            }
        )
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400
```

### Password Strength Requirements

Passwords must meet ALL requirements:

- **Minimum Length:** 12 characters  
- **Uppercase Letters:** At least 1 (A-Z)
- **Lowercase Letters:** At least 1 (a-z)
- **Digits:** At least 1 (0-9)
- **Special Characters:** At least 1 (!@#$%^&*...)

**Examples:**

```
✓ Valid: MySecure!Pass123
✓ Valid: P@ssw0rd-ABC123
✗ Invalid: password123       (no uppercase, no special char)
✗ Invalid: PASSWORD!         (no lowercase, no digit)
✗ Invalid: Pass@1            (too short)
```

---

## 6. Environment Configuration

### Production Environment Setup

Create `.env` or use environment variables:

```bash
# Core Security
FLASK_ENV=production
JWT_SECRET_KEY=<64-character-random-string>
STRICT_JWT_SECRET=true

# JWT/Session
JWT_COOKIE_SECURE=true
JWT_COOKIE_SAMESITE=Strict
JWT_COOKIE_CSRF_PROTECT=true

# CORS (restrict to your frontend domain only)
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Rate Limiting
RATELIMIT_ENABLED=true
RATELIMIT_STORAGE_URL=redis://your-redis-server:6379/0

# Brute Force Protection
BRUTE_FORCE_PROTECTION_ENABLED=true
LOGIN_LOCKOUT_THRESHOLD=5
LOGIN_LOCKOUT_DURATION_MINUTES=15

# Password Policy
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_DIGITS=true
PASSWORD_REQUIRE_SPECIAL=true

# Audit Logging
AUDIT_LOGGING_ENABLED=true
LOG_SENSITIVE_OPERATIONS=true
AUDIT_LOG_RETENTION_DAYS=90
```

### Generating Strong JWT Secret

```bash
# On Linux/Mac
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Or using OpenSSL
openssl rand -base64 32

# Minimum 64 characters recommended
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

---

## 7. Database Security

### Required Collections & Indexes

The system auto-creates security-related collections:

```
- failed_login_attempts (TTL: 1 hour, auto-delete old records)
- pin_failures (TTL: 24 hours, auto-delete old records)  
- ip_rate_limits (TTL: 1 hour, auto-delete old records)
```

**Indexes created automatically:**

```python
db.failed_login_attempts.createIndex({ "ttl": 1 }, { expireAfterSeconds: 0 })
db.pin_failures.createIndex({ "ttl": 1 }, { expireAfterSeconds: 0 })
db.ip_rate_limits.createIndex({ "ttl": 1 }, { expireAfterSeconds: 0 })
```

---

## 8. Production Deployment Checklist

- [ ] Set strong `JWT_SECRET_KEY` (64+ random characters)
- [ ] Set `FLASK_ENV=production`
- [ ] Enable `JWT_COOKIE_SECURE=true`
- [ ] Set `JWT_COOKIE_SAMESITE=Strict`
- [ ] Configure CORS to specific domain(s) only
- [ ] Enable Redis for distributed rate limiting (if multi-server)
- [ ] Set up audit log retention policy
- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Configure database auth and encryption
- [ ] Set up monitoring/alerting for failed login attempts
- [ ] Regular audit log review (weekly/monthly)
- [ ] Implement WAF (Web Application Firewall) rules
- [ ] Enable HTTP/2 and compression security headers
- [ ] Configure CSP (Content Security Policy) headers
- [ ] Set up regular security patch updates

---

## 9. Monitoring & Alerting

### Key Metrics to Monitor

```python
# Failed login attempts
db.failed_login_attempts.countDocuments({"attempted_at": {$gte: <1-hour-ago>}})

# Locked accounts
accounts_locked = db.failed_login_attempts.aggregate([
    {"$match": {"attempted_at": {$gte: <15-min-ago>}}},
    {"$group": {"_id": "$email", "count": {$sum: 1}}},
    {"$match": {"count": {$gte: 5}}}
])

# IP-based attacks
top_ips = db.ip_rate_limits.aggregate([
    {"$group": {"_id": "$ip_address", "requests": {$sum: "$weight"}}},
    {"$sort": {"requests": -1}},
    {"$limit": 10}
])

# Audit log summary
audit_summary = db.audit_logs.aggregate([
    {"$group": {"_id": "$action", "count": {$sum: 1}}},
    {"$sort": {"count": -1}}
])
```

### Recommended Alerts

- More than 10 failed logins in 1 minute from single IP
- More than 20 failed logins from single email in 1 hour
- More than 5 failed PIN attempts in 1 session
- Rollback operations performed
- User deletion or password reset
- Admin role assignments
- CSV/XLSX export operations

---

## 10. Testing Security

### Backend Security Tests

Add tests to `backend/tests/test_security_hardening.py`:

```python
def test_login_rate_limiting():
    """Verify 5 attempts per minute limit."""
    for i in range(6):
        response = client.post('/api/auth/login', json={...})
    assert response.status_code == 429

def test_account_lockout():
    """Verify account locks after 5 failed attempts."""
    for i in range(5):
        client.post('/api/auth/login', json={"email": "user@test.com", "password": "wrong"})
    response = client.post('/api/auth/login', json={"email": "user@test.com", "password": "correct"})
    assert response.status_code == 429
    assert "lockout_until" in response.json

def test_password_strength():
    """Verify password policy enforcement."""
    weak_passwords = ["pass", "password123", "PASSWORD", "Passw0rd"]
    strong_password = "MySecure!Pass123"
    
    for weak_pw in weak_passwords:
        is_strong, msg = validate_password_strength(weak_pw)
        assert not is_strong
    
    is_strong, msg = validate_password_strength(strong_password)
    assert is_strong

def test_rbac():
    """Verify role-based access control."""
    admin_response = admin_client.get('/api/admin/stats')
    assert admin_response.status_code == 200
    
    student_response = student_client.get('/api/admin/stats')
    assert student_response.status_code == 403
```

---

## 11. Quick Reference: Common Operations

### Creating Admin User with Strong Password

```python
from app.models.user import create_user
import secrets

admin_password = "MyAdmin!Secure" + secrets.token_hex(4)
user = create_user(
    name="Admin User",
    email="admin@system.com",
    password=admin_password,
    role="admin"
)
print(f"Created admin with temporary password: {admin_password}")
```

### Viewing Failed Login Attempts

```python
from app.security.brute_force_protection import BruteForceProtector

failed_count = BruteForceProtector.get_failed_attempt_count("user@example.com")
is_locked, expires = BruteForceProtector.is_account_locked("user@example.com")

if is_locked:
    print(f"Account locked until {expires}")
else:
    print(f"Failed attempts: {failed_count}/5")
```

### Unlock Account Manually

```python
from app.security.brute_force_protection import BruteForceProtector

BruteForceProtector.clear_failed_attempts("user@example.com")
print("Account unlocked")
```

---

## References

- OWASP Top 10: https://owasp.org/Top10/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- Flask Security Best Practices: https://flask.palletsprojects.com/en/latest/security/
- Flask-JWT-Extended: https://flask-jwt-extended.readthedocs.io/
- Flask-Limiter: https://limits.readthedocs.io/

---

**Last Updated:** April 12, 2026  
**Status:** Production Ready
