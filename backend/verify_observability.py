#!/usr/bin/env python
"""Verify observability implementation."""

import sys
from app.utils import TerminalMessenger


MSG = TerminalMessenger()

def test_logging():
    """Test structured logging configuration."""
    MSG.section("Structured Logging")
    
    try:
        from app.observability.logging import (
            configure_logging,
            StructuredLogger,
            auth_logger,
            db_logger,
        )
        from flask import Flask
        
        app = Flask(__name__)
        app.config['LOGGING_LEVEL'] = 'INFO'
        
        # Test logger initialization
        logger = configure_logging(app, log_level='INFO')
        MSG.success("Logging initialization successful")
        
        # Test structured logger creation
        test_logger = StructuredLogger('test.logging')
        MSG.success("StructuredLogger instantiation successful")
        
        # Test pre-configured loggers
        assert auth_logger is not None
        assert db_logger is not None
        MSG.success("Pre-configured loggers available")
        
        # Test context setting
        auth_logger.set_context(user_id='test123')
        MSG.success("Context management working")
        
        MSG.check("Logging", True)
        return True
        
    except Exception as e:
        MSG.check("Logging", False, details=str(e))
        return False


def test_error_tracking():
    """Test error tracking functionality."""
    MSG.section("Error Tracking")
    
    try:
        from app.observability.error_tracking import (
            ErrorTracker,
            ErrorHandler,
            register_error_handlers,
        )
        from flask import Flask
        
        app = Flask(__name__)
        
        # Test error handler registration
        register_error_handlers(app)
        MSG.success("Error handlers registered")
        
        # Test ErrorTracker methods exist
        assert hasattr(ErrorTracker, 'track_error')
        assert hasattr(ErrorTracker, 'track_validation_error')
        assert hasattr(ErrorTracker, 'track_auth_error')
        assert hasattr(ErrorTracker, 'get_error')
        assert hasattr(ErrorTracker, 'get_recent_errors')
        assert hasattr(ErrorTracker, 'get_error_stats')
        MSG.success("ErrorTracker methods available")
        
        # Test ErrorHandler utilities
        response, status = ErrorHandler.api_error_response(
            "Test error",
            status_code=400,
            error_id="test-error-id"
        )
        assert response['error'] == "Test error"
        assert response['error_id'] == "test-error-id"
        assert status == 400
        MSG.success("ErrorHandler response generation working")
        
        MSG.check("Error Tracking", True)
        return True
        
    except Exception as e:
        MSG.check("Error Tracking", False, details=str(e))
        return False


def test_metrics():
    """Test metrics collection."""
    MSG.section("Metrics Collection")
    
    try:
        from app.observability.metrics import (
            MetricsCollector,
            MetricsSnapshot,
            register_metrics_middleware,
            http_requests_total,
            http_request_duration_seconds,
            auth_attempts_total,
            errors_total,
        )
        from flask import Flask
        
        app = Flask(__name__)
        
        # Test metrics middleware registration
        register_metrics_middleware(app)
        MSG.success("Metrics middleware registered")
        
        # Test metric recording methods
        MetricsCollector.record_http_request(
            method='GET',
            endpoint='test.endpoint',
            status_code=200,
            duration_seconds=0.123
        )
        MSG.success("HTTP request metrics recorded")
        
        MetricsCollector.record_auth_attempt(success=True)
        MSG.success("Auth attempt metrics recorded")
        
        MetricsCollector.record_error('TestError', 500)
        MSG.success("Error metrics recorded")
        
        MetricsCollector.record_db_operation('find', 'users', 0.05)
        MSG.success("Database operation metrics recorded")
        
        MetricsCollector.set_active_sessions(10)
        MSG.success("Active sessions gauge set")
        
        # Test metrics retrieval
        metrics_text = MetricsCollector.get_metrics()
        assert isinstance(metrics_text, bytes)
        assert b'http_requests_total' in metrics_text
        MSG.success("Metrics export working")
        
        # Test metrics snapshot
        snapshot = MetricsSnapshot.get_system_metrics()
        assert 'timestamp' in snapshot
        MSG.success("Metrics snapshot generation working")
        
        MSG.check("Metrics Collection", True)
        return True
        
    except Exception as e:
        MSG.check("Metrics Collection", False, details=str(e))
        return False


def test_health_checks():
    """Test health checking endpoints."""
    MSG.section("Health Checks")
    
    try:
        from app.observability.health import (
            HealthChecker,
            health_bp,
        )
        
        # Test HealthChecker methods exist
        assert hasattr(HealthChecker, 'check_database')
        assert hasattr(HealthChecker, 'check_redis')
        assert hasattr(HealthChecker, 'check_queue')
        assert hasattr(HealthChecker, 'check_storage')
        assert hasattr(HealthChecker, 'check_all')
        MSG.success("HealthChecker methods available")
        
        # Test health blueprint exists
        assert health_bp is not None
        assert health_bp.name == 'health'
        MSG.success("Health check blueprint registered")
        
        # Test health check structure
        all_checks = HealthChecker.check_all()
        assert 'status' in all_checks
        assert 'timestamp' in all_checks
        assert 'checks' in all_checks
        assert isinstance(all_checks['checks'], dict)
        MSG.success("Health check structure valid")
        
        # Test check categories
        checks = all_checks['checks']
        expected_checks = ['database', 'redis', 'queue', 'storage']
        for check in expected_checks:
            assert check in checks, f"Missing check: {check}"
        MSG.success(f"All check categories present: {list(checks.keys())}")
        
        MSG.check("Health Checks", True)
        return True
        
    except Exception as e:
        MSG.check("Health Checks", False, details=str(e))
        return False


def test_configuration():
    """Test observability configuration variables."""
    MSG.section("Configuration")
    
    try:
        from app.config import Config
        
        # Check logging config
        assert hasattr(Config, 'LOGGING_LEVEL')
        assert hasattr(Config, 'LOGGING_FORMAT')
        MSG.success("Logging configuration variables present")
        
        # Check error tracking config
        assert hasattr(Config, 'ERROR_TRACKING_ENABLED')
        assert hasattr(Config, 'SENTRY_DSN')
        assert hasattr(Config, 'SENTRY_SAMPLE_RATE')
        assert hasattr(Config, 'SENTRY_TRACES_SAMPLE_RATE')
        MSG.success("Error tracking configuration variables present")
        
        # Check metrics config
        assert hasattr(Config, 'METRICS_ENABLED')
        assert hasattr(Config, 'METRICS_PORT')
        MSG.success("Metrics configuration variables present")
        
        # Check health check config
        assert hasattr(Config, 'HEALTH_CHECK_ENABLED')
        MSG.success("Health check configuration variables present")
        
        # Verify values are reasonable
        assert isinstance(Config.LOGGING_LEVEL, str)
        assert Config.LOGGING_LEVEL in {'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'}
        MSG.success(f"LOGGING_LEVEL valid: {Config.LOGGING_LEVEL}")
        
        assert isinstance(Config.METRICS_ENABLED, bool)
        MSG.success(f"METRICS_ENABLED valid: {Config.METRICS_ENABLED}")
        
        MSG.check("Configuration", True)
        return True
        
    except Exception as e:
        MSG.check("Configuration", False, details=str(e))
        return False


def test_flask_integration():
    """Test Flask app integration."""
    MSG.section("Flask Integration")
    
    try:
        from app import create_app
        
        # Create app with observability
        app = create_app(seed_default_admin=False)
        MSG.success("App created with observability initialized")
        
        # Check that health endpoints are registered
        routes = [str(rule) for rule in app.url_map.iter_rules()]
        health_routes = [r for r in routes if 'health' in r]
        assert len(health_routes) > 0
        MSG.success(f"Health endpoints registered: {len(health_routes)} routes")
        
        # Check that error handlers are registered
        error_handlers = app.error_handler_spec.get(None, {})
        assert len(error_handlers) > 0
        MSG.success(f"Error handlers registered: {len(error_handlers)} handlers")
        
        # Run request hooks so request_id is populated by before_request middleware.
        with app.test_request_context('/api/test', method='GET'):
            app.preprocess_request()
            from flask import g
            assert hasattr(g, 'request_id'), "request_id missing; before_request middleware did not run"
            MSG.success("Request ID automatically generated in context")
        
        MSG.check("Flask Integration", True)
        return True
        
    except Exception as e:
        MSG.check("Flask Integration", False, details=str(e))
        return False


def test_dependencies():
    """Test that all required dependencies are installed."""
    MSG.section("Dependencies")
    
    dependencies = {
        'pythonjsonlogger': 'python-json-logger',
        'prometheus_client': 'prometheus-client',
        'sentry_sdk': 'sentry-sdk',
    }
    
    all_installed = True
    for import_name, package_name in dependencies.items():
        try:
            __import__(import_name)
            MSG.success(f"{package_name} installed")
        except ImportError:
            MSG.check(f"{package_name} installed", False, details="missing")
            all_installed = False
    
    if all_installed:
        MSG.check("Dependencies", True)
    else:
        MSG.check("Dependencies", False, details="Install missing packages")
    
    return all_installed


def main():
    """Run all verification tests."""
    MSG.banner("Observability Verification Suite")
    
    results = {
        'Dependencies': test_dependencies(),
        'Configuration': test_configuration(),
        'Logging': test_logging(),
        'Error Tracking': test_error_tracking(),
        'Metrics Collection': test_metrics(),
        'Health Checks': test_health_checks(),
        'Flask Integration': test_flask_integration(),
    }
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)

    MSG.section("Verification Summary")
    for test_name, passed_test in results.items():
        MSG.check(test_name, passed_test)

    MSG.summary(
        "Observability verification",
        passed=passed,
        failed=total - passed,
        warnings=0,
    )
    
    if passed == total:
        MSG.final_status(True, "All observability tests passed.", "")
        MSG.info("Observability implementation is ready for deployment.")
        return 0
    else:
        MSG.final_status(False, "", f"{total - passed} observability test(s) failed.")
        MSG.info("Please review errors above and fix issues.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
