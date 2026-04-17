"""Brute-force protection and account lockout mechanisms."""

import time
from datetime import datetime, timedelta, timezone
from flask import current_app
from app.extensions import get_collection


class BruteForceProtector:
    """Tracks failed login attempts and implements account lockout."""

    FAILED_ATTEMPTS_COLLECTION = "failed_login_attempts"

    @classmethod
    def _login_lockout_threshold(cls):
        return int(current_app.config.get("LOGIN_LOCKOUT_THRESHOLD", 5))

    @classmethod
    def _login_lockout_duration_minutes(cls):
        return int(current_app.config.get("LOGIN_LOCKOUT_DURATION_MINUTES", 15))

    @classmethod
    def _login_attempt_window_minutes(cls):
        return int(current_app.config.get("LOGIN_ATTEMPT_WINDOW_MINUTES", 15))


    @classmethod
    def record_failed_attempt_atomic(cls, email, ip_address):
        """Atomically record a failed login attempt and check if account is now locked."""
        collection = get_collection("auth", cls.FAILED_ATTEMPTS_COLLECTION)
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=cls._login_attempt_window_minutes())
        threshold = cls._login_lockout_threshold()

        # Remove old attempts outside the window
        collection.delete_many({
            "email": email.lower(),
            "attempted_at": {"$lt": cutoff}
        })

        # Atomically insert and count attempts in the window
        doc = {
            "email": email.lower(),
            "ip_address": ip_address,
            "attempted_at": now,
            "ttl": now + timedelta(hours=1),
        }
        collection.insert_one(doc)

        failed_count = collection.count_documents({
            "email": email.lower(),
            "attempted_at": {"$gte": cutoff}
        })

        is_locked = False
        lockout_expiry = None
        if failed_count >= threshold:
            oldest_recent_attempt = collection.find_one(
                {
                    "email": email.lower(),
                    "attempted_at": {"$gte": cutoff}
                },
                sort=[("attempted_at", 1)]
            )
            if oldest_recent_attempt:
                lockout_expiry = oldest_recent_attempt["attempted_at"] + timedelta(minutes=cls._login_lockout_duration_minutes())
                if now < lockout_expiry:
                    is_locked = True
        return failed_count, is_locked, lockout_expiry

    @classmethod
    def get_failed_attempt_count(cls, email):
        """Get number of failed attempts in the current window."""
        collection = get_collection("auth", cls.FAILED_ATTEMPTS_COLLECTION)
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=cls._login_attempt_window_minutes())
        
        return collection.count_documents({
            "email": email.lower(),
            "attempted_at": {"$gte": cutoff}
        })

    @classmethod
    def is_account_locked(cls, email):
        """Check if account is locked due to failed attempts."""
        collection = get_collection("auth", cls.FAILED_ATTEMPTS_COLLECTION)
        now = datetime.now(timezone.utc)
        
        # Get recent failed attempts
        recent_cutoff = now - timedelta(minutes=cls._login_attempt_window_minutes())
        recent_query = {
            "email": email.lower(),
            "attempted_at": {"$gte": recent_cutoff}
        }
        failed_count = collection.count_documents(recent_query)
        
        if failed_count >= cls._login_lockout_threshold():
            # Base the lockout window on the active failure window, not stale records.
            oldest_recent_attempt = collection.find_one(
                recent_query,
                sort=[("attempted_at", 1)]
            )
            if oldest_recent_attempt:
                lockout_expiry = oldest_recent_attempt["attempted_at"] + timedelta(
                    minutes=cls._login_lockout_duration_minutes()
                )
                if now < lockout_expiry:
                    return True, lockout_expiry
        
        return False, None

    @classmethod
    def clear_failed_attempts(cls, email):
        """Clear failed attempts for a successful login."""
        collection = get_collection("auth", cls.FAILED_ATTEMPTS_COLLECTION)
        collection.delete_many({"email": email.lower()})

    @classmethod
    def record_pin_failure(cls, session_id, lecturer_id, ip_address, attempt_number=1):
        """Record a failed PIN entry attempt for a session."""
        collection = get_collection("attendance", "pin_failures")
        now = datetime.now(timezone.utc)
        
        collection.insert_one({
            "session_id": session_id,
            "lecturer_id": lecturer_id,
            "ip_address": ip_address,
            "attempt_number": attempt_number,
            "failed_at": now,
            "ttl": now + timedelta(hours=24),
        })
        
        # Count attempts in last 5 minutes
        cutoff = now - timedelta(minutes=5)
        return collection.count_documents({
            "session_id": session_id,
            "failed_at": {"$gte": cutoff}
        })

    @classmethod
    def is_session_pin_blocked(cls, session_id, max_attempts=3):
        """Check if PIN entry is blocked for a session (max 3 attempts in 5 min)."""
        collection = get_collection("attendance", "pin_failures")
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=5)
        
        attempt_count = collection.count_documents({
            "session_id": session_id,
            "failed_at": {"$gte": cutoff}
        })
        
        return attempt_count >= max_attempts, attempt_count

    @classmethod
    def clear_pin_failures(cls, session_id):
        """Clear PIN failures for a successful commit."""
        collection = get_collection("attendance", "pin_failures")
        collection.delete_many({"session_id": session_id})


class IPRateLimiter:
    """Track and rate-limit by IP address for additional protection."""

    COLLECTION_NAME = "ip_rate_limits"

    @classmethod
    def record_request(cls, ip_address, endpoint, weight=1):
        """Record a request from an IP to an endpoint."""
        collection = get_collection("auth", cls.COLLECTION_NAME)
        now = datetime.now(timezone.utc)
        
        collection.insert_one({
            "ip_address": ip_address,
            "endpoint": endpoint,
            "requested_at": now,
            "weight": weight,
            "ttl": now + timedelta(hours=1),
        })

    @classmethod
    def get_request_count(cls, ip_address, endpoint, window_minutes=10):
        """Get request count from IP to endpoint in time window."""
        collection = get_collection("auth", cls.COLLECTION_NAME)
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=window_minutes)

        # Primary path for MongoDB collections.
        if hasattr(collection, "aggregate"):
            result = collection.aggregate([
                {
                    "$match": {
                        "ip_address": ip_address,
                        "endpoint": endpoint,
                        "requested_at": {"$gte": cutoff}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total_weight": {"$sum": "$weight"}
                    }
                }
            ])

            results = list(result)
            return results[0]["total_weight"] if results else 0

        # Compatibility path for in-memory test doubles that expose raw docs.
        docs = getattr(collection, "docs", [])
        total = 0
        for doc in docs:
            if doc.get("ip_address") != ip_address or doc.get("endpoint") != endpoint:
                continue
            requested_at = doc.get("requested_at")
            if requested_at and requested_at >= cutoff:
                total += int(doc.get("weight", 1))
        return total

    @classmethod
    def is_ip_blocked(cls, ip_address, endpoint, threshold=50, window_minutes=10):
        """Check if IP is blocked for excessive requests."""
        count = cls.get_request_count(ip_address, endpoint, window_minutes)
        return count >= threshold
