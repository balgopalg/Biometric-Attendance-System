"""Email service using Yagmail for transactional emails.

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

# ─── Yagmail setup ───────────────────────────────────────────────────────────

_YAGMAIL_READY = False


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

try:
    import yagmail

    _YAGMAIL_USER = os.getenv("YAGMAIL_USER", "").strip()
    _YAGMAIL_PASSWORD = os.getenv("YAGMAIL_PASSWORD", "").strip()
    if _YAGMAIL_USER and _YAGMAIL_PASSWORD:
        _YAGMAIL_READY = True
    else:
        logger.info("YAGMAIL_USER or YAGMAIL_PASSWORD not set — email delivery disabled.")
except ImportError:
    logger.warning("yagmail package not installed — email delivery disabled.")


def _get_mailer():
    """Build a configured yagmail SMTP client from environment variables."""
    host = os.getenv("YAGMAIL_SMTP_HOST", "smtp.gmail.com").strip()
    port = int(os.getenv("YAGMAIL_SMTP_PORT", "587"))
    smtp_ssl = _env_bool("YAGMAIL_SMTP_SSL", False)
    smtp_starttls = _env_bool("YAGMAIL_SMTP_STARTTLS", not smtp_ssl)

    return yagmail.SMTP(
        user=os.getenv("YAGMAIL_USER", "").strip(),
        password=os.getenv("YAGMAIL_PASSWORD", "").strip(),
        host=host,
        port=port,
        smtp_ssl=smtp_ssl,
        smtp_starttls=smtp_starttls,
    )


def _get_login_url() -> str:
    """Return dashboard login URL for email CTAs."""
    return os.getenv("APP_LOGIN_URL", "http://localhost:5173/login").strip() or "http://localhost:5173/login"


def is_email_delivery_enabled() -> bool:
    """Return True when outbound email delivery is configured and available."""
    return bool(_YAGMAIL_READY)


# ─── HTML templates ──────────────────────────────────────────────────────────

def _welcome_html(name: str, email: str, temp_password: str, role: str) -> str:
    role_label = role.capitalize()
    login_url = _get_login_url()
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Biometric Attendance</title>
  <style>
    @media only screen and (max-width: 620px) {{
      .wrapper {{ padding: 18px 10px !important; }}
      .card {{ width: 100% !important; border-radius: 12px !important; }}
      .pad {{ padding-left: 18px !important; padding-right: 18px !important; }}
      .hero-title {{ font-size: 22px !important; }}
      .hero-sub {{ font-size: 14px !important; }}
      .cta {{ display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }}
      .cta {{ margin: 0 auto !important; float: none !important; }}
      .key {{ font-size: 18px !important; letter-spacing: 0.6px !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#eef3f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef3f7;">
    <tr>
      <td class="wrapper" align="center" style="padding:28px 12px;">
        <table class="card" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #dbe4ee;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
          <tr>
            <td class="pad" style="padding:30px 34px;background:linear-gradient(145deg,#0f172a 0%,#1e293b 62%,#334155 100%);">
              <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#93c5fd;font-weight:700;margin-bottom:10px;">Welcome Aboard</div>
              <h1 class="hero-title" style="margin:0;font-size:28px;line-height:1.2;color:#f8fafc;font-weight:800;letter-spacing:-0.02em;">Biometric Attendance Ready</h1>
              <p class="hero-sub" style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#cbd5e1;">Your secure access has been provisioned successfully.</p>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:30px 34px 32px;">
              <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#334155;">
                Hi <strong>{name}</strong>,<br>
                Your <strong>{role_label}</strong> account is now active. Use the credentials below to sign in and complete your first-time security setup.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #dbe4ee;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td style="padding:22px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.12em;color:#64748b;text-transform:uppercase;">User ID</p>
                    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;word-break:break-all;">{email}</p>

                    <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.12em;color:#64748b;text-transform:uppercase;">Temporary Key</p>
                    <p class="key" style="margin:0;font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:800;color:#2563eb;letter-spacing:0.9px;word-break:break-all;">{temp_password}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;border-left:4px solid #f59e0b;background:#fff7ed;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;">
                    <p style="margin:0;font-size:13px;line-height:1.55;color:#9a3412;">
                      <strong>Security step:</strong> Change this temporary key right after your first login.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <a href="{login_url}" class="cta" target="_blank" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:10px;-webkit-text-size-adjust:none;">Go To Dashboard</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:18px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">
                Automated security notification from Biometric Attendance Management System.<br>
                &copy; 2026 All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _password_reset_html(name: str, email: str, temp_password: str, role: str) -> str:
    role_label = role.capitalize()
    login_url = _get_login_url()
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Completed</title>
  <style>
    @media only screen and (max-width: 620px) {{
      .wrapper {{ padding: 18px 10px !important; }}
      .card {{ width: 100% !important; border-radius: 12px !important; }}
      .pad {{ padding-left: 18px !important; padding-right: 18px !important; }}
      .hero-title {{ font-size: 22px !important; }}
      .hero-sub {{ font-size: 14px !important; }}
      .cta {{ display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }}
      .cta {{ margin: 0 auto !important; float: none !important; }}
      .key {{ font-size: 18px !important; letter-spacing: 0.6px !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#eef3f7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef3f7;">
    <tr>
      <td class="wrapper" align="center" style="padding:28px 12px;">
        <table class="card" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #dbe4ee;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
          <tr>
            <td class="pad" style="padding:30px 34px;background:linear-gradient(145deg,#7f1d1d 0%,#b91c1c 60%,#dc2626 100%);">
              <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#fecaca;font-weight:700;margin-bottom:10px;">Security Notice</div>
              <h1 class="hero-title" style="margin:0;font-size:28px;line-height:1.2;color:#fff7ed;font-weight:800;letter-spacing:-0.02em;">Password Reset Successful</h1>
              <p class="hero-sub" style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#fee2e2;">A temporary key was issued for secure re-entry.</p>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:30px 34px 32px;">
              <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#334155;">
                Hi <strong>{name}</strong>,<br>
                Your <strong>{role_label}</strong> account password has been reset. Sign in with the temporary key below, then set a new permanent password.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #dbe4ee;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td style="padding:22px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.12em;color:#64748b;text-transform:uppercase;">User ID</p>
                    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0f172a;word-break:break-all;">{email}</p>

                    <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.12em;color:#64748b;text-transform:uppercase;">Reset Key</p>
                    <p class="key" style="margin:0;font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:800;color:#dc2626;letter-spacing:0.9px;word-break:break-all;">{temp_password}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;border-left:4px solid #f59e0b;background:#fff7ed;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;">
                    <p style="margin:0;font-size:13px;line-height:1.55;color:#9a3412;">
                      <strong>Important:</strong> This temporary key expires after first successful login and password update.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <a href="{login_url}" class="cta" target="_blank" style="display:inline-block;background:#7f1d1d;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:10px;-webkit-text-size-adjust:none;">Sign In Securely</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:18px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">
                Automated security notification from Biometric Attendance Management System.<br>
                &copy; 2026 All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _shortage_alert_html(name: str, paper_name: str, percentage: float, classes_needed: int) -> str:
    login_url = _get_login_url()
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attendance Alert</title>
  <style>
    @media only screen and (max-width: 620px) {{
      .wrapper {{ padding: 18px 10px !important; }}
      .card {{ width: 100% !important; border-radius: 12px !important; }}
      .pad {{ padding-left: 18px !important; padding-right: 18px !important; }}
      .hero-title {{ font-size: 22px !important; }}
      .cta {{ display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }}
      .stat-val {{ font-size: 24px !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#fff1f2;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:none;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff1f2;">
    <tr>
      <td class="wrapper" align="center" style="padding:28px 12px;">
        <table class="card" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #fecaca;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(153,27,27,0.1);">
          <tr>
            <td class="pad" style="padding:30px 34px;background:linear-gradient(135deg,#991b1b 0%,#dc2626 100%);">
              <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#fecaca;font-weight:700;margin-bottom:10px;">Attendance Alert</div>
              <h1 class="hero-title" style="margin:0;font-size:28px;line-height:1.2;color:#ffffff;font-weight:800;letter-spacing:-0.02em;">Eligibility Warning</h1>
              <p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#fee2e2;">Your attendance has fallen below the mandatory 75% threshold.</p>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:30px 34px 32px;">
              <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#334155;">
                Hi <strong>{name}</strong>,<br>
                This is an automated notification regarding your attendance for <strong>{paper_name}</strong>.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="18" border="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td width="50%" align="center" style="border-right:1px solid #fecaca;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:0.1em;color:#991b1b;text-transform:uppercase;">Current Meta</p>
                    <p class="stat-val" style="margin:0;font-size:32px;font-weight:800;color:#dc2626;">{percentage}%</p>
                  </td>
                  <td width="50%" align="center">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:0.1em;color:#991b1b;text-transform:uppercase;">Classes Needed</p>
                    <p class="stat-val" style="margin:0;font-size:32px;font-weight:800;color:#dc2626;">+{classes_needed}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#64748b;">
                To restore your eligibility for upcoming examinations, you must attend at least <strong>{classes_needed}</strong> consecutive classes without further absence.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <a href="{login_url}" class="cta" target="_blank" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;-webkit-text-size-adjust:none;">View Detailed Report</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="pad" style="padding:18px 34px;background:#fef2f2;border-top:1px solid #fecaca;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#b91c1c;text-align:center;font-weight:500;">
                This is a mandatory academic notification. Failure to maintain 75% attendance may lead to exam disqualification.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
    if not _YAGMAIL_READY:
        logger.info("Email delivery skipped (Yagmail not configured). to=%s", to_email)
        return False

    def _send():
        try:
            mailer = _get_mailer()
            mailer.send(
                to=to_email,
                subject=f"Your {role.capitalize()} Account — Biometric Attendance System",
                contents=_welcome_html(name, to_email, temp_password, role),
            )
            logger.info("Welcome email sent to %s", to_email)
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
    if not _YAGMAIL_READY:
        logger.info("Email delivery skipped (Yagmail not configured). to=%s", to_email)
        return False

    def _send():
        try:
            mailer = _get_mailer()
            mailer.send(
                to=to_email,
                subject="Password Reset — Biometric Attendance System",
                contents=_password_reset_html(name, to_email, temp_password, role),
            )
            logger.info("Password reset email sent to %s", to_email)
        except Exception:
            logger.exception("Failed to send password reset email to %s", to_email)

    Thread(target=_send, daemon=True).start()
    return True


def send_shortage_alert_email(
    to_email: str,
    name: str,
    paper_name: str,
    percentage: float,
    classes_needed: int,
):
    """Send attendance shortage warning email. Non-blocking."""
    if not _YAGMAIL_READY:
        return False

    def _send():
        try:
            mailer = _get_mailer()
            mailer.send(
                to=to_email,
                subject=f"URGENT: Attendance Shortage in {paper_name}",
                contents=_shortage_alert_html(name, paper_name, percentage, classes_needed),
            )
            logger.info("Shortage alert sent to %s for %s", to_email, paper_name)
        except Exception:
            logger.exception("Failed to send shortage alert to %s", to_email)

    Thread(target=_send, daemon=True).start()
    return True
