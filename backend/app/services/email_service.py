"""Email service using Resend API for transactional emails.

Usage:
    from app.services.email_service import send_welcome_email

    send_welcome_email(
        to_email="student@example.com",
        name="John Doe",
        temp_password="Abc123!@#xyz",
        role="student",
    )

The service is fire-and-forget: failures are logged but never block the
calling request, so user creation always succeeds even when email delivery
fails.
"""

import logging
import os
from threading import Thread

logger = logging.getLogger(__name__)

# ─── Resend SDK setup ────────────────────────────────────────────────────────

_RESEND_READY = False

try:
    import resend

    _api_key = os.getenv("RESEND_API_KEY", "")
    if _api_key:
        resend.api_key = _api_key
        _RESEND_READY = True
    else:
        logger.info("RESEND_API_KEY not set — email delivery disabled.")
except ImportError:
    logger.warning("resend package not installed — email delivery disabled.")


def _get_from_address():
    """Return the sender address configured via env, with a sensible default."""
    return os.getenv("RESEND_FROM_EMAIL", "Biometric Attendance <onboarding@resend.dev>")


def is_email_delivery_enabled() -> bool:
    """Return True when outbound email delivery is configured and available."""
    return bool(_RESEND_READY)


# ─── HTML templates ──────────────────────────────────────────────────────────

def _welcome_html(name: str, email: str, temp_password: str, role: str) -> str:
    role_label = role.capitalize()
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0f0f18;color:#e0e0e0;">
  <div style="max-width:520px;margin:40px auto;background:#181825;border-radius:12px;border:1px solid #2a2a3e;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Welcome to Biometric Attendance</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Your {role_label} account has been created</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi <strong>{name}</strong>,<br>
        Your account has been set up. Use the credentials below to log in for the first time.
      </p>

      <!-- Credentials card -->
      <div style="background:#1e1e30;border:1px solid #2e2e44;border-radius:8px;padding:18px 22px;margin-bottom:22px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#a0a0b8;">Email</td>
            <td style="padding:6px 0;text-align:right;font-weight:600;color:#e0e0f0;">{email}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#a0a0b8;">Temporary Password</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;color:#a78bfa;font-family:'Courier New',monospace;letter-spacing:0.5px;">{temp_password}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#a0a0b8;">Role</td>
            <td style="padding:6px 0;text-align:right;font-weight:500;color:#e0e0f0;">{role_label}</td>
          </tr>
        </table>
      </div>

      <div style="background:#1a1a2e;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:22px;">
        <p style="margin:0;font-size:13px;color:#fbbf24;">
          ⚠ You will be required to <strong>change this password</strong> on your first login.
        </p>
      </div>

      <p style="font-size:13px;color:#8888a0;margin:0;line-height:1.5;">
        If you did not expect this email, you can safely ignore it.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#14141e;padding:16px 32px;text-align:center;border-top:1px solid #2a2a3e;">
      <p style="margin:0;font-size:12px;color:#6b6b80;">Biometric Attendance System · This is an automated message</p>
    </div>
  </div>
</body>
</html>"""


def _password_reset_html(name: str, email: str, temp_password: str, role: str) -> str:
    role_label = role.capitalize()
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0f0f18;color:#e0e0e0;">
  <div style="max-width:520px;margin:40px auto;background:#181825;border-radius:12px;border:1px solid #2a2a3e;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:28px 32px;">
      <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Password Reset</h1>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Your password has been reset by an administrator</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hi <strong>{name}</strong>,<br>
        Your password for the Biometric Attendance System has been reset. Use the new temporary credentials below to log in.
      </p>

      <!-- Credentials card -->
      <div style="background:#1e1e30;border:1px solid #2e2e44;border-radius:8px;padding:18px 22px;margin-bottom:22px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#a0a0b8;">Email</td>
            <td style="padding:6px 0;text-align:right;font-weight:600;color:#e0e0f0;">{email}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#a0a0b8;">New Temporary Password</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;color:#fbbf24;font-family:'Courier New',monospace;letter-spacing:0.5px;">{temp_password}</td>
          </tr>
        </table>
      </div>

      <div style="background:#1a1a2e;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:22px;">
        <p style="margin:0;font-size:13px;color:#fbbf24;">
          ⚠ You will be required to <strong>change this password</strong> on your next login.
        </p>
      </div>

      <p style="font-size:13px;color:#8888a0;margin:0;line-height:1.5;">
        If you did not request this reset, please contact your administrator immediately.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#14141e;padding:16px 32px;text-align:center;border-top:1px solid #2a2a3e;">
      <p style="margin:0;font-size:12px;color:#6b6b80;">Biometric Attendance System · This is an automated message</p>
    </div>
  </div>
</body>
</html>"""


# ─── Public API ───────────────────────────────────────────────────────────────

def send_welcome_email(
    to_email: str,
    name: str,
    temp_password: str,
    role: str = "student",
):
    """Send welcome email with temporary credentials.

    This is non-blocking — it fires the email in a background thread so
    the calling route returns immediately.  Failures are logged, never raised.
    """
    if not _RESEND_READY:
        logger.info("Email delivery skipped (Resend not configured). to=%s", to_email)
        return False

    def _send():
        try:
            params = {
                "from": _get_from_address(),
                "to": [to_email],
                "subject": f"Your {role.capitalize()} Account — Biometric Attendance System",
                "html": _welcome_html(name, to_email, temp_password, role),
            }
            response = resend.Emails.send(params)
            logger.info("Welcome email sent to %s (id=%s)", to_email, getattr(response, "id", response))
        except Exception:
            logger.exception("Failed to send welcome email to %s", to_email)

    Thread(target=_send, daemon=True).start()
    return True


def send_password_reset_email(
    to_email: str,
    name: str,
    temp_password: str,
    role: str = "student",
):
    """Send password-reset email with new temporary credentials.

    Non-blocking, fire-and-forget — same pattern as send_welcome_email.
    """
    if not _RESEND_READY:
        logger.info("Email delivery skipped (Resend not configured). to=%s", to_email)
        return False

    def _send():
        try:
            params = {
                "from": _get_from_address(),
                "to": [to_email],
                "subject": "Password Reset — Biometric Attendance System",
                "html": _password_reset_html(name, to_email, temp_password, role),
            }
            response = resend.Emails.send(params)
            logger.info("Password reset email sent to %s (id=%s)", to_email, getattr(response, "id", response))
        except Exception:
            logger.exception("Failed to send password reset email to %s", to_email)

    Thread(target=_send, daemon=True).start()
    return True
