"""Invite-only federated authentication.

These tests pin the security contract: a verified Google identity is *not*
enough to get in — an unconsumed, unexpired, e-mail-matching invitation is
required. The Firebase verifier itself is stubbed, since exercising it would
mean talking to Google; what is under test is the authorization decision the
API makes once an identity has been verified.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.core import identity as identity_module
from app.core.config import settings
from app.core.identity import ExternalIdentity, IdentityVerificationError
from app.db.models import Invitation, User, UserIdentity, UserRole
from app.services import invitations as invitation_service
from tests.utils import create_random_organization, create_random_user, random_lower_string


class StubVerifier:
    """Stands in for Google: returns a fixed identity, or raises."""

    def __init__(self, identity: ExternalIdentity | None = None, *, fail: bool = False):
        self._identity = identity
        self._fail = fail

    def verify(self, id_token: str) -> ExternalIdentity:
        if self._fail or self._identity is None:
            raise IdentityVerificationError()
        return self._identity


def make_identity(email: str, subject: str = "google-sub-1", name: str = "Convidado") -> ExternalIdentity:
    return ExternalIdentity(
        provider="google.com",
        subject=subject,
        email=email,
        email_verified=True,
        name=name,
        auth_time=datetime.now().astimezone(),
    )


@pytest.fixture(autouse=True)
def enable_google(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "cast-test-project")
    yield


@pytest.fixture
def stub_google(monkeypatch):
    def _install(identity: ExternalIdentity | None, *, fail: bool = False):
        verifier = StubVerifier(identity, fail=fail)
        # The route resolves the verifier through this module-level factory.
        monkeypatch.setattr(
            "app.api.v1.routes_auth.get_identity_verifier", lambda: verifier
        )
        return verifier

    return _install


def _invite(db, org_id, email, *, role=UserRole.researcher, hours=24, name=None):
    invitation, token = invitation_service.create_invitation(
        db,
        email=email,
        organization_id=org_id,
        role=role,
        invited_by=None,
        name=name,
        expires_hours=hours,
    )
    db.commit()
    return invitation, token


# ── The core gate ──────────────────────────────────────────────────────────

def test_google_login_rejected_without_invitation(client, db, stub_google):
    """A perfectly valid Google account with no invitation gets 403, not 200."""
    stub_google(make_identity("stranger@example.com"))

    response = client.post("/api/v1/auth/google", json={"id_token": "valid-token"})

    assert response.status_code == 403
    assert db.query(User).filter(User.email == "stranger@example.com").first() is None


def test_google_login_creates_user_from_invitation(client, db, stub_google):
    org = create_random_organization(db)
    _invite(db, org.id, "invited@example.com", role=UserRole.annotator, name="Ana")
    stub_google(make_identity("invited@example.com"))

    response = client.post("/api/v1/auth/google", json={"id_token": "valid-token"})

    assert response.status_code == 200
    assert response.json()["access_token"]

    user = db.query(User).filter(User.email == "invited@example.com").first()
    assert user is not None
    # Role and organization come from the invitation, not the token.
    assert user.role == UserRole.annotator
    assert user.organization_id == org.id
    assert user.name == "Ana"
    # Federated accounts must not carry a usable password hash.
    assert user.password_hash is None


def test_invitation_is_single_use(client, db, stub_google):
    """The second sign-in of a *different* person cannot reuse the invite."""
    org = create_random_organization(db)
    invitation, _ = _invite(db, org.id, "invited@example.com")

    stub_google(make_identity("invited@example.com", subject="sub-first"))
    assert client.post("/api/v1/auth/google", json={"id_token": "t"}).status_code == 200

    db.refresh(invitation)
    assert invitation.consumed_at is not None

    # A second, distinct Google account with the same e-mail is impossible in
    # practice, but a *new* invite-less user must still be refused.
    stub_google(make_identity("other@example.com", subject="sub-second"))
    assert client.post("/api/v1/auth/google", json={"id_token": "t"}).status_code == 403


def test_returning_user_logs_in_without_new_invitation(client, db, stub_google):
    """Once linked, the identity logs in on its own — invites are not re-checked."""
    org = create_random_organization(db)
    _invite(db, org.id, "invited@example.com")
    identity = make_identity("invited@example.com", subject="stable-sub")

    stub_google(identity)
    assert client.post("/api/v1/auth/google", json={"id_token": "t"}).status_code == 200
    # Invitation is now consumed; the same identity must still be able to return.
    assert client.post("/api/v1/auth/google", json={"id_token": "t"}).status_code == 200

    assert db.query(UserIdentity).filter(UserIdentity.subject == "stable-sub").count() == 1
    assert db.query(User).filter(User.email == "invited@example.com").count() == 1


def test_expired_invitation_is_refused(client, db, stub_google):
    org = create_random_organization(db)
    invitation, _ = _invite(db, org.id, "late@example.com")
    invitation.expires_at = datetime.utcnow() - timedelta(hours=1)
    db.commit()

    stub_google(make_identity("late@example.com"))

    assert client.post("/api/v1/auth/google", json={"id_token": "t"}).status_code == 403


def test_revoked_invitation_is_refused(client, db, stub_google):
    org = create_random_organization(db)
    invitation, _ = _invite(db, org.id, "revoked@example.com")
    invitation_service.revoke(db, invitation)
    db.commit()

    stub_google(make_identity("revoked@example.com"))

    assert client.post("/api/v1/auth/google", json={"id_token": "t"}).status_code == 403


def test_invite_token_for_another_email_is_refused(client, db, stub_google):
    """A leaked invite link must not onboard whoever happens to open it."""
    org = create_random_organization(db)
    _, token = _invite(db, org.id, "intended@example.com")

    stub_google(make_identity("attacker@example.com"))
    response = client.post(
        "/api/v1/auth/google", json={"id_token": "t", "invite_token": token}
    )

    assert response.status_code == 403
    assert db.query(User).filter(User.email == "attacker@example.com").first() is None


def test_invalid_google_token_is_rejected(client, db, stub_google):
    org = create_random_organization(db)
    _invite(db, org.id, "invited@example.com")
    stub_google(None, fail=True)

    response = client.post("/api/v1/auth/google", json={"id_token": "forged"})

    assert response.status_code == 401


def test_google_login_disabled_when_project_unset(client, db, monkeypatch, stub_google):
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "")
    stub_google(make_identity("invited@example.com"))

    response = client.post("/api/v1/auth/google", json={"id_token": "t"})

    assert response.status_code == 404


def test_existing_password_user_is_linked_not_duplicated(client, db, stub_google):
    """An existing local account is adopted by the verified e-mail, once."""
    user = create_random_user(db)
    stub_google(make_identity(user.email, subject="link-sub"))

    response = client.post("/api/v1/auth/google", json={"id_token": "t"})

    assert response.status_code == 200
    assert db.query(User).filter(User.email == user.email).count() == 1
    link = db.query(UserIdentity).filter(UserIdentity.subject == "link-sub").one()
    assert link.user_id == user.id


def test_deactivated_user_cannot_log_in_with_google(client, db, stub_google):
    user = create_random_user(db)
    user.is_active = False
    db.commit()
    stub_google(make_identity(user.email, subject="deactivated-sub"))

    response = client.post("/api/v1/auth/google", json={"id_token": "t"})

    assert response.status_code == 403


# ── Password registration must honour the same gate ─────────────────────────

def test_password_register_requires_invitation(client, db):
    """Otherwise /register would be an open bypass around the Google gate."""
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "selfsignup@example.com",
            "password": "a-very-long-password",
            "name": "Self Signup",
        },
    )

    assert response.status_code == 403
    assert db.query(User).filter(User.email == "selfsignup@example.com").first() is None


def test_password_register_succeeds_with_invitation(client, db):
    org = create_random_organization(db)
    _, token = _invite(db, org.id, "invited@example.com", role=UserRole.viewer)

    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "invited@example.com",
            "password": "a-very-long-password",
            "name": "Invited Person",
            "invite_token": token,
        },
    )

    assert response.status_code == 201
    user = db.query(User).filter(User.email == "invited@example.com").one()
    assert user.role == UserRole.viewer
    assert user.organization_id == org.id


def test_federated_user_cannot_login_with_password(client, db, stub_google):
    """A NULL hash must be refused, not crash and not match any password."""
    org = create_random_organization(db)
    _invite(db, org.id, "nopass@example.com")
    stub_google(make_identity("nopass@example.com"))
    assert client.post("/api/v1/auth/google", json={"id_token": "t"}).status_code == 200
    assert db.query(User).filter(User.email == "nopass@example.com").one().password_hash is None

    response = client.post(
        "/api/v1/auth/login",
        data={"username": "nopass@example.com", "password": "any-guessed-password"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    assert response.status_code == 401


# ── Admin invitation API ───────────────────────────────────────────────────

def test_non_admin_cannot_create_invitations(client, db, normal_user_token_headers):
    response = client.post(
        "/api/v1/invitations",
        json={"email": "someone@example.com"},
        headers=normal_user_token_headers,
    )

    assert response.status_code == 403


def test_admin_creates_invitation_scoped_to_own_org(client, db, superuser_token_headers):
    response = client.post(
        "/api/v1/invitations",
        json={"email": "New.Person@Example.com", "role": "annotator"},
        headers=superuser_token_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    # E-mails are normalised so the later token match is case-insensitive.
    assert body["email"] == "new.person@example.com"
    assert "token=" in body["accept_url"]

    invitation = db.query(Invitation).filter(Invitation.email == "new.person@example.com").one()
    # Only the hash is persisted — never the plaintext token.
    assert invitation.token_hash
    assert invitation.token_hash not in body["accept_url"]


def test_duplicate_pending_invitation_is_rejected(client, db, superuser_token_headers):
    payload = {"email": "dupe@example.com"}
    first = client.post("/api/v1/invitations", json=payload, headers=superuser_token_headers)
    assert first.status_code == 201

    second = client.post("/api/v1/invitations", json=payload, headers=superuser_token_headers)
    assert second.status_code == 409


def test_admin_can_revoke_invitation(client, db, superuser_token_headers):
    created = client.post(
        "/api/v1/invitations",
        json={"email": "revokeme@example.com"},
        headers=superuser_token_headers,
    ).json()

    response = client.delete(
        f"/api/v1/invitations/{created['id']}", headers=superuser_token_headers
    )

    assert response.status_code == 204
    # Compared by e-mail rather than id: the test harness stores UUIDs as
    # strings under SQLite, so filtering by a JSON-decoded id does not bind.
    invitation = db.query(Invitation).filter(Invitation.email == "revokeme@example.com").one()
    assert invitation.revoked_at is not None
