from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_session as get_owned_session
from app.core.config import settings
from app.db.models import User
from app.domains.lsl.models import LSLRecording
from app.domains.lsl.schemas import (
    LSLDiscoveryUpdate, LSLRecordingComplete, LSLRecordingCreate, LSLRecordingDetail,
    LSLRecordingStarted, LSLRecordingStartResponse,
)
from app.domains.lsl.service import complete_recording, create_recording, mark_started, replace_discovery

router = APIRouter(tags=["lsl-acquisition"])


def _enabled():
    if not settings.LSL_ACQUISITION_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LSL acquisition is disabled")


def _owned(db: Session, user: User, recording_id: UUID) -> LSLRecording:
    recording = db.query(LSLRecording).filter(LSLRecording.id == recording_id).first()
    if recording is None: raise HTTPException(status_code=404, detail="LSL recording not found")
    get_owned_session(db, user, recording.session_id); return recording


@router.post("/sessions/{session_id}/lsl-recordings", response_model=LSLRecordingStartResponse, status_code=201)
def start_lsl_recording(session_id: UUID, payload: LSLRecordingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    recording, upload_url = create_recording(db, session_id=session_id, user_id=current_user.id, payload=payload)
    detail = LSLRecordingDetail.model_validate(recording).model_dump()
    return {**detail, "upload_url": upload_url, "upload_content_type": "application/x-xdf"}


@router.get("/sessions/{session_id}/lsl-recordings", response_model=list[LSLRecordingDetail])
def list_lsl_recordings(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    return db.query(LSLRecording).filter(LSLRecording.session_id == session_id).order_by(LSLRecording.created_at.desc()).all()


@router.get("/lsl-recordings/{recording_id}", response_model=LSLRecordingDetail)
def get_lsl_recording(recording_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    return _owned(db, current_user, recording_id)


@router.put("/lsl-recordings/{recording_id}/discovery", response_model=LSLRecordingDetail)
def update_lsl_discovery(recording_id: UUID, payload: LSLDiscoveryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); return replace_discovery(db, _owned(db, current_user, recording_id), payload.streams)


@router.post("/lsl-recordings/{recording_id}/started", response_model=LSLRecordingDetail)
def confirm_lsl_started(recording_id: UUID, payload: LSLRecordingStarted, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); return mark_started(db, _owned(db, current_user, recording_id), payload.started_source_time_us)


@router.post("/lsl-recordings/{recording_id}/complete", response_model=LSLRecordingDetail)
def finish_lsl_recording(recording_id: UUID, payload: LSLRecordingComplete, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); recording, created = complete_recording(db, _owned(db, current_user, recording_id), payload)
    if created:
        from app.workers.tasks_lsl import materialize_lsl_recording_task
        materialize_lsl_recording_task.delay(str(recording.id))
    return recording
