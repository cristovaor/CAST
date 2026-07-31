import hashlib
from datetime import datetime
from unittest.mock import patch

from app.core.config import settings
from app.db.models import (
    EEGAnalysisRun,
    EEGAsset,
    EEGAssetFile,
    Participant,
    ProcessingJob,
    Session,
)
from tests.utils import create_random_project, create_random_study


def _asset(db, user):
    project = create_random_project(db, user.organization_id)
    study = create_random_study(db, project.id)
    participant = Participant(study_id=study.id, external_code="EEG-001")
    db.add(participant)
    db.flush()
    session = Session(participant_id=participant.id, condition="baseline")
    db.add(session)
    db.flush()
    asset = EEGAsset(
        session_id=session.id,
        filename="recording.csv",
        storage_uri="s3://cast-videos/eeg/fixture/source/recording.csv",
        size_bytes=10,
    )
    db.add(asset)
    db.flush()
    db.add(
        EEGAssetFile(
            eeg_asset_id=asset.id,
            role="primary",
            filename="recording.csv",
            mime_type="text/csv",
            storage_uri=asset.storage_uri,
            size_bytes=10,
            checksum_sha256=hashlib.sha256(b"fixture-01").hexdigest(),
            is_primary=True,
            verified_at=datetime.utcnow(),
        )
    )
    db.commit()
    return asset


def test_individual_run_is_deduplicated(client, db, normal_user, normal_user_token_headers):
    asset = _asset(db, normal_user)
    previous = settings.EEG_ANALYSIS_V2_ENABLED
    settings.EEG_ANALYSIS_V2_ENABLED = True
    try:
        with patch(
            "app.workers.tasks_eeg_analysis.process_eeg_analysis_task.apply_async"
        ) as dispatch:
            first = client.post(
                f"/api/v1/eeg/{asset.id}/analysis-runs",
                headers=normal_user_token_headers,
                json={"profile": "custom", "parameters": {"apply_ica": False}},
            )
            second = client.post(
                f"/api/v1/eeg/{asset.id}/analysis-runs",
                headers=normal_user_token_headers,
                json={"profile": "custom", "parameters": {"apply_ica": False}},
            )
    finally:
        settings.EEG_ANALYSIS_V2_ENABLED = previous

    assert first.status_code == 202, first.text
    assert second.status_code == 202, second.text
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["reused"] is True
    assert dispatch.call_count == 1
    assert db.query(EEGAnalysisRun).count() == 1
    assert db.query(ProcessingJob).count() == 1


def test_run_is_not_visible_to_another_tenant(
    client, db, normal_user, normal_user_token_headers
):
    asset = _asset(db, normal_user)
    run = EEGAnalysisRun(
        eeg_asset_id=asset.id,
        scope_type="session",
        pipeline="individual",
        profile="custom",
        parameters={},
        input_manifest=[],
        input_hash="hash",
        status="succeeded",
        created_by=normal_user.id,
    )
    db.add(run)
    db.commit()
    from tests.utils import create_random_user
    from app.core.security import create_access_token

    outsider = create_random_user(db)
    outsider_headers = {
        "Authorization": f"Bearer {create_access_token(outsider.id)}"
    }
    previous = settings.EEG_ANALYSIS_V2_ENABLED
    settings.EEG_ANALYSIS_V2_ENABLED = True
    try:
        response = client.get(
            f"/api/v1/eeg/analysis-runs/{run.id}",
            headers=outsider_headers,
        )
    finally:
        settings.EEG_ANALYSIS_V2_ENABLED = previous
    assert response.status_code == 404
