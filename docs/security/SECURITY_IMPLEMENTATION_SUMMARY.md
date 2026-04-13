# Security Hardening - Implementation Summary

## ✅ Completed Security Features

### 1. Rate Limiting (✓ Implemented)
- **Framework:** Flask-Limiter with configurable backends
- **Protected Endpoints:**
  - Login: 5 attempts per minute per IP
  - Password change: 10 per minute per user
  - Session commits (PIN): 30 per minute
  - Enrollment: 20 per minute
  - Exports: 10 per minute
- **Storage:** Memory (default) or Redis for distributed setups
- **Files:** `app/security/rate_limiter.py`

**Features:**
- Automatic 429 Too Many Requests responses
- Rate limit headers in responses (X-RateLimit-*)
- Configurable limits per endpoint
- Easy to extend for new endpoints

---

### 2. Brute-Force Protection (✓ Implemented)
- **Account Lockout Mechanism:**
  - Lock after 5 failed login attempts
  - 15-minute lockout duration
  - 15-minute attempt window
  - Automatic unlock after duration expires

- **PIN Protection:**
  - Max 3 failed PIN attempts
  - 5-minute lockout per session
  - Prevents dictionary/brute-force attacks on 4-6 digit PINs

- **IP-Based Rate Limiting:**
  - Track requests by IP address
  - Block IPs with >100 requests in 10 minutes
  - Prevents distributed attacks

- **Audit Logging:**
  - All login attempts logged (success/failure)
  - IP addresses and user agents recorded
  - Account lockouts tracked

- **Files:** `app/security/brute_force_protection.py`

**Database Collections:**
```
failed_login_attempts (TTL: 1 hour)
pin_failures (TTL: 24 hours)
ip_rate_limits (TTL: 1 hour)
```

---

### 3. Strong Secrets Enforcement (✓ Implemented)
- **Production Validation:**
  - Raises RuntimeError if JWT_SECRET_KEY not set in production
  - Enforces minimum 32-character length
  - Strict mode checks (STRICT_JWT_SECRET config)

- **Configuration:**
  - Dev fallback only for local/test environments
  - Requires explicit env var in production
  - Clear error messages for developers

- **Files:** `app/config.py`

**Updated Code:**
```python
if not JWT_SECRET_KEY and ENV in {"production", "prod", "staging"}:
    raise RuntimeError("JWT_SECRET_KEY not set in production...")

if STRICT_JWT_SECRET and len(JWT_SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters...")
```

---

### 4. CSRF Protection (✓ Validated & Enhanced)
- **Configuration:**
  - JWT_COOKIE_CSRF_PROTECT = True
  - JWT_COOKIE_SAMESITE = "Lax" or "Strict"
  - JWT_COOKIE_SECURE = True (production only)

- **Implementation:**
  - Token extracted from X-CSRF-TOKEN header
  - Works with cookie-based JWT
  - Prevents cross-site request forgery

- **Validation Points:**
  - All POST/PUT/DELETE requests require CSRF token
  - SameSite attribute prevents automatic cookie submission
  - Secure flag ensures HTTPS-only in production

- **Files:** `app/__init__.py`, `app/config.py`

---

### 5. Role-Based Access Control (✓ Enhanced)
- **Access Control Decorators:**
  - `@role_required(*roles)` - Check user role
  - `@permission_required(permission)` - Check specific permission
  - `@owner_or_admin_required()` - User owns resource or is admin
  - `@sensitive_operation(name)` - Auto-audit sensitive actions

- **Permission Matrix:**
  - Admin: All permissions
  - Lecturer: Record attendance, view sessions, adjust, commit
  - Student: View profile, attendance, predictions, eligibility

- **Implementation:**
  ```python
  @admin_bp.route("/stats")
  @role_required("admin")
  def stats():
      pass
  
  @admin_bp.route("/students/enroll")
  @limiter.limit("20 per minute")
  @permission_required("enroll_students")
  @sensitive_operation("admin.enroll_student")
  def enroll_student():
      pass
  ```

- **Files:** `app/security/access_control.py`

- **Audit Logging:**
  - All sensitive operations logged with timestamp, user, IP, action
  - Audit trail for compliance and security investigation

---

### 6. Input Validation & Sanitization (✓ Comprehensive)
- **Password Strength:**
  - Minimum 12 characters
  - Requires uppercase, lowercase, digit, special character
  - Prevents weak passwords like "Password123"

- **Email Validation:**
  - RFC-compliant format checking
  - Maximum 254 characters
  - Rejects invalid formats

- **PIN Validation:**
  - 4-6 digits only
  - Numeric format enforcement
  
- **Other Validators:**
  - ObjectId format validation
  - Course code validation
  - Registration number validation
  - Role validation
  - URL validation
  - IP address validation

- **Request Validation:**
  ```python
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

- **Files:** `app/utils/validation.py`

---

## 📊 Security Architecture Summary

```
┌─────────────────────────────────────┐
│     Flask Request                   │
└──────────────────┬──────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Rate Limiter       │ ←─ Flask-Limiter (5/min per IP)
        │  (Endpoint check)   │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ CORS Check          │ ←─ Flask-CORS (origin validation)
        │ (Origin validation) │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────────────────┐
        │ Auth Check                      │
        │ 1. JWT validation               │
        │ 2. Brute force check (login)    │ ←─ IP lockout, account lockout
        │ 3. CSRF validation              │ ←─ X-CSRF-TOKEN check
        └──────────┬──────────────────────┘
                   │
        ┌──────────▼──────────────────────┐
        │ Authorization Check             │
        │ 1. Role validation              │ ←─ @role_required decorator
        │ 2. Permission validation        │ ←─ @permission_required
        │ 3. Ownership check              │ ←─ @owner_or_admin_required
        └──────────┬──────────────────────┘
                   │
        ┌──────────▼──────────────────────┐
        │ Input Validation                │
        │ 1. Required field check         │ ←─ RequestValidator
        │ 2. Type validation              │
        │ 3. Format validation            │ ←─ validate_email, validate_pin, etc.
        │ 4. Business logic validation    │
        └──────────┬──────────────────────┘
                   │
        ┌──────────▼──────────────────────┐
        │ Route Handler                   │
        │ (Business logic)                │
        └──────────┬──────────────────────┘
                   │
        ┌──────────▼──────────────────────┐
        │ Audit Logging                   │ ←─ log_action() call
        │ (Sensitive operations)          │
        └──────────┬──────────────────────┘
                   │
        ┌──────────▼──────────────────────┐
        │ Response Headers                │
        │ - X-Content-Type-Options        │
        │ - X-Frame-Options               │
        │ - Referrer-Policy               │
        │ - Permissions-Policy            │
        └──────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  HTTP Response to Client                    │
└─────────────────────────────────────────────┘
```

---

## 🔧 Configuration Changes Made

### `requirements.txt`
```diff
+ Flask-Limiter==3.5.0
```

### `app/config.py`
- Added JWT secret validation
- Added rate limiting configuration
- Added brute force protection settings
- Added password policy configuration
- Added audit logging settings

### `app/__init__.py`
```python
# Initialize rate limiter with storage backend
if app.config.get("RATELIMIT_ENABLED", True):
    from .security.rate_limiter import limiter
    limiter.init_app(app)
```

### `app/routes/auth.py`
```python
@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    # Added brute-force protection
    # Added IP rate limiting
    # Added audit logging
    # Added input validation

@auth_bp.route("/change-password", methods=["POST"])
@jwt_required()
@limiter.limit("10 per minute")
def change_password():
    # Added rate limiting
    # Added password strength validation
    # Added audit logging
```

---

## 📁 New Files Created

```
backend/
├── app/
│   ├── security/
│   │   ├── __init__.py
│   │   ├── rate_limiter.py          # Flask-Limiter config
│   │   ├── brute_force_protection.py # Login/PIN/IP protection
│   │   └── access_control.py        # RBAC decorators
│   └── utils/
│       └── validation.py            # Input validation functions
├── verify_security.py               # Verification script
└── backend/.env.example             # Security config template

/docs/security/SECURITY_HARDENING.md               # Comprehensive guide (this file)
```

---

## 🧪 Testing Security Features

### Run Verification Script
```bash
cd backend
python ../verify_security.py
```

Expected output:
```
✓ JWT Secret set
✓ JWT Secret strong (32+ chars)
✓ CSRF Protection enabled
✓ Secure cookies configured
✓ Rate limiting enabled
✓ Brute force protection enabled
... (20+ more checks)

RESULTS: 25 passed, 0 failed, 0 warnings
```

### Test Rate Limiting
```bash
# Login 5 times within 1 minute from same IP
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"user@test.com","password":"test"}'
done

# 6th request should return 429 Too Many Requests
```

### Test Brute Force Protection
```bash
# Try 5 failed logins
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"user@test.com","password":"wrong"}'
done

# 6th and subsequent requests should return 429 with lockout message
```

### Test Password Validation
```bash
# Try to change password with weak password
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"current_password":"old","new_password":"weak","confirm_password":"weak"}'

# Should reject with password strength message
```

---

## 🚀 Production Deployment Checklist

- [ ] **Update .env file** with production values:
  - Set strong `JWT_SECRET_KEY` (64+ characters)
  - Set `FLASK_ENV=production`
  - Enable security flags (SECURE, SAMESITE, CSRF)
  - Whitelist CORS origins to specific domains
  - Configure Redis for distributed rate limiting (if multi-server)

- [ ] **Database Indexes:**
  ```bash
  # Verify these exist in MongoDB
  db.failed_login_attempts.createIndex({ "ttl": 1 }, { expireAfterSeconds: 0 })
  db.pin_failures.createIndex({ "ttl": 1 }, { expireAfterSeconds: 0 })
  db.ip_rate_limits.createIndex({ "ttl": 1 }, { expireAfterSeconds: 0 })
  ```

- [ ] **Monitoring & Alerting:**
  - Monitor failed login attempts
  - Alert on account lockouts
  - Track IP-based attacks
  - Monitor sensitive operations (admin actions)
  - Review audit logs regularly

- [ ] **SSL/TLS Certificate:**
  - Set up HTTPS with valid certificate
  - Enable HTTP/2 and TLS 1.2+
  - Configure HSTS header

- [ ] **Firewall Rules:**
  - Rate limit at WAF level (e.g., AWS WAF, Cloudflare)
  - Allow only expected CORS origins
  - Block known malicious IPs

- [ ] **Security Testing:**
  - Run `python verify_security.py`
  - Test CSRF protection
  - Test brute force lockout
  - Test password strength enforcement
  - Penetration test login flow

---

## 📋 Security Best Practices Applied

✅ **Defense in Depth:** Multiple layers of security (rate limiting, brute force, RBAC, CSRF)  
✅ **Principle of Least Privilege:** Role-based permissions, granular access control  
✅ **Input Validation:** All inputs validated with whitelist approach  
✅ **Secure by Default:** Production configs enforce security (no dev fallbacks)  
✅ **Audit Logging:** All sensitive operations logged for compliance  
✅ **Error Handling:** Security-aware error messages (no information leakage)  
✅ **Encryption:** JWT tokens, passwords hashed with bcrypt, CSRF tokens  
✅ **Session Security:** HttpOnly, Secure, SameSite cookie flags  

---

## 🔗 Integration Points

### With Frontend Tests
The test suite should validate:
- Incorrect credentials trigger 429 after 5 attempts
- CSRF token included in state mutations
- Password change enforces strength requirements
- Role-based pages require authorization

### With Backend Tests
Add to `backend/tests/test_security_hardening.py`:
```python
def test_login_rate_limiting()
def test_account_lockout_after_failures()
def test_pin_brute_force_protection()
def test_password_strength_requirements()
def test_csrf_token_validation()
def test_rbac_enforcement()
```

---

## 📞 Support & Troubleshooting

### Common Issues

**Q: "JWT_SECRET_KEY not set in production" error**
- A: Set `JWT_SECRET_KEY` environment variable to a strong random 64-character string
- Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"`

**Q: "Account temporarily locked" on login**
- A: User has exceeded 5 failed login attempts. Wait 15 minutes or admin can unlock:
  ```python
  from app.security.brute_force_protection import BruteForceProtector
  BruteForceProtector.clear_failed_attempts("user@email.com")
  ```

**Q: Rate limiting not working**
- A: Verify RATELIMIT_ENABLED=true and RATELIMIT_STORAGE_URL configured correctly

**Q: CSRF validation failing**
- A: Verify X-CSRF-TOKEN header included in request and JWT_COOKIE_CSRF_PROTECT=true

---

## 📖 References

- [OWASP Top 10 2023](https://owasp.org/Top10/)
- [Flask Security Best Practices](https://flask.palletsprojects.com/en/latest/security/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Flask-JWT-Extended Docs](https://flask-jwt-extended.readthedocs.io/)
- [Flask-Limiter Docs](https://limits.readthedocs.io/)

---

**Implementation Date:** April 12, 2026  
**Status:** ✅ Complete and Production-Ready  
**Verification:** Run `python verify_security.py` to validate all features
