"""Emails: password recovery and order news for customers.

Without SMTP an email is only noted in the log (its text too with ``email_log_body``, for dev
and the browser tests). Order emails go out as background tasks after the response, so a slow
or failing mail server never holds up checkout or the admin panel.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings
from app.models import Order, OrderChannel, OrderStatus, volume_label
from app.services.orders import fmt_money

log = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(get_settings().smtp_host)


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email. Failures are only logged."""
    s = get_settings()
    if not s.smtp_host:
        if s.email_log_body:
            log.warning("SMTP is not configured; email to %s:\n%s\n%s", to, subject, body)
        else:
            log.warning("SMTP is not configured; email «%s» to %s was not sent", subject, to)
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
    send_email(to, "Восстановление пароля — Kyko Parfum", body)


# ---------- Orders ----------

# What the customer is told when the shop moves an online order on.
STATUS_NEWS = {
    OrderStatus.processing: ("принят в работу", "Мы собираем ваш заказ."),
    OrderStatus.shipped: ("отправлен", "Заказ передан в доставку."),
    OrderStatus.delivered: ("доставлен", "Спасибо за покупку!"),
    OrderStatus.cancelled: ("отменён", "Если это ошибка, просто ответьте на это письмо."),
}


def recipient(order: Order) -> str | None:
    """Where the order's emails go: an online order's contact email, if it is an address."""
    email = (order.contact_email or "").strip()
    if order.channel != OrderChannel.online or "@" not in email:
        return None
    return email


def _order_link(order: Order) -> str:
    return f"{get_settings().frontend_url.rstrip('/')}/account/orders/{order.id}"


def order_placed(order: Order) -> tuple[str, str]:
    """Subject and text of «we have your order»."""
    lines = [
        f"• {i.brand_name} {i.product_name}, {volume_label(i.volume_ml, i.is_tester)}"
        f" × {i.quantity} — {fmt_money(i.price_applied * i.quantity)}"
        for i in order.items
    ]
    body = "\n".join(
        [
            f"Здравствуйте, {order.contact_name}!",
            "",
            f"Мы получили ваш заказ №{order.id} на {fmt_money(order.total_amount)}:",
            "",
            *lines,
            "",
            f"Доставка: {order.delivery_city}, {order.delivery_address}",
            "",
            "Менеджер свяжется с вами, чтобы подтвердить заказ.",
            f"Заказ в личном кабинете: {_order_link(order)}",
        ]
    )
    return f"Заказ №{order.id} принят — Kyko Parfum", body


def order_status(order: Order) -> tuple[str, str] | None:
    """Subject and text about the order's new status; None when there is nothing to tell."""
    news = STATUS_NEWS.get(order.status)
    if news is None:
        return None
    word, more = news
    body = "\n".join(
        [
            f"Здравствуйте, {order.contact_name}!",
            "",
            f"Ваш заказ №{order.id} {word}. {more}",
            "",
            f"Заказ в личном кабинете: {_order_link(order)}",
        ]
    )
    return f"Заказ №{order.id} {word} — Kyko Parfum", body
