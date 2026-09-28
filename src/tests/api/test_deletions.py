from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token
from app.db.models import (
    AnalysisReport,
    AnnotationEvent,
    AnnotationTask,
    AuditLog,
    JobStatus,
    LandmarkArtifact,
    Participant,
    ProcessingJob,
    Project,
    Session as DbSession,
    Study,
    User,
    VideoAsset,
)
from app.domains.acquisition.models import VideoCaptureRun
from tests.utils import create_random_user, random_lower_string

API = settings.API_V1_STR


@pytest.fixture
def purged(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.api.deletion.purge_storage",
        lambda keys, prefixes: calls.append((set(keys), set(prefixes))),
    )
    return calls


def _headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _colleague(db, user: User, role: str) -> User:
    other = User(
        email=f"{random_lower_string()}@example.com",
        name="colleague",
        role=role,
        organization_id=user.organization_id,
    )
    db.add(other)
    db.commit()
    db.refresh(other)
    return other


def _tree(db, user: User) -> dict:
    """Project → study → participant → session → video with derived rows."""
    project = Project(name="Projeto Alfa", organization_id=user.organization_id)
    db.add(project)
    db.flush()
    study = Study(name="Estudo Beta", project_id=project.id, status="draft")
    db.add(study)
    db.flush()
    participant = Participant(study_id=study.id, external_code="P-001")
    db.add(participant)
    db.flush()
    session = DbSession(participant_id=participant.id)
    db.add(session)
    db.flush()
    video = VideoAsset(
        session_id=session.id,
        filename="clip.mp4",
        storage_uri=f"s3://cast-videos/videos/{session.id}/clip.mp4",
        status="uploaded",
    )
    db.add(video)
    db.flush()
    job = ProcessingJob(video_asset_id=video.id, status=JobStatus.succeeded)
    db.add(job)
    db.flush()
    artifact = LandmarkArtifact(
        video_asset_id=video.id,
        processing_job_id=job.id,
        extractor_version="v1",
        video_checksum="abc",
        config_hash="def",
        fps=30.0,
        raw_uri=f"s3://cast-videos/landmarks/{video.id}/a/raw.parquet",
        overlay_prefix=f"landmarks/{video.id}/a/overlay",
        model_uri="/app/models/face_landmarker_v1.task",
    )
    db.add(artifact)
    task = AnnotationTask(video_asset_id=video.id)
    db.add(task)
    db.flush()
    db.add(AnnotationEvent(task_id=task.id, action="OF", start_frame=1, end_frame=5))
    capture = VideoCaptureRun(
        session_id=session.id,
        created_by=user.id,
        status="completed",
        filename="clip.webm",
        mime_type="video/webm",
        object_key=f"captures/{session.id}/clip.webm",
        video_asset_id=video.id,
    )
    db.add(capture)
    report = AnalysisReport(study_id=study.id, participant_id=participant.id)
    db.add(report)
    db.commit()
    return {
        "project": project,
        "study": study,
        "participant": participant,
        "session": session,
        "video": video,
        "job": job,
        "capture": capture,
        "report": report,
    }


def _delete(client: TestClient, path: str, headers: dict, confirmation: str, justification="Removido a pedido do comitê de ética"):
    return client.request(
        "DELETE",
        f"{API}{path}",
        headers=headers,
        json={"confirmation": confirmation, "justification": justification},
    )


def test_project_impact_lists_cascade(client, db):
    admin = create_random_user(db, is_superuser=True)
    tree = _tree(db, admin)

    response = client.get(
        f"{API}/projects/{tree['project'].id}/deletion-impact", headers=_headers(admin)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["confirmation_phrase"] == "Projeto Alfa"
    assert body["can_delete"] is True
    for table in ("projects", "studies", "participants", "sessions", "video_assets",
                  "landmark_artifacts", "annotation_events", "video_capture_runs",
                  "analysis_reports", "processing_jobs"):
        assert body["counts"][table] == 1, table
    # Two object keys, one overlay prefix, the video and the capture recording.
    assert body["storage_objects"] == 4


def test_admin_deletes_project_with_everything_below(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    tree = _tree(db, admin)
    video_id = tree["video"].id
    session_id = tree["session"].id

    response = _delete(client, f"/projects/{tree['project'].id}", _headers(admin), "Projeto Alfa")

    assert response.status_code == 204, response.text
    db.expire_all()
    assert db.query(Project).count() == 0
    assert db.query(Study).count() == 0
    assert db.query(VideoAsset).count() == 0
    assert db.query(AnnotationEvent).count() == 0
    assert db.query(VideoCaptureRun).count() == 0

    audit = db.query(AuditLog).filter(AuditLog.entity_type == "project").one()
    assert audit.action.value == "delete"
    assert audit.justification == "Removido a pedido do comitê de ética"
    assert audit.detail["snapshot"]["label"] == "Projeto Alfa"
    assert audit.detail["snapshot"]["cascade"]["video_assets"] == 1

    ((keys, prefixes),) = purged
    assert f"videos/{session_id}/clip.mp4" in keys
    assert f"landmarks/{video_id}/a/raw.parquet" in keys
    assert f"captures/{session_id}/clip.webm" in keys
    assert prefixes == {f"landmarks/{video_id}/a/overlay/"}
    # Local paths (the bundled MediaPipe model) are never storage objects.
    assert not any("face_landmarker" in key for key in keys)


def test_participant_deletion_keeps_study_report(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    tree = _tree(db, admin)
    report_id = tree["report"].id

    response = _delete(client, f"/participants/{tree['participant'].id}", _headers(admin), "P-001")

    assert response.status_code == 204, response.text
    db.expire_all()
    assert db.query(Participant).count() == 0
    assert db.query(Study).count() == 1
    report = db.query(AnalysisReport).filter(AnalysisReport.id == report_id).one()
    assert report.participant_id is None


def test_confirmation_must_match(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    tree = _tree(db, admin)

    response = _delete(client, f"/studies/{tree['study'].id}", _headers(admin), "outro nome")

    assert response.status_code == 422
    assert db.query(Study).count() == 1
    assert purged == []


def test_justification_is_required(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    tree = _tree(db, admin)

    response = _delete(
        client, f"/studies/{tree['study'].id}", _headers(admin), "Estudo Beta", justification="curta"
    )

    assert response.status_code == 422
    assert db.query(Study).count() == 1


def test_researcher_cannot_delete_project(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    researcher = _colleague(db, admin, "researcher")
    tree = _tree(db, admin)

    response = _delete(client, f"/projects/{tree['project'].id}", _headers(researcher), "Projeto Alfa")

    assert response.status_code == 403
    assert db.query(Project).count() == 1


def test_annotator_cannot_delete_video(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    annotator = _colleague(db, admin, "annotator")
    tree = _tree(db, admin)
    video = tree["video"]

    response = _delete(client, f"/videos/{video.id}", _headers(annotator), str(video.id)[:8])

    assert response.status_code == 403


def test_researcher_deletes_video_and_session_can_capture_again(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    researcher = _colleague(db, admin, "researcher")
    tree = _tree(db, admin)
    video = tree["video"]
    session_id = tree["session"].id

    response = _delete(client, f"/videos/{video.id}", _headers(researcher), str(video.id)[:8])

    assert response.status_code == 204, response.text
    db.expire_all()
    assert db.query(VideoAsset).count() == 0
    assert db.query(DbSession).filter(DbSession.id == session_id).count() == 1
    # The finished capture run would otherwise keep refusing a new capture.
    assert db.query(VideoCaptureRun).count() == 0


def test_active_job_blocks_deletion(client, db, purged):
    admin = create_random_user(db, is_superuser=True)
    tree = _tree(db, admin)
    job = tree["job"]
    job.status = JobStatus.running
    db.commit()

    impact = client.get(f"{API}/sessions/{tree['session'].id}/deletion-impact", headers=_headers(admin))
    response = _delete(
        client, f"/sessions/{tree['session'].id}", _headers(admin), str(tree["session"].id)[:8]
    )

    assert impact.json()["active_jobs"] == 1
    assert impact.json()["can_delete"] is False
    assert response.status_code == 409
    db.expire_all()
    assert db.query(DbSession).count() == 1
    assert db.query(AuditLog).filter(AuditLog.action == "delete").count() == 0


def test_cannot_delete_other_organization_entities(client, db, purged):
    owner = create_random_user(db, is_superuser=True)
    outsider = create_random_user(db, is_superuser=True)
    tree = _tree(db, owner)

    response = _delete(client, f"/projects/{tree['project'].id}", _headers(outsider), "Projeto Alfa")

    assert response.status_code == 404
    assert db.query(Project).filter(Project.id == UUID(str(tree["project"].id))).count() == 1
