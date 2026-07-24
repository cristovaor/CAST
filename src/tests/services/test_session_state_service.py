from app.db.models import (
    Session as SessionModel, VideoAsset, EEGAsset, Synchronization, Participant,
    Study, Project, Organization, SessionState, QualityVerdict, SyncState,
)
from app.services.session_state_service import derive_session_state, refresh_session_state


def _make_session(db) -> SessionModel:
    org = Organization(name="org")
    db.add(org); db.commit(); db.refresh(org)
    project = Project(name="proj", organization_id=org.id)
    db.add(project); db.commit(); db.refresh(project)
    study = Study(name="study", project_id=project.id, status="active")
    db.add(study); db.commit(); db.refresh(study)
    participant = Participant(study_id=study.id, external_code="P-001")
    db.add(participant); db.commit(); db.refresh(participant)
    session = SessionModel(participant_id=participant.id, state=SessionState.draft)
    db.add(session); db.commit(); db.refresh(session)
    return session


def test_new_session_with_no_modality_is_awaiting_data(db):
    session = _make_session(db)
    assert derive_session_state(db, session) == SessionState.awaiting_data


def test_session_with_unassessed_video_is_incomplete(db):
    session = _make_session(db)
    video = VideoAsset(session_id=session.id, filename="v.mp4")
    db.add(video); db.commit()
    assert derive_session_state(db, session) == SessionState.incomplete


def test_session_with_assessed_video_is_ready_to_sync(db):
    session = _make_session(db)
    video = VideoAsset(session_id=session.id, filename="v.mp4", quality_verdict=QualityVerdict.approved)
    db.add(video); db.commit()
    assert derive_session_state(db, session) == SessionState.ready_to_sync


def test_session_with_review_required_video_takes_priority(db):
    session = _make_session(db)
    video = VideoAsset(session_id=session.id, filename="v.mp4", quality_verdict=QualityVerdict.review_required)
    db.add(video); db.commit()
    assert derive_session_state(db, session) == SessionState.review_required


def test_session_with_approved_sync_is_synced(db):
    session = _make_session(db)
    video = VideoAsset(session_id=session.id, filename="v.mp4", quality_verdict=QualityVerdict.approved)
    db.add(video); db.commit()
    sync = Synchronization(session_id=session.id, state=SyncState.synced)
    db.add(sync); db.commit()
    assert derive_session_state(db, session) == SessionState.synced


def test_session_with_failed_sync_requires_review(db):
    session = _make_session(db)
    video = VideoAsset(session_id=session.id, filename="v.mp4", quality_verdict=QualityVerdict.approved)
    db.add(video); db.commit()
    sync = Synchronization(session_id=session.id, state=SyncState.sync_failed)
    db.add(sync); db.commit()
    assert derive_session_state(db, session) == SessionState.review_required


def test_sticky_states_are_never_overwritten(db):
    session = _make_session(db)
    session.state = SessionState.excluded
    db.commit()
    # Even with a fresh, unassessed video, an excluded session stays excluded.
    video = VideoAsset(session_id=session.id, filename="v.mp4")
    db.add(video); db.commit()
    assert derive_session_state(db, session) == SessionState.excluded


def test_refresh_session_state_persists_and_returns_new_state(db):
    session = _make_session(db)
    video = VideoAsset(session_id=session.id, filename="v.mp4", quality_verdict=QualityVerdict.approved)
    db.add(video); db.commit()

    new_state = refresh_session_state(db, session.id)
    assert new_state == SessionState.ready_to_sync

    db.refresh(session)
    assert session.state == SessionState.ready_to_sync


def test_refresh_session_state_returns_none_for_missing_session(db):
    import uuid
    assert refresh_session_state(db, uuid.uuid4()) is None
