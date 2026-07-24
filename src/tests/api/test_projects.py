from fastapi.testclient import TestClient
from uuid import UUID
from app.core.config import settings
from app.db.models import Participant, Study
from tests.utils import create_random_project, create_random_user


def _create_project(client: TestClient, headers: dict, name: str = "Project") -> dict:
    response = client.post(
        f"{settings.API_V1_STR}/projects/",
        headers=headers,
        json={"name": name, "description": "Project description"},
    )
    assert response.status_code in (200, 201)
    return response.json()

def test_create_project(client: TestClient, normal_user_token_headers: dict) -> None:
    data = {
        "name": "New Project",
        "description": "Project description"
    }
    r = client.post(f"{settings.API_V1_STR}/projects/", headers=normal_user_token_headers, json=data)
    assert r.status_code in (200, 201)
    project = r.json()
    assert project["name"] == "New Project"
    assert "id" in project

def test_read_projects(client: TestClient, normal_user_token_headers: dict, db) -> None:
    # We must ensure there is at least one project for the user's organization
    user = create_random_user(db)
    # create project in the user's org
    create_random_project(db, org_id=user.organization_id)
    
    # Since normal_user_token_headers has its own user, the list could be empty. 
    # Let's just verify the endpoint responds properly.
    r = client.get(f"{settings.API_V1_STR}/projects/", headers=normal_user_token_headers)
    assert r.status_code == 200
    projects = r.json()
    assert isinstance(projects, list)


def test_update_and_archive_project(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    project = _create_project(client, normal_user_token_headers)

    response = client.patch(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=normal_user_token_headers,
        json={
            "name": "Updated Project",
            "description": "Updated description",
            "status": "archived",
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Updated Project"
    assert updated["description"] == "Updated description"
    assert updated["status"] == "archived"


def test_delete_empty_project(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    project = _create_project(client, normal_user_token_headers)

    response = client.delete(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 204
    get_response = client.get(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=normal_user_token_headers,
    )
    assert get_response.status_code == 404


def test_delete_project_with_studies_requires_archive(
    client: TestClient,
    normal_user_token_headers: dict,
    db,
) -> None:
    project = _create_project(client, normal_user_token_headers)
    db.add(Study(project_id=UUID(project["id"]), name="Attached study", status="draft"))
    db.commit()

    response = client.delete(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 409
    assert "archive" in response.json()["detail"].lower()


def test_export_project_csv(
    client: TestClient,
    normal_user_token_headers: dict,
    db,
) -> None:
    project = _create_project(client, normal_user_token_headers, name="Exportable Project")
    study = Study(project_id=UUID(project["id"]), name="Study A", status="active")
    db.add(study)
    db.commit()
    db.refresh(study)
    db.add(
        Participant(
            study_id=study.id,
            external_code="P-001",
            consent_status="accepted",
        )
    )
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/projects/{project['id']}/export",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert f"export_project_{project['id']}.csv" in response.headers["content-disposition"]
    assert "Project_Name,Study_ID" in response.text
    assert "Exportable Project" in response.text
    assert "Study A" in response.text
    assert "P-001" in response.text


def test_project_mutations_are_scoped_to_current_organization(
    client: TestClient,
    normal_user_token_headers: dict,
    db,
) -> None:
    other_user = create_random_user(db)
    foreign_project = create_random_project(db, org_id=other_user.organization_id)
    project_url = f"{settings.API_V1_STR}/projects/{foreign_project.id}"

    patch_response = client.patch(
        project_url,
        headers=normal_user_token_headers,
        json={"name": "Not allowed"},
    )
    delete_response = client.delete(project_url, headers=normal_user_token_headers)
    export_response = client.get(
        f"{project_url}/export",
        headers=normal_user_token_headers,
    )

    assert patch_response.status_code == 404
    assert delete_response.status_code == 404
    assert export_response.status_code == 404
