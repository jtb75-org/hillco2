"""Tokenized signing links + signature audit helpers for agreements.

The link a client clicks carries a signed, expiring token (itsdangerous) with
the agreement id and a per-agreement nonce. No login is required to open it —
the token *is* the capability. Rotating agreements.signing_nonce invalidates any
outstanding link (e.g. after signing, or to revoke/replace a sent one).
"""
import hashlib
from uuid import UUID

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import settings

_SALT = "agreement-esign-v1"
# 30-day link lifetime.
SIGNING_MAX_AGE_SECONDS = 30 * 24 * 60 * 60


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt=_SALT)


def make_signing_token(agreement_id, nonce) -> str:
    return _serializer().dumps({"aid": str(agreement_id), "n": str(nonce)})


def read_signing_token(token: str) -> tuple[UUID, str] | None:
    """Return (agreement_id, nonce) for a valid, unexpired token, else None."""
    try:
        data = _serializer().loads(token, max_age=SIGNING_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    try:
        return UUID(str(data["aid"])), str(data["n"])
    except (KeyError, ValueError, TypeError):
        return None


def document_sha256(text: str) -> str:
    """Stable hash of the exact contract text a party agreed to."""
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()
