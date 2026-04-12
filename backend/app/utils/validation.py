"""Input validation and sanitization utilities."""

import re
from urllib.parse import urlparse


def validate_email(email):
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email)) and len(email) <= 254


def validate_password_strength(password):
    """
    Validate password meets minimum strength requirements.
    
    Requirements:
    - At least 12 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    if len(password) < 12:
        return False, "Password must be at least 12 characters"
    
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]', password):
        return False, "Password must contain at least one special character"
    
    return True, "Password is strong"


def validate_pin(pin):
    """Validate PIN format (4-6 digits)."""
    if not isinstance(pin, (int, str)):
        return False
    
    pin_str = str(pin).strip()
    if not re.match(r'^\d{4,6}$', pin_str):
        return False
    
    return True


def validate_role(role):
    """Validate role is one of allowed values."""
    allowed = {"admin", "lecturer", "student"}
    return role in allowed


def validate_url(url_string):
    """Validate URL is well-formed."""
    try:
        result = urlparse(url_string)
        return all([result.scheme, result.netloc])
    except Exception:
        return False


def sanitize_string(value, max_length=255):
    """Sanitize string input, removing potentially harmful characters."""
    if not isinstance(value, str):
        return ""
    
    # Truncate to max length
    value = value[:max_length]
    
    # Remove control characters but preserve common whitespace
    value = ''.join(char for char in value if ord(char) >= 32 or char in '\n\r\t')
    
    return value.strip()


def validate_object_id(obj_id_str):
    """Validate MongoDB ObjectId format."""
    if not isinstance(obj_id_str, str):
        return False
    
    return bool(re.match(r'^[0-9a-f]{24}$', obj_id_str.lower()))


def validate_course_code(code):
    """Validate course code format."""
    # Allow alphanumeric with dash/underscore, 2-20 chars
    if not isinstance(code, str):
        return False
    
    return bool(re.match(r'^[A-Za-z0-9_-]{2,20}$', code))


def validate_registration_number(reg_number):
    """Validate student registration number format."""
    if not isinstance(reg_number, str):
        return False
    
    # Allow alphanumeric with dash/underscore, 3-30 chars
    return bool(re.match(r'^[A-Za-z0-9_-]{3,30}$', reg_number))


def validate_attendance_percentage(percentage):
    """Validate attendance percentage is between 0-100."""
    try:
        pct = float(percentage)
        return 0 <= pct <= 100
    except (ValueError, TypeError):
        return False


def validate_ip_address(ip):
    """Validate IPv4 or IPv6 address format."""
    # Simple validation for IPv4
    if ':' not in ip:  # IPv4
        parts = ip.split('.')
        if len(parts) != 4:
            return False
        try:
            return all(0 <= int(part) <= 255 for part in parts)
        except ValueError:
            return False
    else:  # IPv6 (simplified check)
        return ':' in ip and len(ip) > 5


class ValidationError(Exception):
    """Custom exception for validation errors."""
    pass


class RequestValidator:
    """Helper class for validating common request patterns."""

    @staticmethod
    def validate_json_request(required_fields=None, field_validators=None):
        """
        Validate request JSON structure and field types.
        
        Args:
            required_fields: List of field names that must be present
            field_validators: Dict of {field_name: validator_func}
        
        Returns:
            dict: Validated data
            
        Raises:
            ValidationError: If validation fails
        """
        from flask import request
        
        data = request.get_json(silent=True)
        if not data:
            raise ValidationError("Invalid or missing JSON")
        
        # Check required fields
        if required_fields:
            missing = [f for f in required_fields if f not in data]
            if missing:
                raise ValidationError(f"Missing required fields: {', '.join(missing)}")
        
        # Validate fields
        if field_validators:
            for field, validator in field_validators.items():
                if field in data:
                    try:
                        if not validator(data[field]):
                            raise ValidationError(f"Invalid value for field '{field}'")
                    except Exception as e:
                        raise ValidationError(f"Validation error for field '{field}': {str(e)}")
        
        return data
