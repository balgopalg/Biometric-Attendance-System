#!/usr/bin/env python3
"""
Security Hardening Verification Script

Runs checks to verify all security hardening features are properly configured
and functional in a running application.
"""

import sys
import os
import json
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.config import Config
from app.security.brute_force_protection import BruteForceProtector, IPRateLimiter
from app.utils import TerminalMessenger
from app.utils.validation import (
    validate_email,
    validate_password_strength,
    validate_pin,
    validate_role,
)


class SecurityVerifier:
    """Verify security hardening implementation."""
    
    def __init__(self):
        self.msg = TerminalMessenger()
        self.results = {
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {},
            "passed": 0,
            "failed": 0,
            "warnings": 0,
        }
    
    def check(self, name, condition, message=""):
        """Log a check result."""
        status = "PASS" if condition else "FAIL"
        self.results["checks"][name] = {
            "status": status,
            "message": message,
        }
        
        if condition:
            self.results["passed"] += 1
            self.msg.check(name, True)
        else:
            self.results["failed"] += 1
            self.msg.check(name, False, details=message)
    
    def warning(self, name, message):
        """Log a warning."""
        self.results["checks"][name] = {
            "status": "WARNING",
            "message": message,
        }
        self.results["warnings"] += 1
        self.msg.warning(f"{name} | {message}")
    
    def verify_all(self):
        """Run all verification checks."""
        self.msg.banner("Security Hardening Verification")
        
        self.verify_config()
        self.verify_rate_limiting()
        self.verify_brute_force_protection()
        self.verify_password_validation()
        self.verify_input_validation()

        self.msg.summary(
            "Security hardening verification",
            passed=self.results["passed"],
            failed=self.results["failed"],
            warnings=self.results["warnings"],
        )
        self.msg.final_status(
            ok=self.results["failed"] == 0,
            success_message="Security verification passed.",
            failure_message="Security verification failed.",
        )
        
        return self.results
    
    def verify_config(self):
        """Verify configuration settings."""
        self.msg.section("Configuration")
        local_envs = {"development", "dev", "local", "testing", "test"}
        current_env = str(getattr(Config, "ENV", "development") or "development").lower()
        
        # JWT Secret
        secret = Config.JWT_SECRET_KEY
        self.check(
            "JWT Secret set",
            secret != "dev-only-change-this-secret",
            "Using default dev secret"
        )
        
        self.check(
            "JWT Secret strong (32+ chars)",
            len(secret) >= 32,
            f"Secret is {len(secret)} characters, minimum 32 required"
        )
        
        # CSRF Protection
        self.check(
            "CSRF Protection enabled",
            Config.JWT_COOKIE_CSRF_PROTECT,
            "CSRF protection should be enabled"
        )
        
        # Cookie Security
        if current_env in local_envs:
            self.warning(
                "Secure cookies configured",
                f"JWT_COOKIE_SECURE={Config.JWT_COOKIE_SECURE} accepted for local env '{current_env}'",
            )
        else:
            self.check(
                "Secure cookies configured",
                Config.JWT_COOKIE_SECURE,
                "JWT_COOKIE_SECURE should be True in production"
            )
        
        # SameSite
        self.check(
            "SameSite cookie policy set",
            Config.JWT_COOKIE_SAMESITE in {"Lax", "Strict"},
            f"SameSite is {Config.JWT_COOKIE_SAMESITE}, should be Lax or Strict"
        )
        
        # Audit logging
        self.check(
            "Audit logging enabled",
            Config.AUDIT_LOGGING_ENABLED,
            "Audit logging should be enabled"
        )
        
        # Rate limiting
        self.check(
            "Rate limiting enabled",
            Config.RATELIMIT_ENABLED,
            "Rate limiting should be enabled"
        )
        
        # Brute force protection
        self.check(
            "Brute force protection enabled",
            Config.BRUTE_FORCE_PROTECTION_ENABLED,
            "Brute force protection should be enabled"
        )
    
    def verify_rate_limiting(self):
        """Verify rate limiting is configured."""
        self.msg.section("Rate Limiting")
        
        try:
            from app.security.rate_limiter import limiter, RATE_LIMITS
            
            self.check(
                "Rate limiter initialized",
                limiter is not None,
                "Rate limiter not properly initialized"
            )
            
            expected_limits = ["auth.login", "auth.change_password", "lecturer.commit_session"]
            for endpoint in expected_limits:
                self.check(
                    f"Rate limit for {endpoint}",
                    endpoint in RATE_LIMITS,
                    f"Endpoint {endpoint} missing rate limit"
                )
        except Exception as e:
            self.check("Rate limiter import", False, str(e))
    
    def verify_brute_force_protection(self):
        """Verify brute force protection mechanisms."""
        self.msg.section("Brute Force Protection")
        
        config_checks = [
            ("LOGIN_LOCKOUT_THRESHOLD", Config.LOGIN_LOCKOUT_THRESHOLD, 5),
            ("LOGIN_LOCKOUT_DURATION_MINUTES", Config.LOGIN_LOCKOUT_DURATION_MINUTES, 15),
            ("PIN_MAX_ATTEMPTS", Config.PIN_MAX_ATTEMPTS, 3),
        ]
        
        for config_name, actual, expected in config_checks:
            self.check(
                f"{config_name} configured",
                actual == expected,
                f"Value is {actual}, expected {expected}"
            )
        
        # Check BruteForceProtector class
        self.check(
            "BruteForceProtector has record_failed_attempt",
            hasattr(BruteForceProtector, 'record_failed_attempt'),
            "Missing record_failed_attempt method"
        )
        
        self.check(
            "BruteForceProtector has is_account_locked",
            hasattr(BruteForceProtector, 'is_account_locked'),
            "Missing is_account_locked method"
        )
        
        self.check(
            "IPRateLimiter has is_ip_blocked",
            hasattr(IPRateLimiter, 'is_ip_blocked'),
            "Missing is_ip_blocked method"
        )
    
    def verify_password_validation(self):
        """Verify password strength validation."""
        self.msg.section("Password Validation")
        
        # Test weak passwords
        weak_passwords = [
            "password",           # No uppercase, no special
            "PASSWORD",           # No lowercase, no digit
            "Pass123",            # Too short
            "Passw0rd",           # No special char
        ]
        
        for weak_pw in weak_passwords:
            is_strong, msg = validate_password_strength(weak_pw)
            self.check(
                f"Reject weak password '{weak_pw}'",
                not is_strong,
                f"Should be weak but passed: {msg}"
            )
        
        # Test strong password
        strong_password = "MySecure!Pass123"
        is_strong, msg = validate_password_strength(strong_password)
        self.check(
            f"Accept strong password",
            is_strong,
            f"Should be strong but failed: {msg}"
        )
        
        # Check configuration
        self.check(
            "Password min length enforced",
            Config.PASSWORD_MIN_LENGTH >= 12,
            f"Min length is {Config.PASSWORD_MIN_LENGTH}, should be 12+"
        )
        
        self.check(
            "Password uppercase required",
            Config.PASSWORD_REQUIRE_UPPERCASE,
            "Should require uppercase"
        )
        
        self.check(
            "Password lowercase required",
            Config.PASSWORD_REQUIRE_LOWERCASE,
            "Should require lowercase"
        )
        
        self.check(
            "Password digits required",
            Config.PASSWORD_REQUIRE_DIGITS,
            "Should require digits"
        )
        
        self.check(
            "Password special chars required",
            Config.PASSWORD_REQUIRE_SPECIAL,
            "Should require special characters"
        )
    
    def verify_input_validation(self):
        """Verify input validation functions."""
        self.msg.section("Input Validation")
        
        # Email validation
        valid_emails = ["user@example.com", "admin@system.co.uk"]
        for email in valid_emails:
            self.check(
                f"Accept valid email '{email}'",
                validate_email(email),
                "Valid email rejected"
            )
        
        invalid_emails = ["user@", "@example.com", "invalid"]
        for email in invalid_emails:
            self.check(
                f"Reject invalid email '{email}'",
                not validate_email(email),
                "Invalid email accepted"
            )
        
        # PIN validation
        valid_pins = ["1234", "123456", 1234, "000000"]
        for pin in valid_pins:
            self.check(
                f"Accept valid PIN '{pin}'",
                validate_pin(pin),
                "Valid PIN rejected"
            )
        
        invalid_pins = ["123", "1234567", "12ab", ""]
        for pin in invalid_pins:
            self.check(
                f"Reject invalid PIN '{pin}'",
                not validate_pin(pin),
                "Invalid PIN accepted"
            )
        
        # Role validation
        valid_roles = ["admin", "lecturer", "student"]
        for role in valid_roles:
            self.check(
                f"Accept valid role '{role}'",
                validate_role(role),
                "Valid role rejected"
            )
        
        invalid_roles = ["superuser", "guest", "invalid"]
        for role in invalid_roles:
            self.check(
                f"Reject invalid role '{role}'",
                not validate_role(role),
                "Invalid role accepted"
            )
    
    def save_results(self, filepath="security_verification_results.json"):
        """Save verification results to JSON file."""
        with open(filepath, 'w') as f:
            json.dump(self.results, f, indent=2)
        self.msg.info(f"Results saved to {filepath}")


def main():
    """Run verification."""
    verifier = SecurityVerifier()
    results = verifier.verify_all()
    verifier.save_results()
    
    # Exit with appropriate code
    if results["failed"] > 0:
        sys.exit(1)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        TerminalMessenger(stream=sys.stderr).error(f"Unhandled error: {e}")
        sys.exit(2)
