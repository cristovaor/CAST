from fastapi.testclient import TestClient

from app.core.config import settings


def test_project_update_is_recorded_in_change_history(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    create_response = client.post(
        f"{settings.API_V1_STR}/projects/",
        headers=normal_user_token_headers,
        json={"name": "Original project", "description": "Before"},
    )
    assert create_response.status_code in (200, 201)
    project = create_response.json()

    update_response = client.patch(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=normal_user_token_headers,
        json={"name": "Updated project", "description": "After"},
    )
    assert update_response.status_code == 200

    history_response = client.get(
        f"{settings.API_V1_STR}/audit/history",
        headers=normal_user_token_headers,
        params={"entity_type": "project", "entity_id": project["id"]},
    )
    assert history_response.status_code == 200
    history = history_response.json()
    assert [entry["action"] for entry in history] == ["update", "create"]
    changes = history[0]["detail"]["changes"]
    assert changes["name"] == {"from": "Original project", "to": "Updated project"}
    assert changes["description"] == {"from": "Before", "to": "After"}


def test_participant_can_be_updated_with_history(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    project = client.post(
        f"{settings.API_V1_STR}/projects/",
        headers=normal_user_token_headers,
        json={"name": "Participant project"},
    ).json()
    study = client.post(
        f"{settings.API_V1_STR}/studies/",
        headers=normal_user_token_headers,
        json={"project_id": project["id"], "name": "Participant study"},
    ).json()
    participant = client.post(
        f"{settings.API_V1_STR}/participants/",
        headers=normal_user_token_headers,
        json={"study_id": study["id"], "external_code": "P-001"},
    ).json()

    update_response = client.patch(
        f"{settings.API_V1_STR}/participants/{participant['id']}",
        headers=normal_user_token_headers,
        json={
            "external_code": "P-001-A",
            "demographic_group": {"group": "control"},
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["external_code"] == "P-001-A"

    history_response = client.get(
        f"{settings.API_V1_STR}/audit/history",
        headers=normal_user_token_headers,
        params={"entity_type": "participant", "entity_id": participant["id"]},
    )
    history = history_response.json()
    assert history[0]["action"] == "update"
    assert history[0]["detail"]["changes"]["external_code"]["to"] == "P-001-A"


def test_admin_can_create_and_update_organization_user(
    client: TestClient,
    superuser_token_headers: dict,
) -> None:
    create_response = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=superuser_token_headers,
        json={
            "email": "team.member@example.com",
            "password": "temporary-password-123",
            "name": "Team Member",
            "role": "annotator",
        },
    )
    assert create_response.status_code == 201
    user = create_response.json()
    assert user["role"] == "annotator"

    update_response = client.patch(
        f"{settings.API_V1_STR}/users/{user['id']}",
        headers=superuser_token_headers,
        json={"name": "Senior Team Member", "role": "researcher"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "researcher"

    history_response = client.get(
        f"{settings.API_V1_STR}/audit/history",
        headers=superuser_token_headers,
        params={"entity_type": "user", "entity_id": user["id"]},
    )
    history = history_response.json()
    assert [entry["action"] for entry in history] == ["update", "create"]
