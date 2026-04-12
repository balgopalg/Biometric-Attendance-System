"""Structured logging configuration and utilities."""

import json
import logging
import sys
import traceback
from datetime import datetime
from flask import request, g
from pythonjsonlogger import jsonlogger


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter with additional fields."""
    
    def add_fields(self, log_record, record, message_dict):
        super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)
        
        # Add standard fields
        log_record['timestamp'] = datetime.utcnow().isoformat()
        log_record['level'] = record.levelname
        log_record['logger'] = record.name
        
        # Add request context if available
        if hasattr(g, 'request_id'):
            log_record['request_id'] = g.request_id
        
        if request:
            log_record['http'] = {
                'method': request.method,
                'path': request.path,
                'remote_addr': request.remote_addr,
                'user_agent': request.headers.get('User-Agent', ''),
            }
        
        # Add exception info if present
        if record.exc_info:
            log_record['exception'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'traceback': traceback.format_exception(*record.exc_info),
            }


class StructuredLogger:
    """Wrapper for structured logging with context."""
    
    def __init__(self, logger_name):
        self.logger = logging.getLogger(logger_name)
        self._context = {}
    
    def set_context(self, **kwargs):
        """Set additional context fields."""
        self._context.update(kwargs)
    
    def clear_context(self):
        """Clear context fields."""
        self._context = {}
    
    def _log(self, level, message, **kwargs):
        """Log with merged context."""
        merged_data = {**self._context, **kwargs}
        
        if merged_data:
            # Log with extra data encoded in message for JSON formatter
            log_message = json.dumps({
                'message': message,
                **merged_data
            })
        else:
            log_message = message
        
        getattr(self.logger, level)(log_message)
    
    def debug(self, message, **kwargs):
        """Log debug level."""
        self._log('debug', message, **kwargs)
    
    def info(self, message, **kwargs):
        """Log info level."""
        self._log('info', message, **kwargs)
    
    def warning(self, message, **kwargs):
        """Log warning level."""
        self._log('warning', message, **kwargs)
    
    def error(self, message, **kwargs):
        """Log error level."""
        self._log('error', message, **kwargs)
    
    def critical(self, message, **kwargs):
        """Log critical level."""
        self._log('critical', message, **kwargs)


def configure_logging(app, log_level='INFO'):
    """Configure structured JSON logging for Flask app."""
    
    # Remove default handlers
    app.logger.handlers.clear()
    
    # Console handler with JSON formatter
    console_handler = logging.StreamHandler(sys.stdout)
    json_formatter = CustomJsonFormatter()
    console_handler.setFormatter(json_formatter)
    
    # Add request ID logging middleware
    @app.before_request
    def add_request_context():
        import uuid
        g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
        g.request_started_at = datetime.utcnow()
    
    # Set up app logger
    app.logger.addHandler(console_handler)
    app.logger.setLevel(logging.getLevelName(log_level))
    
    # Disable default Flask logging
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    
    # Add correlationId/request_id to logs
    @app.after_request
    def log_request_summary(response):
        if hasattr(g, 'request_started_at') and isinstance(g.request_started_at, datetime):
            duration_ms = (datetime.utcnow() - g.request_started_at).total_seconds() * 1000
            app.logger.info('request_complete', extra={
                'status_code': response.status_code,
                'duration_ms': round(duration_ms, 2),
                'request_id': getattr(g, 'request_id', 'unknown'),
                'method': request.method,
                'path': request.path,
            })
        return response
    
    return app.logger


# Global logger instances
auth_logger = StructuredLogger('app.auth')
db_logger = StructuredLogger('app.database')
attendance_logger = StructuredLogger('app.attendance')
admin_logger = StructuredLogger('app.admin')
error_logger = StructuredLogger('app.errors')
