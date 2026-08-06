# Security Policy

## Project Status

This Biometric Attendance System is a proprietary, closed-source application. It is not intended for public deployment without appropriate enterprise configuration and network isolation.

Because this is a closed ecosystem, active security patches are managed internally. The source code is maintained solely for authorized users and reviewers.

## Security Controls Implemented

The system implements several industry-standard security measures to ensure robust protection of biometric and academic data:

- **Authentication**: JWT tokens stored in HttpOnly, Secure, SameSite cookies
- **CSRF Protection**: Double-submit cookie pattern with `X-CSRF-TOKEN` header
- **Password Security**: bcrypt hashing with minimum 12-character complexity requirements
- **Rate Limiting**: Flask-Limiter on all authentication and recognition endpoints
- **Brute Force Protection**: Account lockout after configurable failed attempts
- **Input Validation**: `validate_object_id()` and `sanitize_string()` on all user inputs
- **Biometric Data**: Face embeddings encrypted at rest using Fernet symmetric encryption
- **Database**: MongoDB authentication enabled; connections restricted to `127.0.0.1` in production
- **Token Revocation**: Logout revokes JWT; `revoked_jwts` collection with TTL index auto-cleanup

For full implementation details, see the [Security Hardening Guide](docs/security/SECURITY_HARDENING.md).

## Reporting a Vulnerability

As this system is a closed-source deployment, there is no public vulnerability disclosure program. Authorized reviewers and internal stakeholders should report any findings directly to the project maintainers via established internal communication channels.
