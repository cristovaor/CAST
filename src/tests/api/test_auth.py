from fastapi.testclient import TestClient
from app.core.config import settings
from tests.utils import create_random_user

def test_login_success(client: TestClient, db) -> None:
    user = create_random_user(db)
    login_data = {
        "username": user.email,
        "password": user.raw_password,
    }
    r = client.post(f"{settings.API_V1_STR}/auth/login", data=login_data)
    assert r.status_code == 200
    tokens = r.json()
    assert "access_token" in tokens
    assert tokens["access_token"]

def test_login_wrong_password(client: TestClient, db) -> None:
    user = create_random_user(db)
    login_data = {
        "username": user.email,
        "password": "wrongpassword",
    }
    r = client.post(f"{settings.API_V1_STR}/auth/login", data=login_data)
    assert r.status_code == 400
    assert "detail" in r.json()

def test_login_non_existent_user(client: TestClient) -> None:
    login_data = {
        "username": "notfound@example.com",
        "password": "password",
    }
    r = client.post(f"{settings.API_V1_STR}/auth/login", data=login_data)
    assert r.status_code == 400
