import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email. Without SMTP configured the message is only logged (dev mode)."""
    s = get_settings()
    if not s.smtp_host:
        log.warning("SMTP is not configured; email to %s:\n%s\n%s", to, subject, body)
        return

    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as smtp:
            if s.smtp_tls:
                smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
    except (OSError, smtplib.SMTPException):
        # The caller must not leak whether the email exists, so failures are only logged.
        log.exception("Failed to send email to %s", to)


def send_password_reset(to: str, raw_token: str) -> None:
    s = get_settings()
    link = f"{s.frontend_url.rstrip('/')}/reset-password?token={raw_token}"
    body = (
        "Здравствуйте!\n\n"
        "Мы получили запрос на восстановление пароля. Чтобы задать новый пароль, "
        f"перейдите по ссылке (действует {s.password_reset_ttl_minutes} мин.):\n\n{link}\n\n"
        "Если вы не запрашивали восстановление, просто проигнорируйте это письмо."
    )
    send_email(to, "Восстановление пароля — Kyko Parfums", body)
