"""Session lifecycle state machine (docs §8).

A session gathers every modality from one experimental period. Its state is
DERIVED from what's actually present (video/EEG assets, quality verdicts,
synchronization) rather than set by hand, so the UI always reflects reality:

    draft            → just created, nothing attached yet
    awaiting_data     → created, no modality attached
    incomplete        → some modality attached but still missing something
                        expected (only meaningful once we know what's expected;
                        here: video or EEG present but the other explicitly
                        skipped is NOT incomplete — see note below)
    ready_to_sync     → at least one modality with a quality verdict, no sync yet
    syncing           → synchronization row exists and is in_review
    synced            → synchronization approved
    processing        → a processing job is running for the session's video
    processed         → processing finished successfully
    review_required   → a quality verdict requires review, or sync failed
    approved / excluded / archived → manual researcher decisions, never auto-set

The function never downgrades a manually-set terminal state (approved,
excluded, archived) — those are researcher decisions and stay sticky.
"""
from __future__ import annotations

from sqlalchemy.orm import Session as OrmSession

from app.db.models import (
    Session as SessionModel, VideoAsset, EEGAsset, Synchronization,
    ProcessingJob, JobStatus, SessionState, QualityVerdict, SyncState,
)

# Terminal / manual states a researcher set explicitly — never auto-overwritten.
_STICKY_STATES = {SessionState.approved, SessionState.excluded, SessionState.archived}


def derive_session_state(db: OrmSession, session: SessionModel) -> SessionState:
    """Computes what the session's state should be given its current data."""
    if session.state in _STICKY_STATES:
        return session.state

    video = db.query(VideoAsset).filter(VideoAsset.session_id == session.id).first()
    eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session.id).first()
    sync = db.query(Synchronization).filter(Synchronization.session_id == session.id).first()

    has_video = video is not None
    has_eeg = eeg is not None

    # No modality attached yet.
    if not has_video and not has_eeg:
        return SessionState.awaiting_data

    # A processing job is actively running for the video.
    if video is not None:
        running_job = (
            db.query(ProcessingJob)
            .filter(ProcessingJob.video_asset_id == video.id, ProcessingJob.status == JobStatus.running)
            .first()
        )
        if running_job:
            return SessionState.processing

    # Quality requiring review takes priority once assessed.
    video_needs_review = bool(video and video.quality_verdict == QualityVerdict.review_required)
    video_rejected = bool(video and video.quality_verdict == QualityVerdict.rejected)
    eeg_needs_review = bool(eeg and eeg.quality_verdict in (QualityVerdict.review_required, QualityVerdict.rejected))
    if video_needs_review or video_rejected or eeg_needs_review:
        return SessionState.review_required

    if sync is not None:
        if sync.state == SyncState.sync_failed:
            return SessionState.review_required
        if sync.state in (SyncState.synced, SyncState.synced_with_caveats):
            return SessionState.synced
        if sync.state == SyncState.in_review:
            return SessionState.syncing

    # At least one modality present with an assessed quality verdict → ready
    # to move into synchronization, even if sync hasn't started.
    video_assessed = bool(video and video.quality_verdict)
    eeg_assessed = bool(eeg and eeg.quality_verdict)
    if video_assessed or eeg_assessed:
        return SessionState.ready_to_sync

    # Modality present but not yet quality-assessed.
    return SessionState.incomplete


def refresh_session_state(db: OrmSession, session_id) -> SessionState | None:
    """Recomputes and persists a session's state. Call after any change to its
    video/EEG/sync/quality. Commits. Returns the new state, or None if the
    session doesn't exist."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        return None
    new_state = derive_session_state(db, session)
    if session.state != new_state:
        session.state = new_state
        db.commit()
    return new_state
