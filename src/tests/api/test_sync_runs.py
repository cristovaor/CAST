from unittest.mock import patch

from app.db.models import (
    EEGAsset,
    JobStatus,
    Participant,
    ProcessingJob,
    Project,
    Session as SessionModel,
    Study,
    Synchronization,
    SyncRun,
)
from app.services.sync_transform_service import eeg_to_video_ms, video_to_eeg_ms


def _session_for_user(db, user, *, with_eeg: bool = False):
    project = Project(
        name="Sync project",
        organization_id=user.organization_id,
        status="active",
    )
    db.add(project)
    db.flush()
    study = Study(name="Sync study", project_id=project.id, status="active")
    db.add(study)
    db.flush()
    participant = Participant(study_id=study.id, external_code="SYNC-001")
    db.add(participant)
    db.flush()
    session = SessionModel(participant_id=participant.id)
    db.add(session)
    db.flush()
    if with_eeg:
        db.add(
            EEGAsset(
                session_id=session.id,
                filename="synthetic.csv",
                storage_uri="s3://test/synthetic.csv",
                sync_offset_ms=0,
            )
        )
    db.commit()
    db.refresh(session)
    return session


def test_get_is_read_only_and_does_not_create_official_sync(
    client, db, normal_user, normal_user_token_headers
):
    session = _session_for_user(db, normal_user)

    response = client.get(
        f"/api/v1/sync/{session.id}",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 200
    assert response.json()["offset_ms"] == 0
    assert len(response.json()["capabilities"]) == 10
    assert db.query(Synchronization).filter_by(session_id=session.id).first() is None


def test_sync_session_is_hidden_across_tenants(
    client, db, normal_user, normal_user_token_headers
):
    from tests.utils import create_random_user

    other_user = create_random_user(db)
    other_session = _session_for_user(db, other_user)

    response = client.get(
        f"/api/v1/sync/{other_session.id}",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 404


def test_evidence_run_idempotency_conflict_and_reference_protection(
    client, db, normal_user, normal_user_token_headers
):
    session = _session_for_user(db, normal_user)
    evidence_response = client.post(
        f"/api/v1/sync/{session.id}/evidence",
        headers=normal_user_token_headers,
        data={
            "kind": "offset_source",
            "payload_json": '{"source": "notebook"}',
            "metadata_json": "{}",
        },
    )
    assert evidence_response.status_code == 201
    evidence_id = evidence_response.json()["id"]
    payload = {
        "method": "informed_offset",
        "evidence_ids": [evidence_id],
        "parameters": {
            "offset": 250,
            "unit": "ms",
            "uncertainty_ms": 15,
            "source": "notebook",
            "justification": "Measured during acquisition",
        },
        "anchors": [],
    }
    with patch(
        "app.workers.tasks_sync.process_sync_run_task.apply_async"
    ) as enqueue:
        first = client.post(
            f"/api/v1/sync/{session.id}/runs",
            headers=normal_user_token_headers,
            json=payload,
        )
        assert first.status_code == 202
        enqueue.assert_called_once()

        conflict = client.post(
            f"/api/v1/sync/{session.id}/runs",
            headers=normal_user_token_headers,
            json={**payload, "parameters": {**payload["parameters"], "offset": 300}},
        )
        assert conflict.status_code == 409

        job = db.query(ProcessingJob).filter_by(id=first.json()["job_id"]).one()
        job.status = JobStatus.succeeded
        run = db.query(SyncRun).filter_by(id=first.json()["run_id"]).one()
        run.status = "succeeded"
        db.commit()

        repeated = client.post(
            f"/api/v1/sync/{session.id}/runs",
            headers=normal_user_token_headers,
            json=payload,
        )
        assert repeated.status_code == 202
        assert repeated.json()["reused"] is True
        assert repeated.json()["run_id"] == first.json()["run_id"]

    protected = client.delete(
        f"/api/v1/sync/{session.id}/evidence/{evidence_id}",
        headers=normal_user_token_headers,
    )
    assert protected.status_code == 409


def test_approval_is_transactional_and_uses_canonical_transform(
    client, db, normal_user, normal_user_token_headers
):
    session = _session_for_user(db, normal_user, with_eeg=True)
    job = ProcessingJob(
        session_id=session.id,
        job_type="sync",
        status=JobStatus.succeeded,
        progress=100,
    )
    db.add(job)
    db.flush()
    run = SyncRun(
        session_id=session.id,
        job_id=job.id,
        method="manual",
        status="succeeded",
        outcome="proposal",
        algorithm_version="sync-v1",
        input_manifest={},
        input_hash=f"manual-{session.id}",
        parameters={},
        result={
            "mapping_version": "affine-v1",
            "offset_ms": 2000,
            "drift_ms_per_min": 6,
            "uncertainty_ms": 10,
            "anchors": [],
        },
        metrics={"residual_rmse_ms": 5},
        quality_grade="high",
        uncertainty_ms=10,
        created_by=normal_user.id,
    )
    db.add(run)
    db.commit()

    response = client.post(
        f"/api/v1/sync/{session.id}/runs/{run.id}/decision",
        headers=normal_user_token_headers,
        json={"approve": True, "justification": "Synthetic anchors verified"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["approved_run_id"] == str(run.id)
    assert body["state"] == "synced"
    assert body["offset_ms"] == 2000
    eeg = db.query(EEGAsset).filter_by(session_id=session.id).one()
    assert eeg.sync_offset_ms == 2000
    mapping = {"offset_ms": 2000, "drift_ms_per_min": 6}
    eeg_ms = video_to_eeg_ms(10_000, mapping)
    assert eeg_ms == 8001
    assert eeg_to_video_ms(eeg_ms, mapping) == 10_000


def test_insufficient_run_cannot_be_approved(
    client, db, normal_user, normal_user_token_headers
):
    session = _session_for_user(db, normal_user)
    run = SyncRun(
        session_id=session.id,
        method="manual",
        status="succeeded",
        outcome="insufficient_evidence",
        algorithm_version="sync-v1",
        input_manifest={},
        input_hash=f"insufficient-{session.id}",
        parameters={},
        result={"reason": "No anchors", "offset_ms": None},
        metrics={},
        quality_grade="insufficient",
        created_by=normal_user.id,
    )
    db.add(run)
    db.commit()

    response = client.post(
        f"/api/v1/sync/{session.id}/runs/{run.id}/decision",
        headers=normal_user_token_headers,
        json={"approve": True, "justification": "Should be blocked"},
    )

    assert response.status_code == 409
