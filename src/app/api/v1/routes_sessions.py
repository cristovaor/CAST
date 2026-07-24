from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel

from app.db.models import (
    Session as SessionModel, VideoAsset, EEGAsset, Participant, Synchronization,
    SessionState,
)
from app.api.deps import get_db
from app.schemas.multimodal import SessionCreate, SessionUpdate, SessionDetail

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _session_detail(s: SessionModel, db: Session) -> SessionDetail:
    video = db.query(VideoAsset).filter(VideoAsset.session_id == s.id).first()
    eeg = db.query(EEGAsset).filter(EEGAsset.session_id == s.id).first()
    sync = db.query(Synchronization).filter(Synchronization.session_id == s.id).first()
    return SessionDetail(
        id=s.id,
        participant_id=s.participant_id,
        state=s.state or SessionState.draft,
        condition=s.condition,
        protocol=s.protocol,
        operator=s.operator,
        recorded_at=s.recorded_at,
        duration_seconds=float(s.duration_seconds) if s.duration_seconds is not None else None,
        notes=s.notes,
        created_at=s.created_at,
        video_asset_id=video.id if video else None,
        eeg_asset_id=eeg.id if eeg else None,
        sync_state=sync.state if sync else None,
    )


@router.post("/", response_model=SessionDetail, status_code=201)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    participant = db.query(Participant).filter(Participant.id == payload.participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    s = SessionModel(
        participant_id=payload.participant_id,
        condition=payload.condition,
        protocol=payload.protocol,
        operator=payload.operator,
        recorded_at=payload.recorded_at,
        duration_seconds=payload.duration_seconds,
        notes=payload.notes,
        state=SessionState.awaiting_data,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _session_detail(s, db)


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(session_id: UUID, db: Session = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_detail(s, db)


@router.patch("/{session_id}", response_model=SessionDetail)
def update_session(session_id: UUID, payload: SessionUpdate, db: Session = Depends(get_db)):
    """Explicit edits, including manual state overrides.

    Setting `state` here is how a researcher records a decision (approved,
    excluded, archived) — those states are "sticky" and won't be recomputed by
    `refresh_session_state`, which runs automatically after uploads, quality
    assessments and sync decisions elsewhere in the API.
    """
    s = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return _session_detail(s, db)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: UUID, db: Session = Depends(get_db)):
    db_obj = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(db_obj)
    db.commit()
    return None


class SessionListResponse(BaseModel):
    id: UUID
    participant_id: UUID
    created_at: str
    state: Optional[str] = None
    condition: Optional[str] = None
    video_asset_id: Optional[UUID] = None
    eeg_asset_id: Optional[UUID] = None
    study_id: UUID


@router.get("/", response_model=List[SessionListResponse])
def list_global_sessions(
    study_id: Optional[UUID] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
):
    """Lists sessions, optionally filtered by study (for the study's Sessions tab)."""
    query = (
        db.query(
            SessionModel.id,
            SessionModel.participant_id,
            SessionModel.created_at,
            SessionModel.state,
            SessionModel.condition,
            Participant.study_id,
            VideoAsset.id.label("video_asset_id"),
            EEGAsset.id.label("eeg_asset_id"),
        )
        .join(Participant, SessionModel.participant_id == Participant.id)
        .outerjoin(VideoAsset, SessionModel.id == VideoAsset.session_id)
        .outerjoin(EEGAsset, SessionModel.id == EEGAsset.session_id)
    )
    if study_id:
        query = query.filter(Participant.study_id == study_id)
    sessions = (
        query.order_by(SessionModel.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        SessionListResponse(
            id=s.id,
            participant_id=s.participant_id,
            created_at=s.created_at.isoformat(),
            state=s.state.value if s.state else None,
            condition=s.condition,
            video_asset_id=s.video_asset_id,
            eeg_asset_id=s.eeg_asset_id,
            study_id=s.study_id,
        ) for s in sessions
    ]
