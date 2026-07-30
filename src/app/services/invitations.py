"""Invitation issuing and consumption.

Access to CAST is invite-only for federated login: a valid Google token proves
*who* someone is, never that they are allowed in. Authorization comes from an
unconsumed, unexpired invitation matching the verified e-mail address.

Tokens are random 256-bit values stored only as SHA-256 hashes. The plaintext
exists exactly once, in the response to the admin who created the invitation
(and in the e-mail we send); a database dump cannot be replayed into access.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Invitation, UserRole

_TOKEN_BYTES = 32


def hash_token(token: str) -> str:
    """Hash an invitation token for storage/lookup.

    A plain SHA-256 is sufficient here (unlike passwords): the token is a
    high-entropy random value, so brute-forcing the preimage is infeasible and
    a slow KDF would only add latency to every login attempt.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token() -> str:
    return secrets.token_urlsafe(_TOKEN_BYTES)


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def build_accept_url(token: str) -> str:
    separator = "&" if "?" in settings.INVITATION_ACCEPT_URL else "?"
    return f"{settings.INVITATION_ACCEPT_URL}{separator}{urlencode({'token': token})}"


def create_invitation(
    db: Session,
    *,
    email: str,
    organization_id,
    role: UserRole,
    invited_by,
    name: str | None = None,
    expires_hours: int | None = None,
) -> tuple[Invitation, str]:
    """Create an invitation, returning it with the one-time plaintext token."""
    token = generate_token()
    hours = expires_hours or settings.INVITATION_EXPIRE_HOURS
    invitation = Invitation(
        email=normalize_email(email),
        token_hash=hash_token(token),
        organization_id=organization_id,
        role=role,
        name=name.strip() if isinstance(name, str) and name.strip() else None,
        expires_at=datetime.utcnow() + timedelta(hours=hours),
        invited_by=invited_by,
    )
    db.add(invitation)
    db.flush()
    return invitation, token


def _pending_filter(query, *, now: datetime):
    return query.filter(
        Invitation.consumed_at.is_(None),
        Invitation.revoked_at.is_(None),
        Invitation.expires_at > now,
    )


def find_pending_by_email(db: Session, email: str) -> Invitation | None:
    """Return the newest usable invitation for an e-mail, if any."""
    now = datetime.utcnow()
    query = db.query(Invitation).filter(func.lower(Invitation.email) == normalize_email(email))
    return _pending_filter(query, now=now).order_by(Invitation.created_at.desc()).first()


def find_pending_by_token(db: Session, token: str) -> Invitation | None:
    """Return the invitation matching a plaintext token, if still usable.

    The lookup is by hash, so it is already constant-time with respect to the
    token value; the explicit compare_digest guards against a hash collision in
    the unique index being treated as a match.
    """
    if not isinstance(token, str) or not token:
        return None
    now = datetime.utcnow()
    token_hash = hash_token(token)
    query = db.query(Invitation).filter(Invitation.token_hash == token_hash)
    invitation = _pending_filter(query, now=now).first()
    if invitation is None or not hmac.compare_digest(invitation.token_hash, token_hash):
        return None
    return invitation


def consume(db: Session, invitation: Invitation, *, user_id) -> None:
    """Mark an invitation as used. Caller commits."""
    invitation.consumed_at = datetime.utcnow()
    invitation.consumed_by = user_id


def revoke(db: Session, invitation: Invitation) -> None:
    invitation.revoked_at = datetime.utcnow()


def status_of(invitation: Invitation, *, now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    if invitation.consumed_at is not None:
        return "consumed"
    if invitation.revoked_at is not None:
        return "revoked"
    if invitation.expires_at <= now:
        return "expired"
    return "pending"
