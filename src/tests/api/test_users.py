from fastapi.testclient import TestClient
from app.core.config import settings
from tests.utils import create_random_user

def test_get_users_me(client: TestClient, normal_user_token_headers: dict) -> None:
    r = client.get(f"{settings.API_V1_STR}/auth/me", headers=normal_user_token_headers)
    assert r.status_code == 200
    user_info = r.json()
    assert "email" in user_info
    assert "id" in user_info
    assert "role" in user_info

def test_get_users_me_unauthorized(client: TestClient) -> None:
    r = client.get(f"{settings.API_V1_STR}/auth/me")
    assert r.status_code == 401

def test_register_user_requires_invitation(client: TestClient, db) -> None:
    """Registration is invite-only; open self-signup is refused.

    This endpoint used to create a user and an organization for any caller,
    which would bypass the Google invite gate entirely.
    """
    data = {
        "email": "newuser@example.com",
        "password": "strongpassword123",
        "name": "New User"
    }
    r = client.post(f"{settings.API_V1_STR}/auth/register", json=data)
    assert r.status_code == 403


def test_register_user_with_invitation(client: TestClient, db) -> None:
    from app.db.models import UserRole
    from app.services import invitations as invitation_service
    from tests.utils import create_random_organization

    org = create_random_organization(db)
    _, token = invitation_service.create_invitation(
        db,
        email="newuser@example.com",
        organization_id=org.id,
        role=UserRole.researcher,
        invited_by=None,
    )
    db.commit()

    data = {
        "email": "newuser@example.com",
        "password": "strongpassword123",
        "name": "New User",
        "invite_token": token,
    }
    r = client.post(f"{settings.API_V1_STR}/auth/register", json=data)
    assert r.status_code in (200, 201)
    user_data = r.json()
    assert user_data["email"] == "newuser@example.com"
    assert "id" in user_data
