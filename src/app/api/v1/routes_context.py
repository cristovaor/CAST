from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_session as get_owned_session
from app.core.config import settings
from app.db.models import User
from app.domains.context.models import EnvironmentArtifact, ExperimentalEvent, ExperimentalTrial
from app.domains.context.schemas import (
    EnvironmentArtifactDetail, EnvironmentSeriesCreate,
    ExperimentalEventBatch, ExperimentalEventBatchResult, ExperimentalEventDetail,
    TrialCreate, TrialDetail,
)
from app.domains.context.service import create_environment_series, create_trial, read_environment_series, record_event_batch

router = APIRouter(tags=["experimental-context"])


def _enabled() -> None:
    if not settings.EXPERIMENTAL_CONTEXT_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experimental context is disabled")


@router.post("/sessions/{session_id}/trials", response_model=TrialDetail, status_code=201)
def add_trial(session_id: UUID, payload: TrialCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    get_owned_session(db, current_user, session_id)
    return create_trial(db, session_id=session_id, payload=payload)


@router.get("/sessions/{session_id}/trials", response_model=list[TrialDetail])
def list_trials(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    get_owned_session(db, current_user, session_id)
    return db.query(ExperimentalTrial).filter(ExperimentalTrial.session_id == session_id).order_by(ExperimentalTrial.started_source_time_us).all()


@router.post("/sessions/{session_id}/experimental-events/batch", response_model=ExperimentalEventBatchResult)
def add_event_batch(session_id: UUID, payload: ExperimentalEventBatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    get_owned_session(db, current_user, session_id)
    events, created, reused = record_event_batch(db, session_id=session_id, payload=payload)
    return ExperimentalEventBatchResult(created=created, reused=reused, events=events)


@router.get("/sessions/{session_id}/experimental-events", response_model=list[ExperimentalEventDetail])
def list_events(
    session_id: UUID,
    start_time_us: int | None = None,
    end_time_us: int | None = None,
    limit: int = Query(default=1000, ge=1, le=10_000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    get_owned_session(db, current_user, session_id)
    query = db.query(ExperimentalEvent).filter(ExperimentalEvent.session_id == session_id)
    if start_time_us is not None:
        query = query.filter(ExperimentalEvent.canonical_time_us >= start_time_us)
    if end_time_us is not None:
        query = query.filter(ExperimentalEvent.canonical_time_us <= end_time_us)
    return query.order_by(ExperimentalEvent.canonical_time_us, ExperimentalEvent.source_time_us).limit(limit).all()


@router.post("/sessions/{session_id}/environment-series", response_model=EnvironmentArtifactDetail, status_code=202)
def add_environment_series(session_id: UUID, payload: EnvironmentSeriesCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    get_owned_session(db, current_user, session_id)
    clocks = {sample.source_clock_id for sample in payload.samples}
    if len(clocks) != 1:
        raise HTTPException(status_code=422, detail="Environment series must use one source_clock_id")
    artifact = create_environment_series(db, session_id=session_id, payload=payload)
    from app.workers.tasks_context import materialize_environment_task
    materialize_environment_task.delay(str(artifact.id))
    return artifact


@router.get("/sessions/{session_id}/environment-series", response_model=list[EnvironmentArtifactDetail])
def list_environment_series(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _enabled()
    get_owned_session(db, current_user, session_id)
    return db.query(EnvironmentArtifact).filter(EnvironmentArtifact.session_id == session_id).order_by(EnvironmentArtifact.created_at.desc()).all()


@router.get("/sessions/{session_id}/environment-series/{artifact_id}")
def get_environment_samples(
    session_id: UUID, artifact_id: UUID, start_time_us: int, end_time_us: int,
    limit: int = Query(default=1000, ge=1, le=10_000),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _enabled(); get_owned_session(db, current_user, session_id)
    if end_time_us <= start_time_us:
        raise HTTPException(status_code=422, detail="Invalid time range")
    artifact = db.query(EnvironmentArtifact).filter(EnvironmentArtifact.id == artifact_id, EnvironmentArtifact.session_id == session_id).first()
    if artifact is None:
        raise HTTPException(status_code=404, detail="Environment artifact not found")
    return {"artifact": EnvironmentArtifactDetail.model_validate(artifact), "samples": read_environment_series(artifact, start_time_us=start_time_us, end_time_us=end_time_us, limit=limit)}
