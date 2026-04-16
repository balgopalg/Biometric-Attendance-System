"""Centralized error tracking and reporting."""

import logging
import json
import traceback
from datetime import datetime, timezone
from flask import request, g, current_app, has_app_context
from pymongo.errors import PyMongoError


class ErrorTracker:
    """Centralized error tracking with MongoDB storage."""
    
    COLLECTION_NAME = "error_logs"
    
    @classmethod
    def track_error(cls, error, error_type="exception", user_id=None, context=None):
        """
        Track an error to MongoDB and return error ID for client response.
        
        Args:
            error: Exception object
            error_type: Type of error (exception, validation, auth, etc.)
            user_id: User ID if available
            context: Additional context dict
        
        Returns:
            error_id: Unique error ID for tracking
        """
        error_id = cls._generate_error_id()
        
        error_doc = {
            "_id": error_id,
            "type": error_type,
            "exception_type": type(error).__name__,
            "message": str(error),
            "traceback": traceback.format_exc(),
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            "user_id": user_id,
            "http": cls._extract_request_context(),
            "context": context or {},
        }
        
        try:
            from app.extensions import get_collection
            errors_collection = get_collection("audit", cls.COLLECTION_NAME)
            errors_collection.insert_one(error_doc)
        except Exception as e:
            logger = current_app.logger if has_app_context() else logging.getLogger(__name__)
            logger.error("Failed to track error to database: %s", e, exc_info=True)
        
        return error_id
    
    @classmethod
    def track_validation_error(cls, message, field=None, value=None, user_id=None):
        """Track input validation error."""
        error_id = cls._generate_error_id()
        
        error_doc = {
            "_id": error_id,
            "type": "validation_error",
            "exception_type": "ValidationError",
            "message": message,
            "field": field,
            "value": str(value)[:100] if value else None,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            "user_id": user_id,
            "http": cls._extract_request_context(),
        }
        
        try:
            from app.extensions import get_collection
            errors_collection = get_collection("audit", cls.COLLECTION_NAME)
            errors_collection.insert_one(error_doc)
        except Exception:
            pass  # nosec B110
        
        return error_id
    
    @classmethod
    def track_auth_error(cls, message, email=None):
        """Track authentication error."""
        error_id = cls._generate_error_id()
        
        error_doc = {
            "_id": error_id,
            "type": "auth_error",
            "exception_type": "AuthenticationError",
            "message": message,
            "email": email,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            "http": cls._extract_request_context(),
        }
        
        try:
            from app.extensions import get_collection
            errors_collection = get_collection("audit", cls.COLLECTION_NAME)
            errors_collection.insert_one(error_doc)
        except Exception:
            pass  # nosec B110
        
        return error_id
    
    @classmethod
    def _extract_request_context(cls):
        """Extract request context for error logging."""
        try:
            return {
                "method": request.method,
                "path": request.path,
                "remote_addr": request.remote_addr,
                "user_agent": request.headers.get("User-Agent", ""),
                "request_id": getattr(g, "request_id", None),
            }
        except (RuntimeError, AttributeError):
            return {}
    
    @classmethod
    def _generate_error_id(cls):
        """Generate unique error ID."""
        from bson import ObjectId
        return str(ObjectId())
    
    @classmethod
    def get_error(cls, error_id):
        """Retrieve error details by ID."""
        try:
            from app.extensions import get_collection
            errors_collection = get_collection("audit", cls.COLLECTION_NAME)
            return errors_collection.find_one({"_id": error_id})
        except Exception:
            return None
    
    @classmethod
    def get_recent_errors(cls, hours=24, limit=100):
        """Get recent errors from past N hours."""
        try:
            from datetime import timedelta
            from app.extensions import get_collection
            
            errors_collection = get_collection("audit", cls.COLLECTION_NAME)
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
            
            return list(errors_collection.find(
                {"timestamp": {"$gte": cutoff}}
            ).sort("timestamp", -1).limit(limit))
        except Exception:
            return []
    
    @classmethod
    def get_error_stats(cls, hours=24):
        """Get error statistics."""
        try:
            from datetime import timedelta
            from app.extensions import get_collection
            
            errors_collection = get_collection("audit", cls.COLLECTION_NAME)
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
            
            stats = list(errors_collection.aggregate([
                {"$match": {"timestamp": {"$gte": cutoff}}},
                {"$group": {
                    "_id": "$type",
                    "count": {"$sum": 1},
                    "latest": {"$max": "$timestamp"}
                }},
                {"$sort": {"count": -1}}
            ]))
            
            return stats
        except Exception:
            return []


class ErrorHandler:
    """Global error handler decorator and utilities."""
    
    @staticmethod
    def api_error_response(error, status_code=500, error_id=None):
        """Generate standardized error response."""
        return {
            "error": str(error),
            "error_id": error_id,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }, status_code
    
    @staticmethod
    def handle_exception(func):
        """Decorator to handle exceptions in route handlers."""
        from functools import wraps
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                user_id = getattr(g, 'current_user', {}).get('_id') if hasattr(g, 'current_user') else None
                error_id = ErrorTracker.track_error(e, user_id=user_id)
                
                from app.observability.logging import error_logger
                error_logger.error(f"Unhandled exception in {func.__name__}: {str(e)}", 
                                  error_id=error_id, 
                                  endpoint=func.__name__)
                
                return ErrorHandler.api_error_response(
                    "An unexpected error occurred",
                    status_code=500,
                    error_id=error_id
                )
        
        return wrapper


def register_error_handlers(app):
    """Register Flask error handlers."""
    
    @app.errorhandler(400)
    def bad_request(error):
        error_id = ErrorTracker.track_validation_error(
            str(error),
            user_id=getattr(g, 'current_user', {}).get('_id') if hasattr(g, 'current_user') else None
        )
        return ErrorHandler.api_error_response("Bad request", 400, error_id)
    
    @app.errorhandler(401)
    def unauthorized(error):
        return ErrorHandler.api_error_response("Unauthorized", 401)
    
    @app.errorhandler(403)
    def forbidden(error):
        return ErrorHandler.api_error_response("Forbidden", 403)
    
    @app.errorhandler(404)
    def not_found(error):
        return ErrorHandler.api_error_response("Not found", 404)
    
    @app.errorhandler(429)
    def rate_limited(error):
        return ErrorHandler.api_error_response("Too many requests", 429)
    
    @app.errorhandler(500)
    def internal_error(error):
        user_id = getattr(g, 'current_user', {}).get('_id') if hasattr(g, 'current_user') else None
        error_id = ErrorTracker.track_error(error, user_id=user_id)
        return ErrorHandler.api_error_response(
            "Internal server error",
            500,
            error_id
        )
    
    @app.errorhandler(PyMongoError)
    def handle_mongo_error(error):
        error_id = ErrorTracker.track_error(error, error_type="database")
        app.logger.error(f"MongoDB error: {str(error)}", extra={"error_id": error_id})
        return ErrorHandler.api_error_response(
            "Database error",
            500,
            error_id
        )
    
    @app.errorhandler(Exception)
    def handle_generic_exception(error):
        user_id = getattr(g, 'current_user', {}).get('_id') if hasattr(g, 'current_user') else None
        error_id = ErrorTracker.track_error(error, user_id=user_id)
        return ErrorHandler.api_error_response(
            "An unexpected error occurred",
            500,
            error_id
        )
