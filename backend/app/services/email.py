"""
Email sending (verification links, password reset, agency invites). Three ways, in this order:

1. EMAIL_WEBHOOK_URL (production): a Google Apps Script web app in the owner's Google account.
   FitWork POSTs {secret, to, subject, text, html} over HTTPS and Google sends the email from
   the owner's Gmail (free, 100 emails/day). Used because free hosting plans such as Render's
   block the SMTP ports (25/465/587), while HTTPS (443) is allowed.
2. SMTP (any provider, e.g. Gmail SMTP with an App Password) where SMTP ports are open.
3. Nothing configured (development): the email is printed to the console.

Emails are sent in a background thread so a slow mail service never slows down the API response.
"""
import logging
import smtplib
import ssl
import threading
from email.message import EmailMessage

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)


def _send_via_webhook(to: str, subject: str, text: str, html: str) -> None:
    try:
        res = httpx.post(
            settings.EMAIL_WEBHOOK_URL,
            json={"secret": settings.EMAIL_WEBHOOK_SECRET, "to": to, "subject": subject, "text": text, "html": html},
            timeout=30,
            follow_redirects=True,  # Apps Script answers through a redirect to googleusercontent.com
        )
        result = res.json()
        if not result.get("ok"):
            raise RuntimeError(result.get("error", f"HTTP {res.status_code}"))
        log.info("Email sent to %s: %s", to, subject)
    except Exception:
        log.exception("Email to %s failed", to)


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def _build(to: str, subject: str, text: str, html: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = f"FitWork <{settings.EMAIL_FROM or settings.SMTP_USER}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


def _send_now(msg: EmailMessage) -> None:
    try:
        context = ssl.create_default_context()
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, 465, context=context, timeout=20) as s:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
                s.starttls(context=context)
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        log.info("Email sent to %s: %s", msg["To"], msg["Subject"])
    except Exception:
        log.exception("Email to %s failed", msg["To"])


def send_email(to: str, subject: str, text: str, html: str) -> None:
    if settings.EMAIL_WEBHOOK_URL:
        threading.Thread(target=_send_via_webhook, args=(to, subject, text, html), daemon=True).start()
        return
    if not smtp_configured():
        # Development: show the email in the server console instead of sending it.
        log.info("[DEV EMAIL] To %s: %s\n%s", to, subject, text)
        print(f"\n[DEV EMAIL] To {to}: {subject}\n{text}\n", flush=True)
        return
    threading.Thread(target=_send_now, args=(_build(to, subject, text, html),), daemon=True).start()


def _layout(title: str, body_html: str, button_text: str, link: str) -> str:
    return f"""<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1e293b">
  <h2 style="color:#4f46e5;margin-bottom:4px">FitWork</h2>
  <h3 style="margin-top:0">{title}</h3>
  {body_html}
  <p style="margin:28px 0"><a href="{link}" style="background:#4f46e5;color:#fff;padding:12px 20px;
     border-radius:8px;text-decoration:none;font-weight:bold">{button_text}</a></p>
  <p style="font-size:12px;color:#64748b">If the button does not work, copy this link:<br>{link}</p>
</div>"""


def send_verification(to: str, name: str, link: str) -> None:
    send_email(
        to, "Verify your FitWork email",
        f"Hi {name},\n\nPlease confirm your email address for FitWork:\n{link}\n\nThe link is valid for 48 hours.",
        _layout("Confirm your email", f"<p>Hi {name}, please confirm your email address.</p>", "Verify email", link),
    )


def send_password_reset(to: str, name: str, link: str) -> None:
    send_email(
        to, "Reset your FitWork password",
        f"Hi {name},\n\nUse this link to choose a new password (valid for 1 hour):\n{link}\n\n"
        "If you did not ask for this, you can ignore this email.",
        _layout("Reset your password",
                f"<p>Hi {name}, click below to choose a new password. The link is valid for 1 hour.</p>"
                "<p>If you did not ask for this, you can ignore this email.</p>", "Choose a new password", link),
    )


def send_agency_invite(to: str, agency_name: str, owner_name: str, link: str) -> None:
    send_email(
        to, f"{owner_name} invited you to {agency_name} on FitWork",
        f"{owner_name} invited you to join {agency_name} on FitWork.\n\nAccept the invite:\n{link}\n\n"
        "Log in (or create an account) with this email address to accept.",
        _layout(f"Join {agency_name}",
                f"<p>{owner_name} invited you to join <b>{agency_name}</b> on FitWork. FitWork routes each "
                "freelance job to the team member who fits it best.</p>"
                "<p>Log in or create an account with this email address to accept.</p>", "Accept invite", link),
    )
