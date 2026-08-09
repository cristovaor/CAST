from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_session as get_owned_session
from app.core.config import settings
from app.db.models import User
from app.domains.gaze.models import GazeArtifact, GazeCalibration
from app.domains.gaze.schemas import GazeArtifactDetail, GazeBatchResult, GazeCalibrationCreate, GazeCalibrationDetail, GazeSampleBatch
from app.domains.gaze.service import add_samples, create_calibration, read_series

router = APIRouter(tags=["gaze-experiment"])


def _enabled():
    if not settings.GAZE_EXPERIMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Gaze experiment is disabled")


def _owned_calibration(db: Session, current_user: User, calibration_id: UUID) -> GazeCalibration:
    calibration = db.query(GazeCalibration).filter(GazeCalibration.id == calibration_id).first()
    if calibration is None:
        raise HTTPException(status_code=404, detail="Gaze calibration not found")
    get_owned_session(db, current_user, calibration.session_id)
    return calibration


@router.post("/sessions/{session_id}/gaze-calibrations", response_model=GazeCalibrationDetail, status_code=201)
def start_calibration(session_id: UUID, payload: GazeCalibrationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    return create_calibration(db, session_id=session_id, user_id=current_user.id, payload=payload)


@router.post("/gaze-calibrations/{calibration_id}/samples/batch", response_model=GazeBatchResult)
def record_samples(calibration_id: UUID, payload: GazeSampleBatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); calibration = _owned_calibration(db, current_user, calibration_id)
    if calibration.status != "collecting":
        raise HTTPException(status_code=409, detail="Calibration no longer accepts samples")
    created, reused = add_samples(db, calibration=calibration, payload=payload)
    return GazeBatchResult(created=created, reused=reused)


@router.post("/gaze-calibrations/{calibration_id}/complete", response_model=GazeCalibrationDetail, status_code=202)
def complete_calibration(calibration_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); calibration = _owned_calibration(db, current_user, calibration_id)
    if calibration.status == "collecting":
        calibration.status = "processing"; db.commit(); db.refresh(calibration)
        from app.workers.tasks_gaze import process_gaze_calibration_task
        process_gaze_calibration_task.delay(str(calibration.id))
    return calibration


@router.get("/gaze-calibrations/{calibration_id}", response_model=GazeCalibrationDetail)
def get_calibration(calibration_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    return _owned_calibration(db, current_user, calibration_id)


@router.get("/sessions/{session_id}/gaze-series", response_model=list[GazeArtifactDetail])
def list_gaze_series(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    return db.query(GazeArtifact).join(GazeCalibration).filter(GazeCalibration.session_id == session_id).order_by(GazeArtifact.created_at.desc()).all()


@router.get("/sessions/{session_id}/gaze-series/{artifact_id}")
def get_gaze_samples(session_id: UUID, artifact_id: UUID, start_time_us: int, end_time_us: int, limit: int = Query(default=1000, ge=1, le=10_000), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    artifact = db.query(GazeArtifact).join(GazeCalibration).filter(GazeArtifact.id == artifact_id, GazeCalibration.session_id == session_id).first()
    if artifact is None: raise HTTPException(status_code=404, detail="Gaze artifact not found")
    if end_time_us <= start_time_us: raise HTTPException(status_code=422, detail="Invalid time range")
    return {"artifact": GazeArtifactDetail.model_validate(artifact), "samples": read_series(artifact, start_time_us=start_time_us, end_time_us=end_time_us, limit=limit)}
