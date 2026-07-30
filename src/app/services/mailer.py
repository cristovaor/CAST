"""Minimal SMTP delivery for transactional e-mail (invitations).

Delivery is best-effort by design: an invitation is a database row, and the
e-mail is only a convenience for handing over the link. If SMTP is unreachable
the invitation must still exist so the admin can copy the link manually —
otherwise a mail outage would silently block onboarding.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailNotConfigured(Exception):
    """Raised when SMTP delivery is requested but no host is configured."""


def _build_message(to: str, subject: str, text_body: str, html_body: str) -> EmailMessage:
    message = EmailMessage()
    name, address = parseaddr(settings.SMTP_FROM)
    message["From"] = formataddr((name, address)) if address else settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    return message


def send_email(to: str, subject: str, text_body: str, html_body: str) -> None:
    """Send one message. Raises on failure so callers can report it."""
    if not settings.EMAIL_ENABLED:
        raise EmailNotConfigured("SMTP_HOST is not configured")

    message = _build_message(to, subject, text_body, html_body)

    if settings.SMTP_SSL:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=settings.SMTP_TIMEOUT_SECONDS,
            context=context,
        ) as server:
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
        return

    with smtplib.SMTP(
        settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS
    ) as server:
        if settings.SMTP_STARTTLS:
            server.starttls(context=ssl.create_default_context())
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(message)


def send_invitation_email(*, to: str, accept_url: str, inviter_name: str, expires_hours: int) -> None:
    subject = "Convite para acessar a plataforma CAST"
    text_body = (
        f"Olá,\n\n"
        f"{inviter_name} convidou você para acessar a plataforma CAST.\n\n"
        f"Para aceitar, abra o link abaixo e entre com a sua conta Google "
        f"(use o mesmo e-mail que recebeu este convite):\n\n"
        f"{accept_url}\n\n"
        f"Este convite expira em {expires_hours} horas e só pode ser usado uma vez.\n\n"
        f"Se você não esperava este convite, ignore esta mensagem.\n"
    )
    html_body = f"""\
<html>
  <body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#1f2933;">
    <h2 style="margin-bottom:8px;">Convite para a plataforma CAST</h2>
    <p>{inviter_name} convidou você para acessar a plataforma CAST.</p>
    <p>
      Para aceitar, clique no botão abaixo e entre com a sua conta Google
      &mdash; use o <strong>mesmo e-mail</strong> que recebeu este convite.
    </p>
    <p style="margin:24px 0;">
      <a href="{accept_url}"
         style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:6px;
                text-decoration:none;font-weight:600;display:inline-block;">
        Aceitar convite
      </a>
    </p>
    <p style="font-size:13px;color:#616e7c;">
      Ou copie e cole este endereço no navegador:<br>
      <span style="word-break:break-all;">{accept_url}</span>
    </p>
    <p style="font-size:13px;color:#616e7c;">
      Este convite expira em {expires_hours} horas e só pode ser usado uma vez.
      Se você não esperava este convite, ignore esta mensagem.
    </p>
  </body>
</html>
"""
    send_email(to, subject, text_body, html_body)
