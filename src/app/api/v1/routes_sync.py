"""Video↔EEG synchronization (docs §11).

Central to the multimodal experience: align sources on one time axis with
method, offset, drift, anchors and confidence, then an explicit approve /
invalidate decision with justification. The EEG offset is kept in sync with the
EEGAsset so playback and analysis read a single source of truth.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.api.deps import get_db
from app.db.models import (
    Synchronization, Session as SessionModel, EEGAsset, SyncState,
    AuditLog, AuditAction,
)
from app.schemas.multimodal import SyncDetail, SyncUpdate, SyncDecision

router = APIRouter(prefix="/sync", tags=["sync"])


def _get_or_create(session_id: UUID, db: Session) -> Synchronization:
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    sync = db.query(Synchronization).filter(Synchronization.session_id == session_id).first()
    if not sync:
        sync = Synchronization(session_id=session_id, state=SyncState.not_synced)
        db.add(sync)
        db.commit()
        db.refresh(sync)
    return sync


@router.get("/{session_id}", response_model=SyncDetail)
def get_sync(session_id: UUID, db: Session = Depends(get_db)):
    return _get_or_create(session_id, db)


@router.post("/{session_id}/detect", response_model=SyncDetail)
def detect_sync_endpoint(session_id: UUID, sync: bool = False, db: Session = Depends(get_db)):
    """Proposes an offset via cross-correlation of facial events and EEG
    activity (docs §11, method `event_correlation`). Lands in
    `auto_available` — the researcher must still review and approve via
    POST /sync/{session_id}/decision. Dispatches the worker with a synchronous
    fallback (`?sync=true` or when the broker is unreachable).
    """
    _get_or_create(session_id, db)  # 404s if the session doesn't exist

    from app.workers.tasks_sync import detect_sync_task, detect_sync

    if not sync:
        try:
            detect_sync_task.delay(str(session_id))
            return db.query(Synchronization).filter(Synchronization.session_id == session_id).first()
        except Exception:
            pass  # broker down — detect inline

    result = detect_sync(str(session_id))
    if result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])

    db.expire_all()
    return db.query(Synchronization).filter(Synchronization.session_id == session_id).first()


@router.patch("/{session_id}", response_model=SyncDetail)
def update_sync(session_id: UUID, payload: SyncUpdate, db: Session = Depends(get_db)):
    sync = _get_or_create(session_id, db)
    data = payload.model_dump(exclude_unset=True)

    if "anchors" in data and data["anchors"] is not None:
        data["anchors"] = [a for a in data["anchors"]]
    for field, value in data.items():
        setattr(sync, field, value)

    # Adjusting alignment moves it into review, not approved.
    if sync.state in (SyncState.not_synced, SyncState.auto_available):
        sync.state = SyncState.in_review

    # Keep the EEG asset offset consistent (single source of truth).
    if "offset_ms" in data:
        eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session_id).first()
        if eeg:
            eeg.sync_offset_ms = data["offset_ms"]

    history = list(sync.history or [])
    history.append({
        "at": datetime.utcnow().isoformat(),
        "action": "Ajuste de sincronização",
        "detail": data,
    })
    sync.history = history
    db.commit()

    from app.services.session_state_service import refresh_session_state
    refresh_session_state(db, session_id)

    db.refresh(sync)
    return sync


@router.post("/{session_id}/decision", response_model=SyncDetail)
def decide_sync(session_id: UUID, payload: SyncDecision, db: Session = Depends(get_db)):
    """Approve or invalidate the synchronization (justification required)."""
    if not payload.justification.strip():
        raise HTTPException(status_code=422, detail="Justification is required")
    sync = _get_or_create(session_id, db)

    if payload.approve:
        # With-caveats when drift is meaningful or confidence is low.
        caveats = (sync.drift_ms_per_min or 0) > 2 or (sync.confidence or 1) < 0.9
        sync.state = SyncState.synced_with_caveats if caveats else SyncState.synced
    else:
        sync.state = SyncState.sync_failed

    sync.justification = payload.justification
    sync.approved_at = datetime.utcnow()
    history = list(sync.history or [])
    history.append({
        "at": datetime.utcnow().isoformat(),
        "action": "Aprovada" if payload.approve else "Invalidada",
        "note": payload.justification,
    })
    sync.history = history

    db.add(AuditLog(
        action=AuditAction.sync_decision,
        entity_type="session",
        entity_id=str(session_id),
        justification=payload.justification,
        detail={"approved": payload.approve, "state": sync.state.value},
    ))
    db.commit()

    from app.services.session_state_service import refresh_session_state
    refresh_session_state(db, session_id)

    db.refresh(sync)
    return sync
