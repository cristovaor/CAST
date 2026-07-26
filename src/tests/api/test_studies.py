from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models import (
    EEGAsset,
    Participant,
    Project,
    QualityVerdict,
    Session,
    Study,
    VideoAsset,
)


def _create_project(client: TestClient, headers: dict) -> dict:
    response = client.post(
        f"{settings.API_V1_STR}/projects/",
        headers=headers,
        json={"name": "Study parent project", "description": "Project for study tests"},
    )
    assert response.status_code in (200, 201)
    return response.json()


def test_create_study_requires_project(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    response = client.post(
        f"{settings.API_V1_STR}/studies/",
        headers=normal_user_token_headers,
        json={"name": "Study without project"},
    )

    assert response.status_code == 422
    assert any(
        error["loc"][-1] == "project_id"
        for error in response.json()["detail"]
    )


def test_create_study_links_owned_project(
    client: TestClient,
    normal_user_token_headers: dict,
) -> None:
    project = _create_project(client, normal_user_token_headers)

    response = client.post(
        f"{settings.API_V1_STR}/studies/",
        headers=normal_user_token_headers,
        json={
            "name": "Linked study",
            "description": "Created through the study wizard",
            "project_id": project["id"],
            "config": {"design": "observational"},
        },
    )

    assert response.status_code == 200
    study = response.json()
    assert study["name"] == "Linked study"
    assert study["project_id"] == project["id"]
    assert study["config"]["design"] == "observational"


def test_study_list_and_detail_include_live_counts(
    client: TestClient,
    db,
    normal_user,
    normal_user_token_headers: dict,
) -> None:
    project = Project(name="Count project", organization_id=normal_user.organization_id)
    db.add(project)
    db.flush()
    study = Study(name="Count study", project_id=project.id, created_by=normal_user.id)
    db.add(study)
    db.flush()
    participant = Participant(study_id=study.id, external_code="P-COUNT")
    db.add(participant)
    db.flush()
    db.add(Session(participant_id=participant.id))
    db.commit()

    list_response = client.get(
        f"{settings.API_V1_STR}/studies/",
        headers=normal_user_token_headers,
    )
    detail_response = client.get(
        f"{settings.API_V1_STR}/studies/{study.id}",
        headers=normal_user_token_headers,
    )

    assert list_response.status_code == 200
    listed_study = next(item for item in list_response.json() if item["id"] == str(study.id))
    assert listed_study["participant_count"] == 1
    assert listed_study["session_count"] == 1
    assert detail_response.status_code == 200
    assert detail_response.json()["participant_count"] == 1
    assert detail_response.json()["session_count"] == 1


def test_study_quality_summary_aggregates_persisted_metrics(
    client: TestClient,
    db,
    normal_user,
    normal_user_token_headers: dict,
) -> None:
    project = Project(name="Quality project", organization_id=normal_user.organization_id)
    db.add(project)
    db.flush()
    study = Study(name="Quality study", project_id=project.id, created_by=normal_user.id)
    db.add(study)
    db.flush()
    participant = Participant(study_id=study.id, external_code="P-QA")
    db.add(participant)
    db.flush()
    session = Session(participant_id=participant.id)
    db.add(session)
    db.flush()
    db.add_all([
        VideoAsset(
            session_id=session.id,
            filename="quality.mp4",
            quality_verdict=QualityVerdict.approved_with_caveats,
            quality_report={
                "validFrameRatio": 0.9,
                "faceDetectionRate": 0.8,
                "findings": [{"id": "video-finding"}],
            },
        ),
        EEGAsset(
            session_id=session.id,
            filename="quality.csv",
            quality_verdict=QualityVerdict.review_required,
            valid_ratio=0.75,
            quality_findings=[{"id": "eeg-finding"}],
        ),
    ])
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/studies/{study.id}/quality-summary",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200
    summary = response.json()
    assert summary["sessions_count"] == 1
    assert summary["video"]["average_valid_ratio"] == 0.9
    assert summary["video"]["average_face_detection_rate"] == 0.8
    assert summary["video"]["findings_count"] == 1
    assert summary["video"]["verdicts"]["approved_with_caveats"] == 1
    assert summary["eeg"]["average_valid_ratio"] == 0.75
    assert summary["eeg"]["findings_count"] == 1
    assert summary["eeg"]["verdicts"]["review_required"] == 1
