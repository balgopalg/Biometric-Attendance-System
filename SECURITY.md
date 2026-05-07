# Security Policy

## Supported Versions

Security updates are provided for the active production branch and the latest release tags.

| Version | Supported |
|---|---|
| Latest `main` | ✅ Active |
| Latest `develop` | ✅ Active |
| Older releases | ❌ Best-effort only |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

- **Email**: security@localhost.invalid
- **Include**: affected component, impact assessment, reproduction steps, and logs/screenshots if available.
- **Do not** open public issues for sensitive vulnerabilities.

## Response Targets

| Stage | Target |
|---|---|
| Initial acknowledgement | Within 3 business days |
| Triage decision | Within 7 business days |
| Remediation timeline | Based on severity and exploitability |

## Security Controls Implemented

This project implements the following security measures. For full details, see the [Security Hardening Guide](docs/security/SECURITY_HARDENING.md).

- **Authentication**: JWT tokens stored in HttpOnly, Secure, SameSite cookies
- **CSRF Protection**: Double-submit cookie pattern with `X-CSRF-TOKEN` header
- **Password Security**: bcrypt hashing with minimum 12-character complexity requirements
- **Rate Limiting**: Flask-Limiter on all authentication and recognition endpoints
- **Brute Force Protection**: Account lockout after configurable failed attempts
- **Input Validation**: `validate_object_id()` and `sanitize_string()` on all user inputs
- **Biometric Data**: Face embeddings encrypted at rest using Fernet symmetric encryption
- **Database**: MongoDB authentication enabled; connections restricted to `127.0.0.1` in production
- **Token Revocation**: Logout revokes JWT; `revoked_jwts` collection with TTL index auto-cleanup

## Disclosure

After a fix is available and users have had time to patch, coordinated public disclosure may be made.
