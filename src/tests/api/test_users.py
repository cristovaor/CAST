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

def test_register_user(client: TestClient, db) -> None:
    data = {
        "email": "newuser@example.com",
        "password": "strongpassword123",
        "name": "New User"
    }
    r = client.post(f"{settings.API_V1_STR}/auth/register", json=data)
    assert r.status_code in (200, 201)
    user_data = r.json()
    assert user_data["email"] == "newuser@example.com"
    assert "id" in user_data
