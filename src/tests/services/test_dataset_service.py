from app.db.models import (
    Session as SessionModel, VideoAsset, EEGAsset, Synchronization, Participant,
    Study, Project, Organization, SessionState, QualityVerdict, SyncState,
    ConsentStatus,
)
from app.services.dataset_service import select_sessions, build_manifest


def _make_study(db):
    org = Organization(name="org")
    db.add(org); db.commit(); db.refresh(org)
    project = Project(name="proj", organization_id=org.id)
    db.add(project); db.commit(); db.refresh(project)
    study = Study(name="Estudo X", project_id=project.id, status="active")
    db.add(study); db.commit(); db.refresh(study)
    return study


def _make_session(db, study, *, condition=None, consent=ConsentStatus.accepted,
                   with_video=False, with_eeg=False, eeg_valid_ratio=None,
                   sync_state=None):
    participant = Participant(study_id=study.id, external_code="P-001", consent_status=consent)
    db.add(participant); db.commit(); db.refresh(participant)
    session = SessionModel(participant_id=participant.id, condition=condition, state=SessionState.draft)
    db.add(session); db.commit(); db.refresh(session)

    if with_video:
        db.add(VideoAsset(session_id=session.id, filename="v.mp4", quality_verdict=QualityVerdict.approved))
    if with_eeg:
        db.add(EEGAsset(session_id=session.id, filename="e.csv", valid_ratio=eeg_valid_ratio,
                         quality_verdict=QualityVerdict.approved))
    if sync_state:
        db.add(Synchronization(session_id=session.id, state=sync_state))
    db.commit()
    return session


def test_select_sessions_includes_session_matching_no_criteria(db):
    study = _make_study(db)
    _make_session(db, study, with_video=True, with_eeg=True)

    included, excluded = select_sessions(db, {})
    assert len(included) == 1
    assert excluded == []


def test_select_sessions_excludes_missing_required_modality(db):
    study = _make_study(db)
    _make_session(db, study, with_video=True, with_eeg=False)

    included, excluded = select_sessions(db, {"modalities": ["video", "eeg"]})
    assert included == []
    assert len(excluded) == 1
    assert "EEG ausente" in excluded[0]["reason"]


def test_select_sessions_excludes_revoked_consent(db):
    study = _make_study(db)
    _make_session(db, study, with_video=True, consent=ConsentStatus.revoked)

    included, excluded = select_sessions(db, {"require_consent": True})
    assert included == []
    assert "consentimento" in excluded[0]["reason"]


def test_select_sessions_excludes_low_eeg_validity(db):
    study = _make_study(db)
    _make_session(db, study, with_eeg=True, eeg_valid_ratio=0.5)

    included, excluded = select_sessions(db, {"min_eeg_valid_ratio": 0.8})
    assert included == []
    assert "EEG válido" in excluded[0]["reason"]


def test_select_sessions_excludes_condition_mismatch(db):
    study = _make_study(db)
    _make_session(db, study, condition="baseline", with_video=True)

    included, excluded = select_sessions(db, {"conditions": ["carga_alta"]})
    assert included == []
    assert "condição" in excluded[0]["reason"]


def test_select_sessions_requires_approved_sync(db):
    study = _make_study(db)
    _make_session(db, study, with_video=True, sync_state=SyncState.not_synced)

    included, excluded = select_sessions(db, {"require_sync": True})
    assert included == []
    assert "sincronização" in excluded[0]["reason"]


def test_build_manifest_reflects_selection(db):
    study = _make_study(db)
    _make_session(db, study, condition="baseline", with_video=True, with_eeg=True)

    included, excluded = select_sessions(db, {})
    manifest = build_manifest(db, {}, included, excluded, dataset_version="v1", level="analytic", owner="tester")

    assert manifest["sessionCount"] == 1
    assert manifest["participantCount"] == 1
    assert "baseline" in manifest["conditions"]
    assert manifest["owner"] == "tester"
    assert manifest["level"] == "analytic"
