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
    cc: Iterable[str] | None = None,
    bcc: Iterable[str] | None = None,
    reply_to: str | None = None,
    attachments: Iterable[tuple[str, str, bytes]] = (),
) -> str:
    """Send a single message via the configured SMTP relay.

    Returns the SMTP server's accepted message-id (the local part of the
    Message-ID header we set). attachments are (filename, mime_subtype,
    bytes) — mime_subtype like 'pdf' or 'octet-stream'; only the
    application/* family is supported here since that covers our needs.

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
