"""Verification of Google Identity Platform / Firebase Auth ID tokens.

The browser never sends us a password for federated login: it sends a Firebase
ID token, which we verify server-side against Google's public keys. Verification
covers the signature, the issuer, the expiry and the audience (our Firebase
project). A token minted for a *different* Firebase project is rejected, which
is what stops anyone from pointing their own project at this API.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)

# Only providers we have actually vetted are accepted. Firebase reports the
# provider used for the sign-in in the "firebase.sign_in_provider" claim.
ALLOWED_PROVIDERS = frozenset({"google.com"})


class IdentityVerificationError(Exception):
    """A deliberately generic external authentication failure.

    The message is intentionally uninformative: distinguishing "expired" from
    "wrong audience" from "bad signature" to the caller helps an attacker probe
    the configuration and can leak token material into logs.
    """

    def __init__(self) -> None:
        super().__init__("Authentication failed")


@dataclass(frozen=True)
class ExternalIdentity:
    """A verified federated identity. Construction validates every field."""

    provider: str
    subject: str
    email: str
    email_verified: bool
    name: str | None = None
    auth_time: datetime | None = None

    def __post_init__(self) -> None:
        for field in ("provider", "subject", "email"):
            value = getattr(self, field)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{field} must be a non-empty string")
            object.__setattr__(self, field, value.strip())
        # E-mails are matched against invitations case-insensitively.
        object.__setattr__(self, "email", self.email.casefold())
        if self.provider not in ALLOWED_PROVIDERS:
            raise ValueError("unsupported identity provider")
        if not isinstance(self.email_verified, bool):
            raise TypeError("email_verified must be a bool")
        if self.auth_time is not None:
            if self.auth_time.tzinfo is None or self.auth_time.utcoffset() is None:
                raise ValueError("auth_time must be timezone-aware")
            object.__setattr__(self, "auth_time", self.auth_time.astimezone(timezone.utc))


class IdentityVerifier(Protocol):
    def verify(self, id_token: str) -> ExternalIdentity: ...


class GoogleIdentityVerifier:
    """Verifies Firebase ID tokens against the configured Firebase project."""

    def __init__(self, project_id: str) -> None:
        if not isinstance(project_id, str) or not project_id.strip():
            raise ValueError("project_id must not be empty")
        self._project_id = project_id.strip()

    def verify(self, id_token: str) -> ExternalIdentity:
        try:
            # Imported lazily so the API still boots when federated login is
            # disabled and google-auth is not installed.
            from google.auth.transport.requests import Request
            from google.oauth2 import id_token as google_id_token

            if not isinstance(id_token, str) or not id_token:
                raise ValueError("missing token")

            claims = google_id_token.verify_firebase_token(
                id_token,
                Request(),
                audience=self._project_id,
                clock_skew_in_seconds=10,
            )

            firebase = claims.get("firebase")
            provider = firebase.get("sign_in_provider") if isinstance(firebase, dict) else None
            subject = claims.get("sub")
            email = claims.get("email")
            auth_time = claims.get("auth_time")

            # An unverified e-mail must never satisfy an invitation: the whole
            # invite check is an e-mail match, so accepting an unverified
            # address would let anyone claim an invite meant for someone else.
            if (
                not isinstance(provider, str)
                or not isinstance(subject, str)
                or not isinstance(email, str)
                or isinstance(auth_time, bool)
                or not isinstance(auth_time, (int, float))
                or not math.isfinite(auth_time)
                or auth_time <= 0
                or claims.get("email_verified") is not True
            ):
                raise ValueError("incomplete or unverified claims")

            name = claims.get("name")
            return ExternalIdentity(
                provider=provider,
                subject=subject,
                email=email,
                email_verified=True,
                name=name if isinstance(name, str) and name.strip() else None,
                auth_time=datetime.fromtimestamp(auth_time, tz=timezone.utc),
            )
        except Exception as exc:
            # Never propagate provider/library diagnostics: they can disclose
            # token material. Details are logged only outside production.
            if settings.ENVIRONMENT in {"local", "test", "development"}:
                logger.warning(
                    "Firebase identity verification failed: %s: %s",
                    type(exc).__name__,
                    exc,
                )
            raise IdentityVerificationError() from None


def get_identity_verifier() -> IdentityVerifier:
    """Return the configured verifier, or raise if federated login is off."""
    if not settings.FIREBASE_PROJECT_ID:
        raise IdentityVerificationError()
    return GoogleIdentityVerifier(settings.FIREBASE_PROJECT_ID)
