import pytest

from app.core import rate_limit
from app.core.config import settings
from app.core.security import create_access_token
from app.db.models import ApiRequestLog, AuditLog, Organization, User
from app.main import app
from tests.conftest import TestingSessionLocal
from tests.utils import create_random_user, random_lower_string

API = settings.API_V1_STR


def _headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def limited(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(rate_limit, "_counter", rate_limit.MemoryCounter())


@pytest.fixture
def request_log(monkeypatch):
    monkeypatch.setattr(settings, "REQUEST_LOG_ENABLED", True)
    app.state.request_log_session_factory = TestingSessionLocal
    yield
    del app.state.request_log_session_factory


def test_read_budget_returns_429_with_retry_after(client, db, limited, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_READ_PER_MINUTE", 3)
    user = create_random_user(db)
    headers = _headers(user)

    statuses = [client.get(f"{API}/projects/", headers=headers).status_code for _ in range(4)]

    assert statuses == [200, 200, 200, 429]
    blocked = client.get(f"{API}/projects/", headers=headers)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1
    assert blocked.headers["x-ratelimit-remaining"] == "0"


def test_budgets_are_per_user(client, db, limited, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_READ_PER_MINUTE", 1)
    first, second = create_random_user(db), create_random_user(db)

    assert client.get(f"{API}/projects/", headers=_headers(first)).status_code == 200
    assert client.get(f"{API}/projects/", headers=_headers(first)).status_code == 429
    assert client.get(f"{API}/projects/", headers=_headers(second)).status_code == 200


def test_login_is_limited_per_ip(client, db, limited, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_PER_MINUTE", 2)
    form = {"username": "nobody@example.com", "password": "wrong"}

    statuses = [client.post(f"{API}/auth/login", data=form).status_code for _ in range(3)]

    assert statuses == [401, 401, 429]


def test_health_is_never_limited(client, limited, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_READ_PER_MINUTE", 1)
    for _ in range(3):
        assert client.get(f"{API}/health/").status_code != 429


def test_writes_and_denials_are_logged_without_bodies(client, db, request_log):
    admin = create_random_user(db, is_superuser=True)
    researcher = User(
        email=f"{random_lower_string()}@example.com",
        name="r",
        role="researcher",
        organization_id=admin.organization_id,
    )
    db.add(researcher)
    db.commit()

    created = client.post(
        f"{API}/projects/", headers=_headers(admin), json={"name": "Segredo"}
    )
    client.get(f"{API}/projects/", headers=_headers(admin))  # reads are not logged
    denied = client.get(f"{API}/audit/logs", headers=_headers(researcher))

    assert created.status_code == 200
    assert denied.status_code == 403
    db.expire_all()
    rows = db.query(ApiRequestLog).order_by(ApiRequestLog.created_at).all()
    assert [(row.method, row.status_code) for row in rows] == [("POST", 200), ("GET", 403)]
    assert rows[0].actor_label == admin.email
    assert rows[0].organization_id == admin.organization_id
    assert rows[0].route == f"{API}/projects/"
    assert "Segredo" not in (rows[0].path + (rows[0].route or ""))

    page = client.get(f"{API}/audit/requests?status_class=denied", headers=_headers(admin))
    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert page.json()["items"][0]["actor_label"] == researcher.email


def test_audit_logs_are_admin_only_and_filterable(client, db):
    admin = create_random_user(db, is_superuser=True)
    researcher = create_random_user(db)
    client.post(f"{API}/projects/", headers=_headers(admin), json={"name": "Alfa"})
    client.post(f"{API}/projects/", headers=_headers(admin), json={"name": "Beta"})

    assert client.get(f"{API}/audit/logs", headers=_headers(researcher)).status_code == 403
    page = client.get(
        f"{API}/audit/logs?action=create&entity_type=project&limit=1", headers=_headers(admin)
    )
    assert page.status_code == 200
    assert page.json()["total"] == 2
    assert len(page.json()["items"]) == 1

    summary = client.get(f"{API}/audit/summary", headers=_headers(admin))
    assert summary.status_code == 200
    assert summary.json()["audit_events"] == 2


def test_login_success_and_failure_are_audited(client, db):
    user = create_random_user(db)

    bad = client.post(f"{API}/auth/login", data={"username": user.email, "password": "wrong"})
    good = client.post(
        f"{API}/auth/login", data={"username": user.email, "password": user.raw_password}
    )

    assert bad.status_code == 401
    assert good.status_code == 200
    actions = [
        row.action.value
        for row in db.query(AuditLog).filter(AuditLog.entity_id == str(user.id)).order_by(AuditLog.created_at)
    ]
    assert actions == ["login_failed", "login"]


def test_admin_edits_organization_settings(client, db):
    admin = create_random_user(db, is_superuser=True)

    response = client.patch(
        f"{API}/settings/organization",
        headers=_headers(admin),
        json={
            "name": "Laboratório CAST",
            "display_name": "  CAST Lab ",
            "contact_email": "",
            "timezone": "America/Recife",
            "default_locale": "en",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Laboratório CAST"
    assert body["display_name"] == "CAST Lab"
    assert body["contact_email"] is None
    assert body["timezone"] == "America/Recife"
    org = db.query(Organization).filter(Organization.id == admin.organization_id).one()
    assert org.default_locale == "en"
    audit = db.query(AuditLog).filter(AuditLog.entity_type == "organization").one()
    assert audit.detail["changes"]["name"]["to"] == "Laboratório CAST"


def test_organization_settings_validation_and_permission(client, db):
    admin = create_random_user(db, is_superuser=True)
    researcher = User(
        email=f"{random_lower_string()}@example.com",
        name="r",
        role="researcher",
        organization_id=admin.organization_id,
    )
    db.add(researcher)
    db.commit()

    forbidden = client.patch(
        f"{API}/settings/organization", headers=_headers(researcher), json={"name": "X Y"}
    )
    bad_tz = client.patch(
        f"{API}/settings/organization", headers=_headers(admin), json={"timezone": "Mars/Base"}
    )
    bad_locale = client.patch(
        f"{API}/settings/organization", headers=_headers(admin), json={"default_locale": "fr"}
    )

    assert forbidden.status_code == 403
    assert bad_tz.status_code == 422
    assert bad_locale.status_code == 422
