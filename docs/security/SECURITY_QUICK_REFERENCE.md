# Security Hardening - Quick Reference

## ✅ 5 Security Areas Hardened

### 1️⃣ Rate Limiting
**What:** Limit requests to prevent abuse  
**Where:** Login (20/min), Password change (10/min), Enrollments (20/min)  
**Files:** `app/security/rate_limiter.py`  
**Config:** `RATELIMIT_ENABLED=true`

### 2️⃣ Brute-Force Protection  
**What:** Account lockout + IP tracking  
**Details:** 5 fails = 15-min lockout | 3 PIN fails = 5-min session block  
**Files:** `app/security/brute_force_protection.py`  
**Config:** `BRUTE_FORCE_PROTECTION_ENABLED=true`

### 3️⃣ Strong Secrets
**What:** Enforce production JWT secrets  
**Details:** 64+ char random string, no dev fallback in prod  
**Files:** `app/config.py`  
**Config:** `JWT_SECRET_KEY=<64-char-random>`

### 4️⃣ CSRF Protection
**What:** Prevent cross-site request forgery  
**Details:** X-CSRF-TOKEN header, SameSite cookies  
**Files:** `app/__init__.py`, `app/routes/auth.py`  
**Config:** `JWT_COOKIE_CSRF_PROTECT=true`

### 5️⃣ Role-Based Access Control + Input Validation
**What:** Enforce permissions + validate all inputs  
**Details:** @role_required, @permission_required decorators | Email/PIN/password validation  
**Files:** `app/security/access_control.py`, `app/utils/validation.py`  
**Config:** Role permissions matrix + password policy

---

## 🔐 New Files Created

| File | Purpose |
|------|---------|
| `app/security/rate_limiter.py` | Rate limiting configuration |
| `app/security/brute_force_protection.py` | Login lockout, PIN protection, IP tracking |
| `app/security/access_control.py` | RBAC decorators (@role_required, @permission_required) |
| `app/utils/validation.py` | Input validation (email, password, PIN, role, etc.) |
| `/docs/security/SECURITY_HARDENING.md` | Comprehensive security guide |
| `/docs/security/SECURITY_IMPLEMENTATION_SUMMARY.md` | Implementation details |
| `backend/.env.example` | Backend environment variable template |
| `verify_security.py` | Verification script to test all features |

---

## ⚡ Quick Setup

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
# Includes new: Flask-Limiter==3.5.0
```

### 2. Configure Environment
```bash
# Copy template
cp backend/.env.example backend/.env

# Edit with production values
# Set JWT_SECRET_KEY to 64-char random string
# Set Flask_ENV=production
# Restrict CORS_ORIGINS to your domain
```

### 3. Verify Installation
```bash
cd backend
python ../verify_security.py

# Expected: 25+ checks passing
```

### 4. Test Features
```bash
# Try login rate limiting (20 per minute)
for i in {1..21}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test"}'
done
# 21st request should return 429

# Try brute force (5 fails = lockout for 15 min)
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"user@test.com","password":"wrong"}'
done
# 6th request should return 429 with lockout message
```

---

## 📋 Configuration Variables

```
# Rate Limiting
RATELIMIT_ENABLED=true
RATELIMIT_STORAGE_URL=memory://  (use redis://localhost:6379 for distributed)

# Brute Force
BRUTE_FORCE_PROTECTION_ENABLED=true
LOGIN_LOCKOUT_THRESHOLD=5
LOGIN_LOCKOUT_DURATION_MINUTES=15
PIN_MAX_ATTEMPTS=3

# Password Policy
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_DIGITS=true
PASSWORD_REQUIRE_SPECIAL=true

# CSRF
JWT_COOKIE_CSRF_PROTECT=true
JWT_COOKIE_SAMESITE=Strict

# JWT Secret (CRITICAL for production)
JWT_SECRET_KEY=dev-secret-OR-64-char-random-in-prod
STRICT_JWT_SECRET=true
```

---

## 🛡️ Security Features By Endpoint

### `/api/auth/login`
- ✅ Rate limited: 20 per minute per IP
- ✅ Brute force protected: Lockout after 5 failures
- ✅ IP rate limited: Block after 100 requests in 10 min
- ✅ Email validated
- ✅ Audit logged
- ✅ CSRF checked before response

### `/api/auth/change-password`
- ✅ Rate limited: 10 per minute
- ✅ JWT required
- ✅ CSRF token required
- ✅ Password strength validated (12 chars, upper, lower, digit, special)
- ✅ Audit logged

### `/api/lecturer/session/commit`
- ✅ Rate limited: 30 per minute
- ✅ PIN brute force protected (3 attempts per 5 min)
- ✅ Role required: lecturer
- ✅ Permission required: commit_with_pin
- ✅ CSRF token required
- ✅ Sensitive operation audited

### `/api/admin/students/enroll`
- ✅ Rate limited: 20 per minute
- ✅ Role required: admin
- ✅ Permission required: enroll_students
- ✅ CSRF token required
- ✅ Sensitive operation audited
- ✅ File upload validation

### `/api/admin/audit-logs/{id}/rollback`
- ✅ Role required: admin
- ✅ Permission required: rollback_operations
- ✅ Sensitive operation audited (automatic)
- ✅ CSRF token required

---

## 🔍 Monitoring

### Check Failed Logins (MongoDB)
```javascript
db.failed_login_attempts.find().count()
// or group by email
db.failed_login_attempts.aggregate([
  {$group: {_id: "$email", attempts: {$sum: 1}}},
  {$sort: {attempts: -1}}
])
```

### Check IP Attacks
```javascript
db.ip_rate_limits.aggregate([
  {$match: {requested_at: {$gte: ISODate("2026-04-12T00:00:00Z")}}},
  {$group: {_id: "$ip_address", requests: {$sum: "$weight"}}},
  {$sort: {requests: -1}},
  {$limit: 10}
])
```

### Check Audit Log
```javascript
db.audit_logs.find({action: "login_failed"}).limit(10)
db.audit_logs.find({action: "admin.rollback"}).limit(10)
```

---

## 🚨 Alerts to Set Up

| Alert | Condition | Action |
|-------|-----------|--------|
| **Brute Force Attack** | 10+ failed logins/1min from single IP | Block IP, notify admin |
| **Account Lockout** | 5 failed attempts in 15 min | Notify user, unlock after 15 min |
| **Unusual PIN Attempts** | 3+ failed PINs in 5 min | Block session, notify lecturer |
| **Admin Action** | Rollback/delete/reset performed | Notify security team |
| **Rate Limit Exceeded** | 429 responses from endpoint | Log and monitor |

---

## 🔓 Unlock Locked Account (Admin)

```python
from app.security.brute_force_protection import BruteForceProtector

# Clear failed login attempts
BruteForceProtector.clear_failed_attempts("user@email.com")
print("Account unlocked")

# Verify
is_locked, expires = BruteForceProtector.is_account_locked("user@email.com")
print(f"Locked: {is_locked}")
```

---

## 🧪 Test Scenarios

### Scenario 1: Brute Force Login
```bash
# 5+ failed attempts in 1 minute
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"attacker@test.com","password":"wrong"}'
# Should return 429 on 6th attempt
```

### Scenario 2: Strong Password Requirement
```bash
curl -X POST http://localhost/api/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"old","new_password":"weak","confirm_password":"weak"}'

# Response: Password must have 12 chars, upper, lower, digit, special
```

### Scenario 3: CSRF Protection
```bash
# Request without CSRF token should fail
curl -X POST http://localhost/api/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"old","new_password":"Strong!Pass123","confirm_password":"Strong!Pass123"}'

# With token (extracted from response/cookies):
curl -X POST http://localhost/api/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "X-CSRF-TOKEN: <csrf-token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"old","new_password":"Strong!Pass123","confirm_password":"Strong!Pass123"}'
```

### Scenario 4: Role-Based Access
```bash
# Student tries admin endpoint (should return 403)
curl -X GET http://localhost/api/admin/stats \
  -H "Authorization: Bearer <student-token>"
# Response: 403 Access denied
```

---

## 📌 Remember

1. **Secrets:** Never commit `.env` with real secrets to Git
2. **Production:** Always set strong `JWT_SECRET_KEY` (64+ chars)
3. **HTTPS:** Deployment must use HTTPS (JWT_COOKIE_SECURE=true)
4. **CORS:** Whitelist only your frontend domain
5. **Monitoring:** Review audit logs and failed login attempts regularly
6. **Testing:** Run `verify_security.py` before deploying
7. **Lockouts:** Track account lockouts and help unlock legitimate users

---

## 📞 Quick Commands

```bash
# Verify security
python verify_security.py

# Install dependencies
pip install -r requirements.txt

# Run backend with security
FLASK_ENV=production python run.py

# Check JWT secret strength
python -c "import secrets; print(secrets.token_urlsafe(64))"

# View MongoDB security collections
# In MongoDB client:
# db.failed_login_attempts.find()
# db.pin_failures.find()
# db.ip_rate_limits.find()
```

---

**Status:** ✅ Production Ready  
**Last Updated:** April 12, 2026
