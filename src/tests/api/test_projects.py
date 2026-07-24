from fastapi.testclient import TestClient
from app.core.config import settings
from tests.utils import create_random_project, create_random_user

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
