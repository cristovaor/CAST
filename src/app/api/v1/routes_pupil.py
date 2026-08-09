from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_session as get_owned_session
from app.core.config import settings
from app.db.models import User
from app.domains.pupil.models import PupilArtifact, PupilRun
from app.domains.pupil.schemas import PupilArtifactDetail, PupilRunCreate, PupilRunDetail
from app.domains.pupil.service import create_pupil_run, read_series

router = APIRouter(tags=["pupillometry-experiment"])


def _enabled():
    if not settings.PUPIL_EXPERIMENT_ENABLED: raise HTTPException(status_code=404, detail="Pupillometry experiment is disabled")


def _owned_run(db: Session, current_user: User, run_id: UUID) -> PupilRun:
    run = db.query(PupilRun).filter(PupilRun.id == run_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Pupil run not found")
    get_owned_session(db, current_user, run.session_id)
    return run


@router.post("/sessions/{session_id}/pupil-artifacts", response_model=PupilRunDetail, status_code=202)
def create_run(session_id: UUID, payload: PupilRunCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    try: run = create_pupil_run(db, session_id=session_id, user_id=current_user.id, payload=payload)
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc
    from app.workers.tasks_pupil import process_pupil_run_task
    process_pupil_run_task.delay(str(run.id)); return run


@router.get("/pupil-runs/{run_id}", response_model=PupilRunDetail)
def get_run(run_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    return _owned_run(db, current_user, run_id)


@router.get("/sessions/{session_id}/pupil-runs", response_model=list[PupilRunDetail])
def list_runs(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    return db.query(PupilRun).filter(PupilRun.session_id == session_id).order_by(PupilRun.created_at.desc()).all()


@router.get("/sessions/{session_id}/pupil-artifacts", response_model=list[PupilArtifactDetail])
def list_artifacts(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    return db.query(PupilArtifact).join(PupilRun).filter(PupilRun.session_id == session_id).order_by(PupilArtifact.created_at.desc()).all()


@router.get("/sessions/{session_id}/pupil-series/{artifact_id}")
def get_series(session_id: UUID, artifact_id: UUID, start_time_us: int, end_time_us: int, limit: int = Query(default=1000, ge=1, le=10_000), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled(); get_owned_session(db, current_user, session_id)
    artifact = db.query(PupilArtifact).join(PupilRun).filter(PupilArtifact.id == artifact_id, PupilRun.session_id == session_id).first()
    if artifact is None: raise HTTPException(status_code=404, detail="Pupil artifact not found")
    if end_time_us <= start_time_us: raise HTTPException(status_code=422, detail="Invalid time range")
    return {"artifact": PupilArtifactDetail.model_validate(artifact), "samples": read_series(artifact, start_time_us=start_time_us, end_time_us=end_time_us, limit=limit)}
