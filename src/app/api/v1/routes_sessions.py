from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import String, cast, func
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel

from app.db.models import (
    Session as SessionModel, VideoAsset, EEGAsset, Participant, Synchronization,
    SessionState, Study, Project, User,
)
from app.api.deps import get_db, get_current_user
from app.api.ownership import get_participant, get_session as get_owned_session
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


@router.get("/resolve", response_model=SessionDetail)
def resolve_session_reference(
    ref: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve a short UUID prefix without leaking sessions across tenants.

    Human-facing screens use an eight-character session reference. The lookup
    remains unambiguous and organization-scoped; clients must use at least four
    hexadecimal characters and receive a conflict instead of an arbitrary
    match when two sessions share the prefix.
    """
    normalized = ref.strip().lower().replace("-", "")
    if not 4 <= len(normalized) <= 32 or any(c not in "0123456789abcdef" for c in normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Session reference must contain 4 to 32 hexadecimal characters",
        )

    matches = (
        db.query(SessionModel.id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(
            Project.organization_id == current_user.organization_id,
            func.replace(cast(SessionModel.id, String), "-", "").ilike(f"{normalized}%"),
        )
        .limit(2)
        .all()
    )
    if not matches:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if len(matches) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session reference is ambiguous; provide more characters",
        )

    session = get_owned_session(db, current_user, matches[0].id)
    return _session_detail(session, db)


@router.post("/", response_model=SessionDetail, status_code=201)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_participant(db, current_user, payload.participant_id)

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
def get_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = get_owned_session(db, current_user, session_id)
    return _session_detail(s, db)


@router.patch("/{session_id}", response_model=SessionDetail)
def update_session(
    session_id: UUID,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Explicit edits, including manual state overrides.

    Setting `state` here is how a researcher records a decision (approved,
    excluded, archived) — those states are "sticky" and won't be recomputed by
    `refresh_session_state`, which runs automatically after uploads, quality
    assessments and sync decisions elsewhere in the API.
    """
    s = get_owned_session(db, current_user, session_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return _session_detail(s, db)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_owned_session(db, current_user, session_id)
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
    current_user: User = Depends(get_current_user),
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
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .outerjoin(VideoAsset, SessionModel.id == VideoAsset.session_id)
        .outerjoin(EEGAsset, SessionModel.id == EEGAsset.session_id)
        .filter(Project.organization_id == current_user.organization_id)
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
