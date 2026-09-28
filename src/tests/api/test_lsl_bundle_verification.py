import hashlib
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.core.config import settings
from app.db.models import EEGAssetFile, Participant, Session, SyncEvidence
from app.domains.lsl.materialization import materialize_lsl_recording
from app.domains.lsl.models import LSLRecording
from tests.utils import create_random_project, create_random_study


@pytest.fixture
def recording(db, normal_user, monkeypatch):
    project = create_random_project(db, normal_user.organization_id)
    study = create_random_study(db, project.id)
    participant = Participant(study_id=study.id, external_code="XDF-001")
    db.add(participant)
    db.flush()
    session = Session(participant_id=participant.id, condition="baseline")
    db.add(session)
    db.flush()
    xdf = b"test-xdf-source"
    row = LSLRecording(
        id=uuid4(), session_id=session.id, created_by=normal_user.id,
        agent_id="upload", status="processing",
        object_key=f"lsl/{session.id}/{uuid4()}/recording.xdf",
        checksum_sha256=hashlib.sha256(xdf).hexdigest(), size_bytes=len(xdf),
    )
    db.add(row)
    db.commit()
    stream = {
        "info": {
            "uid": ["eeg"], "type": ["EEG"], "name": ["Amplifier"],
            "channel_count": ["2"], "nominal_srate": ["100"],
        },
        "time_series": [[1.0, 2.0], [3.0, 4.0]],
        "time_stamps": [10.0, 10.01],
    }
    monkeypatch.setitem(sys.modules, "pyxdf", SimpleNamespace(load_xdf=lambda *a, **kw: ([stream], {})))
    monkeypatch.setattr(
        "app.domains.lsl.materialization.storage_service.download_to_file",
        lambda key, destination: Path(destination).write_bytes(xdf),
    )
    monkeypatch.setattr(
        "app.domains.lsl.materialization.storage_service.upload_file",
        lambda *a, **kw: None,
    )
    return row


@pytest.fixture
def imported_source(db, recording):
    materialize_lsl_recording(db, recording.id)
    return db.query(EEGAssetFile).filter_by(eeg_asset_id=recording.eeg_asset_id, role="source").one()


@pytest.fixture
def analysis_enabled(monkeypatch):
    monkeypatch.setattr(settings, "EEG_ANALYSIS_V2_ENABLED", True)


def _launch(client, headers, asset_id):
    return client.post(
        f"/api/v1/eeg/{asset_id}/analysis-runs", headers=headers,
        json={"pipeline": "individual", "parameters": {}, "reuse_completed": True, "profile": "custom"},
    )


def _repair(db):
    path = Path(__file__).resolve().parents[2] / "alembic/versions/025_lsl_source_verification.py"
    spec = importlib.util.spec_from_file_location("lsl_source_verification_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with Operations.context(MigrationContext.configure(db.connection())):
        migration.upgrade()
    db.commit()
    db.expire_all()


def test_imported_xdf_is_verified_and_analysis_can_launch(
    client, db, imported_source, normal_user_token_headers, analysis_enabled,
):
    assert imported_source.verified_at is not None
    with patch("app.workers.tasks_eeg_analysis.process_eeg_analysis_task.apply_async") as dispatch:
        response = _launch(client, normal_user_token_headers, imported_source.eeg_asset_id)
    assert response.status_code == 202, response.text
    assert dispatch.call_count == 1


@pytest.mark.parametrize("mismatch", ["checksum", "size"])
def test_source_integrity_mismatch_fails_import(db, recording, mismatch):
    if mismatch == "checksum":
        recording.checksum_sha256 = "0" * 64
    else:
        recording.size_bytes += 1
    db.commit()
    with pytest.raises(ValueError, match="XDF checksum or size mismatch"):
        materialize_lsl_recording(db, recording.id)
    assert recording.status == "failed"
    assert db.query(EEGAssetFile).count() == 0


def test_migration_repairs_old_import_and_preserves_analysis_guard(
    client, db, imported_source, normal_user_token_headers, analysis_enabled,
):
    imported_source.verified_at = None
    db.commit()
    with patch("app.workers.tasks_eeg_analysis.process_eeg_analysis_task.apply_async") as dispatch:
        pending = _launch(client, normal_user_token_headers, imported_source.eeg_asset_id)
        assert pending.status_code == 409
        assert pending.json()["detail"]["files"] == ["recording.xdf"]
        dispatch.assert_not_called()
        _repair(db)
        timestamp = imported_source.verified_at
        assert timestamp is not None
        _repair(db)
        assert imported_source.verified_at == timestamp
        response = _launch(client, normal_user_token_headers, imported_source.eeg_asset_id)
    assert response.status_code == 202, response.text
    assert dispatch.call_count == 1


@pytest.mark.parametrize("mismatch", [
    "status", "checksum", "size", "uri", "evidence_checksum", "evidence_kind", "missing_evidence", "role",
])
def test_migration_does_not_approve_unconfirmed_sources(db, recording, imported_source, mismatch):
    imported_source.verified_at = None
    evidence = db.get(SyncEvidence, recording.sync_evidence_id)
    if mismatch == "status":
        recording.status = "failed"
    elif mismatch == "checksum":
        imported_source.checksum_sha256 = "0" * 64
    elif mismatch == "size":
        imported_source.size_bytes += 1
    elif mismatch == "uri":
        imported_source.storage_uri = "s3://cast-videos/unrelated.xdf"
    elif mismatch == "evidence_checksum":
        evidence.checksum_sha256 = "0" * 64
    elif mismatch == "evidence_kind":
        evidence.kind = "manual"
    elif mismatch == "missing_evidence":
        recording.sync_evidence_id = None
    elif mismatch == "role":
        imported_source.role = "other"
    db.commit()
    _repair(db)
    assert imported_source.verified_at is None
