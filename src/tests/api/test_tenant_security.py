from app.core.config import settings
from app.db.models import AnnotationTask, Dataset, ProcessingJob
from tests.utils import (
    create_random_project,
    create_random_study,
    create_random_user,
    create_random_video,
)


def test_protected_routes_reject_anonymous_requests(client):
    response = client.get(f"{settings.API_V1_STR}/projects/")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_malformed_token_is_rejected_without_server_error(client):
    response = client.get(
        f"{settings.API_V1_STR}/projects/",
        headers={"Authorization": "Bearer malformed-token"},
    )
    assert response.status_code == 401


def test_resources_from_another_organization_are_not_disclosed(
    client,
    normal_user_token_headers,
    db,
):
    foreign_user = create_random_user(db)
    project = create_random_project(db, org_id=foreign_user.organization_id)
    study = create_random_study(db, project_id=project.id)
    video = create_random_video(db, study_id=study.id)
    session = video.session
    participant = session.participant

    job = ProcessingJob(video_asset_id=video.id, job_type="infer", status="queued")
    task = AnnotationTask(video_asset_id=video.id, assignee_id=foreign_user.id)
    dataset = Dataset(
        organization_id=foreign_user.organization_id,
        name="Foreign dataset",
        dataset_version="1.0",
        owner=foreign_user.name,
    )
    db.add_all([job, task, dataset])
    db.commit()

    jobs_response = client.get(
        f"{settings.API_V1_STR}/jobs/",
        headers=normal_user_token_headers,
    )
    assert jobs_response.status_code == 200
    assert jobs_response.json() == []

    protected_paths = [
        f"/studies/{study.id}",
        f"/sessions/{session.id}",
        f"/videos/{video.id}/timeline",
        f"/jobs/{job.id}",
        f"/annotation-tasks/{task.id}",
        f"/datasets/{dataset.id}",
    ]
    for path in protected_paths:
        response = client.get(
            f"{settings.API_V1_STR}{path}",
            headers=normal_user_token_headers,
        )
        assert response.status_code == 404, path

    consent_response = client.post(
        f"{settings.API_V1_STR}/participants/{participant.id}/consent",
        headers=normal_user_token_headers,
        json={"status": "accepted"},
    )
    assert consent_response.status_code == 404
