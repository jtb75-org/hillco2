"""SMTP send helper for transactional email (invoice send, etc.).

The cluster's mail-relay (boky/postfix in the `mail` namespace) accepts
unauthenticated mail from cluster-internal IPs and forwards via AWS SES.
We only need to open a TCP socket, EHLO, MAIL FROM, RCPT TO, DATA, .,
QUIT. STARTTLS is opt-in via SMTP_STARTTLS (default off — the path
from app pod to mail-relay never leaves the cluster).
"""
from __future__ import annotations

import logging
import smtplib
from collections.abc import Iterable
from email.message import EmailMessage

from .config import settings

log = logging.getLogger(__name__)


class EmailSendError(Exception):
    """Wrap smtplib failures so callers can surface a friendly HTTPException
    without leaking the underlying socket / SMTP-protocol details."""


def send_email(
    *,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    cc: Iterable[str] | None = None,
    bcc: Iterable[str] | None = None,
    reply_to: str | None = None,
    attachments: Iterable[tuple[str, str, bytes]] = (),
) -> str:
    """Send a single message via the configured SMTP relay.

    Returns the SMTP server's accepted message-id (the local part of the
    Message-ID header we set). `body_text` is always sent as the plain-text
    part; when `body_html` is given it's added as a richer alternative that
    HTML-capable clients render instead. attachments are (filename,
    mime_subtype, bytes) — mime_subtype like 'pdf' or 'octet-stream'; only
    the application/* family is supported here since that covers our needs.

    Raises EmailSendError on any failure so the caller can return a
    deterministic HTTP status without leaking SMTP internals.
    """
    cc_list = [c.strip() for c in (cc or []) if c and c.strip()]
    bcc_list = [b.strip() for b in (bcc or []) if b and b.strip()]

    msg = EmailMessage()
    msg["From"] = f'"{settings.smtp_from_name}" <{settings.smtp_from_address}>'
    msg["To"] = to
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    for filename, mime_subtype, data in attachments:
        msg.add_attachment(
            data,
            maintype="application",
            subtype=mime_subtype,
            filename=filename,
        )

    # The Python stdlib generates a Message-ID at send-time if we don't
    # set one, but it's easier to surface a deterministic id back to the
    # caller (and into the audit table) by reading it after send.
    recipients = [to, *cc_list, *bcc_list]

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
            smtp.ehlo()
            if settings.smtp_starttls:
                smtp.starttls()
                smtp.ehlo()
            smtp.send_message(msg, to_addrs=recipients)
    except (smtplib.SMTPException, OSError) as exc:
        log.warning(
            "SMTP send failed: host=%s port=%s to=%s err=%s",
            settings.smtp_host, settings.smtp_port, to, exc,
        )
        raise EmailSendError(str(exc)) from exc

    return msg["Message-ID"] or ""


# Brand palette (mirrors the landing page / signing page wordmark).
_NAVY = "#08428d"
_SKY = "#5fa0ee"
_INK = "#1f2937"
_MUTED = "#6b7280"
_GROUND = "#f4f6fb"


def render_letterhead_email(
    *,
    heading: str,
    paragraphs: list[str],
    button: tuple[str, str] | None = None,
    footer_note: str | None = None,
) -> str:
    """Build a branded HTML email with the HillCo letterhead.

    `paragraphs` are body copy (already plain text; HTML-escaped here).
    `button` is an optional (label, href) call-to-action. Uses table layout
    and inline styles for broad email-client compatibility, and no external
    images (clients block them) — the wordmark is styled text.
    """
    from html import escape  # noqa: PLC0415

    body_rows = "".join(
        f'<p style="margin:0 0 14px;color:{_INK};font-size:15px;line-height:1.6;">{escape(p)}</p>'
        for p in paragraphs
    )
    button_html = ""
    if button:
        label, href = button
        button_html = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" '
            f'style="margin:22px 0;"><tr><td style="border-radius:6px;background:{_NAVY};">'
            f'<a href="{escape(href)}" style="display:inline-block;padding:12px 26px;'
            f'font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;'
            f'color:#ffffff;text-decoration:none;border-radius:6px;">{escape(label)}</a>'
            f"</td></tr></table>"
        )
    footer_html = ""
    if footer_note:
        footer_html = (
            f'<p style="margin:18px 0 0;color:{_MUTED};font-size:12.5px;'
            f'line-height:1.5;">{escape(footer_note)}</p>'
        )
    return f"""\
<!doctype html>
<html><body style="margin:0;padding:0;background:{_GROUND};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_GROUND};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">
        <tr><td style="background:{_NAVY};padding:20px 32px;">
          <span style="font-size:22px;font-weight:800;letter-spacing:.5px;color:#ffffff;">HILL<span style="color:{_SKY};">CO</span></span>
          <span style="font-size:11px;font-weight:300;letter-spacing:3px;color:#cfe2fb;margin-left:8px;">EDUCATIONAL CONSULTING</span>
        </td></tr>
        <tr><td style="padding:30px 32px 34px;">
          <h1 style="margin:0 0 16px;color:{_NAVY};font-size:20px;font-weight:700;">{escape(heading)}</h1>
          {body_rows}
          {button_html}
          {footer_html}
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #eef0f4;padding:16px 32px;color:{_MUTED};font-size:12px;">
          HillCo Educational Consulting
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
