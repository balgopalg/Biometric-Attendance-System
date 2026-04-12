#!/usr/bin/env python
"""Verify observability implementation."""

import sys
import json
from datetime import datetime, timedelta

def test_logging():
    """Test structured logging configuration."""
    print("=" * 50)
    print("TESTING: Structured Logging")
    print("=" * 50)
    
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
        print("✓ Logging initialization successful")
        
        # Test structured logger creation
        test_logger = StructuredLogger('test.logging')
        print("✓ StructuredLogger instantiation successful")
        
        # Test pre-configured loggers
        assert auth_logger is not None
        assert db_logger is not None
        print("✓ Pre-configured loggers available")
        
        # Test context setting
        auth_logger.set_context(user_id='test123')
        print("✓ Context management working")
        
        print("\n✓ Logging: PASSED\n")
        return True
        
    except Exception as e:
        print(f"\n✗ Logging: FAILED - {str(e)}\n")
        return False


def test_error_tracking():
    """Test error tracking functionality."""
    print("=" * 50)
    print("TESTING: Error Tracking")
    print("=" * 50)
    
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
        print("✓ Error handlers registered")
        
        # Test ErrorTracker methods exist
        assert hasattr(ErrorTracker, 'track_error')
        assert hasattr(ErrorTracker, 'track_validation_error')
        assert hasattr(ErrorTracker, 'track_auth_error')
        assert hasattr(ErrorTracker, 'get_error')
        assert hasattr(ErrorTracker, 'get_recent_errors')
        assert hasattr(ErrorTracker, 'get_error_stats')
        print("✓ ErrorTracker methods available")
        
        # Test ErrorHandler utilities
        response, status = ErrorHandler.api_error_response(
            "Test error",
            status_code=400,
            error_id="test-error-id"
        )
        assert response['error'] == "Test error"
        assert response['error_id'] == "test-error-id"
        assert status == 400
        print("✓ ErrorHandler response generation working")
        
        print("\n✓ Error Tracking: PASSED\n")
        return True
        
    except Exception as e:
        print(f"\n✗ Error Tracking: FAILED - {str(e)}\n")
        return False


def test_metrics():
    """Test metrics collection."""
    print("=" * 50)
    print("TESTING: Metrics Collection")
    print("=" * 50)
    
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
        print("✓ Metrics middleware registered")
        
        # Test metric recording methods
        MetricsCollector.record_http_request(
            method='GET',
            endpoint='test.endpoint',
            status_code=200,
            duration_seconds=0.123
        )
        print("✓ HTTP request metrics recorded")
        
        MetricsCollector.record_auth_attempt(success=True)
        print("✓ Auth attempt metrics recorded")
        
        MetricsCollector.record_error('TestError', 500)
        print("✓ Error metrics recorded")
        
        MetricsCollector.record_db_operation('find', 'users', 0.05)
        print("✓ Database operation metrics recorded")
        
        MetricsCollector.set_active_sessions(10)
        print("✓ Active sessions gauge set")
        
        # Test metrics retrieval
        metrics_text = MetricsCollector.get_metrics()
        assert isinstance(metrics_text, bytes)
        assert b'http_requests_total' in metrics_text
        print("✓ Metrics export working")
        
        # Test metrics snapshot
        snapshot = MetricsSnapshot.get_system_metrics()
        assert 'timestamp' in snapshot
        print("✓ Metrics snapshot generation working")
        
        print("\n✓ Metrics Collection: PASSED\n")
        return True
        
    except Exception as e:
        print(f"\n✗ Metrics Collection: FAILED - {str(e)}\n")
        return False


def test_health_checks():
    """Test health checking endpoints."""
    print("=" * 50)
    print("TESTING: Health Checks")
    print("=" * 50)
    
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
        print("✓ HealthChecker methods available")
        
        # Test health blueprint exists
        assert health_bp is not None
        assert health_bp.name == 'health'
        print("✓ Health check blueprint registered")
        
        # Test health check structure
        all_checks = HealthChecker.check_all()
        assert 'status' in all_checks
        assert 'timestamp' in all_checks
        assert 'checks' in all_checks
        assert isinstance(all_checks['checks'], dict)
        print("✓ Health check structure valid")
        
        # Test check categories
        checks = all_checks['checks']
        expected_checks = ['database', 'redis', 'queue', 'storage']
        for check in expected_checks:
            assert check in checks, f"Missing check: {check}"
        print(f"✓ All check categories present: {list(checks.keys())}")
        
        print("\n✓ Health Checks: PASSED\n")
        return True
        
    except Exception as e:
        print(f"\n✗ Health Checks: FAILED - {str(e)}\n")
        return False


def test_configuration():
    """Test observability configuration variables."""
    print("=" * 50)
    print("TESTING: Configuration")
    print("=" * 50)
    
    try:
        from app.config import Config
        
        # Check logging config
        assert hasattr(Config, 'LOGGING_LEVEL')
        assert hasattr(Config, 'LOGGING_FORMAT')
        print("✓ Logging configuration variables present")
        
        # Check error tracking config
        assert hasattr(Config, 'ERROR_TRACKING_ENABLED')
        assert hasattr(Config, 'SENTRY_DSN')
        assert hasattr(Config, 'SENTRY_SAMPLE_RATE')
        assert hasattr(Config, 'SENTRY_TRACES_SAMPLE_RATE')
        print("✓ Error tracking configuration variables present")
        
        # Check metrics config
        assert hasattr(Config, 'METRICS_ENABLED')
        assert hasattr(Config, 'METRICS_PORT')
        print("✓ Metrics configuration variables present")
        
        # Check health check config
        assert hasattr(Config, 'HEALTH_CHECK_ENABLED')
        print("✓ Health check configuration variables present")
        
        # Verify values are reasonable
        assert isinstance(Config.LOGGING_LEVEL, str)
        assert Config.LOGGING_LEVEL in {'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'}
        print(f"✓ LOGGING_LEVEL valid: {Config.LOGGING_LEVEL}")
        
        assert isinstance(Config.METRICS_ENABLED, bool)
        print(f"✓ METRICS_ENABLED valid: {Config.METRICS_ENABLED}")
        
        print("\n✓ Configuration: PASSED\n")
        return True
        
    except Exception as e:
        print(f"\n✗ Configuration: FAILED - {str(e)}\n")
        return False


def test_flask_integration():
    """Test Flask app integration."""
    print("=" * 50)
    print("TESTING: Flask Integration")
    print("=" * 50)
    
    try:
        from app import create_app
        
        # Create app with observability
        app = create_app(seed_default_admin=False)
        print("✓ App created with observability initialized")
        
        # Check that health endpoints are registered
        routes = [str(rule) for rule in app.url_map.iter_rules()]
        health_routes = [r for r in routes if 'health' in r]
        assert len(health_routes) > 0
        print(f"✓ Health endpoints registered: {len(health_routes)} routes")
        
        # Check that error handlers are registered
        error_handlers = app.error_handler_spec.get(None, {})
        assert len(error_handlers) > 0
        print(f"✓ Error handlers registered: {len(error_handlers)} handlers")
        
        # Test request context logging
        with app.test_request_context('/api/test', method='GET'):
            from flask import g
            assert hasattr(g, 'request_id')
            print("✓ Request ID automatically generated in context")
        
        print("\n✓ Flask Integration: PASSED\n")
        return True
        
    except Exception as e:
        print(f"\n✗ Flask Integration: FAILED - {str(e)}\n")
        return False


def test_dependencies():
    """Test that all required dependencies are installed."""
    print("=" * 50)
    print("TESTING: Dependencies")
    print("=" * 50)
    
    dependencies = {
        'pythonjsonlogger': 'python-json-logger',
        'prometheus_client': 'prometheus-client',
        'sentry_sdk': 'sentry-sdk',
    }
    
    all_installed = True
    for import_name, package_name in dependencies.items():
        try:
            __import__(import_name)
            print(f"✓ {package_name} installed")
        except ImportError:
            print(f"✗ {package_name} NOT installed")
            all_installed = False
    
    if all_installed:
        print("\n✓ Dependencies: PASSED\n")
    else:
        print("\n✗ Dependencies: FAILED - Install missing packages\n")
    
    return all_installed


def main():
    """Run all verification tests."""
    print("\n" + "=" * 50)
    print("OBSERVABILITY VERIFICATION SUITE")
    print("=" * 50 + "\n")
    
    results = {
        'Dependencies': test_dependencies(),
        'Configuration': test_configuration(),
        'Logging': test_logging(),
        'Error Tracking': test_error_tracking(),
        'Metrics Collection': test_metrics(),
        'Health Checks': test_health_checks(),
        'Flask Integration': test_flask_integration(),
    }
    
    # Print summary
    print("=" * 50)
    print("VERIFICATION SUMMARY")
    print("=" * 50 + "\n")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    for test_name, passed_test in results.items():
        status = "✓ PASS" if passed_test else "✗ FAIL"
        print(f"{status:8} {test_name}")
    
    print("\n" + "-" * 50)
    print(f"Result: {passed}/{total} tests passed")
    print("-" * 50 + "\n")
    
    if passed == total:
        print("✓ All observability tests PASSED!")
        print("\nObservability implementation is ready for deployment.\n")
        return 0
    else:
        print(f"✗ {total - passed} test(s) FAILED\n")
        print("Please review errors above and fix issues.\n")
        return 1


if __name__ == '__main__':
    sys.exit(main())
