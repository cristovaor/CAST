"""API routes for Model Registry (v2)."""
from __future__ import annotations

from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_current_user, get_db, require_admin
from app.api.v1.routes_jobs import _map_status_to_step, job_status_generator
from app.db.models import JobStatus, JobType, ProcessingJob, User, ModelVersion
from app.services.model_service import promote_model_version, ModelNotFoundError

router = APIRouter()

class ModelVersionResponse(BaseModel):
    id: str
    model_id: str
    version: str
    action: str
    status: str
    artifact_uri: Optional[str] = None
    manifest_uri: Optional[str] = None
    manifest: dict
    metrics: dict
    notes: Optional[str] = None
    created_at: str
    activated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class PromoteRequest(BaseModel):
    target_status: str
    notes: Optional[str] = None

@router.get("/models", response_model=List[ModelVersionResponse])
def list_models(
    model_id: Optional[str] = None,
    action: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ModelVersion)
    if model_id:
        query = query.filter(ModelVersion.model_id == model_id)
    if action:
        query = query.filter(ModelVersion.action == action)
    if status:
        query = query.filter(ModelVersion.status == status)
    
    mvs = query.order_by(ModelVersion.created_at.desc()).all()
    
    return [
        ModelVersionResponse(
            id=str(mv.id),
            model_id=mv.model_id,
            version=mv.version,
            action=mv.action,
            status=mv.status,
            artifact_uri=mv.artifact_uri,
            manifest_uri=mv.manifest_uri,
            manifest=mv.manifest or {},
            metrics=mv.metrics or {},
            notes=mv.notes,
            created_at=mv.created_at.isoformat() if mv.created_at else "",
            activated_at=mv.activated_at.isoformat() if mv.activated_at else None,
        ) for mv in mvs
    ]

@router.get("/models/{model_id}/versions/{version}/actions/{action}", response_model=ModelVersionResponse)
def get_model_version(
    model_id: str,
    version: str,
    action: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mv = db.query(ModelVersion).filter(
        ModelVersion.model_id == model_id,
        ModelVersion.version == version,
        ModelVersion.action == action,
    ).first()

    if not mv:
        raise HTTPException(status_code=404, detail="Model version not found")

    return ModelVersionResponse(
        id=str(mv.id),
        model_id=mv.model_id,
        version=mv.version,
        action=mv.action,
        status=mv.status,
        artifact_uri=mv.artifact_uri,
        manifest_uri=mv.manifest_uri,
        manifest=mv.manifest or {},
        metrics=mv.metrics or {},
        notes=mv.notes,
        created_at=mv.created_at.isoformat() if mv.created_at else "",
        activated_at=mv.activated_at.isoformat() if mv.activated_at else None,
    )

class RegisterModelRequest(BaseModel):
    model_id: str
    version: str
    action: str
    manifest: dict
    artifact_uri: Optional[str] = None
    notes: Optional[str] = None

@router.post("/models", response_model=ModelVersionResponse, status_code=status.HTTP_201_CREATED)
def register_model(
    req: RegisterModelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from cast.models.manifest import ModelManifest
    try:
        manifest_obj = ModelManifest(**req.manifest)
        from app.services.model_service import register_model_version
        mv = register_model_version(
            db=db,
            model_id=req.model_id,
            version=req.version,
            action=req.action,
            manifest=manifest_obj,
            artifact_uri=req.artifact_uri,
            notes=req.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Model registration failed")

    return ModelVersionResponse(
        id=str(mv.id),
        model_id=mv.model_id,
        version=mv.version,
        action=mv.action,
        status=mv.status,
        artifact_uri=mv.artifact_uri,
        manifest_uri=mv.manifest_uri,
        manifest=mv.manifest or {},
        metrics=mv.metrics or {},
        notes=mv.notes,
        created_at=mv.created_at.isoformat() if mv.created_at else "",
        activated_at=mv.activated_at.isoformat() if mv.activated_at else None,
    )

class TrainModelRequest(BaseModel):
    model_id: str
    version: str
    action: Optional[str] = None
    actions: Optional[List[str]] = None
    video_asset_ids: Optional[List[str]] = None
    training_config: Optional[dict[str, Any]] = None

@router.post("/models/train", status_code=status.HTTP_202_ACCEPTED)
def train_model(
    req: TrainModelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Start async training job(s) for one or more micro-action models.

    Trains on real annotated videos (landmarks + annotation events) and, on
    success, registers each resulting artifact as a new draft ModelVersion.
    One job is enqueued per requested action. Poll
    /api/v1/models/train-jobs/{job_id} (or /stream) for progress on each.
    """
    from cast.config.actions import ALL_ACTIONS

    requested_actions = req.actions if req.actions else ([req.action] if req.action else None)
    if not requested_actions:
        raise HTTPException(status_code=400, detail="Either 'action' or 'actions' must be provided")

    unknown = [a for a in requested_actions if a not in ALL_ACTIONS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown action(s): {', '.join(unknown)}")

    from app.workers.tasks_train import train_model_task

    jobs: list[dict[str, str]] = []
    skipped: list[str] = []

    for action in requested_actions:
        existing = db.query(ModelVersion).filter(
            ModelVersion.model_id == req.model_id,
            ModelVersion.version == req.version,
            ModelVersion.action == action,
        ).first()
        if existing:
            skipped.append(action)
            continue

        job = ProcessingJob(
            video_asset_id=None,
            job_type=JobType.train_model,
            status=JobStatus.queued,
            progress=0.0,
            logs=[{"level": "info", "message": "Job de treino criado, aguardando worker"}],
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        train_model_task.delay(
            str(job.id), req.model_id, req.version, action,
            req.video_asset_ids, req.training_config,
        )
        jobs.append({"action": action, "job_id": str(job.id), "status": "queued"})

    if not jobs:
        raise HTTPException(
            status_code=400,
            detail=f"Version {req.version} already exists for model {req.model_id} for all requested actions",
        )

    return {
        "jobs": jobs,
        "skipped": skipped,
        "message": "Training job(s) enqueued. Poll /api/v1/models/train-jobs/{job_id} for status.",
    }


def _get_train_job(db: Session, job_id: UUID) -> ProcessingJob:
    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.id == job_id, ProcessingJob.job_type == JobType.train_model)
        .first()
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job


@router.get("/models/train-jobs/{job_id}")
def get_train_job_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    job = _get_train_job(db, job_id)
    return {
        "id": job.id,
        "status": job.status.value,
        "step": _map_status_to_step(job.status, job.progress),
        "progress": float(job.progress) if job.progress else 0,
        "error": job.error_message,
        "result": job.result,
    }


@router.get("/models/train-jobs/{job_id}/stream")
def stream_train_job_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _get_train_job(db, job_id)
    return StreamingResponse(
        job_status_generator(job_id, db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/models/train-jobs/{job_id}/cancel", status_code=202)
def cancel_train_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    job = _get_train_job(db, job_id)
    from app.workers.celery_app import celery_app
    celery_app.control.revoke(str(job.id), terminate=True, signal="SIGKILL")
    job.status = JobStatus.canceled
    db.commit()
    return {"message": "Training job cancelled"}


@router.post("/models/{version_id}/promote", response_model=ModelVersionResponse)
def promote_model(
    version_id: UUID,
    req: PromoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    try:
        mv = promote_model_version(db, str(version_id), req.target_status, req.notes)
    except ModelNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ModelVersionResponse(
        id=str(mv.id),
        model_id=mv.model_id,
        version=mv.version,
        action=mv.action,
        status=mv.status,
        artifact_uri=mv.artifact_uri,
        manifest_uri=mv.manifest_uri,
        manifest=mv.manifest or {},
        metrics=mv.metrics or {},
        notes=mv.notes,
        created_at=mv.created_at.isoformat() if mv.created_at else "",
        activated_at=mv.activated_at.isoformat() if mv.activated_at else None,
    )

class UpdateModelRequest(BaseModel):
    notes: Optional[str] = None
    status: Optional[str] = None

@router.patch("/models/{version_id}", response_model=ModelVersionResponse)
def update_model(
    version_id: UUID,
    req: UpdateModelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    mv = db.query(ModelVersion).filter(ModelVersion.id == version_id).first()
    if not mv:
        raise HTTPException(status_code=404, detail="Model version not found")

    if req.status is not None and req.status not in {"draft", "candidate", "active", "archived", "rejected"}:
        raise HTTPException(status_code=400, detail="Invalid model status")

    if req.status == "active":
        # Route through promote_model_version so the currently active version
        # for this action gets demoted — avoids two "active" versions coexisting.
        try:
            mv = promote_model_version(db, str(version_id), "active", req.notes)
        except ModelNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    else:
        if req.notes is not None:
            mv.notes = req.notes
        if req.status is not None:
            mv.status = req.status
        db.commit()
        db.refresh(mv)

    return ModelVersionResponse(
        id=str(mv.id),
        model_id=mv.model_id,
        version=mv.version,
        action=mv.action,
        status=mv.status,
        artifact_uri=mv.artifact_uri,
        manifest_uri=mv.manifest_uri,
        manifest=mv.manifest or {},
        metrics=mv.metrics or {},
        notes=mv.notes,
        created_at=mv.created_at.isoformat() if mv.created_at else "",
        activated_at=mv.activated_at.isoformat() if mv.activated_at else None,
    )

@router.delete("/models/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(
    version_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    mv = db.query(ModelVersion).filter(ModelVersion.id == version_id).first()
    if not mv:
        raise HTTPException(status_code=404, detail="Model version not found")
        
    # Remove from storage if necessary
    if mv.artifact_uri and mv.artifact_uri.startswith("s3://"):
        from app.services.storage_service import storage_service
        bucket = storage_service.bucket_name
        key = mv.artifact_uri.replace(f"s3://{bucket}/", "")
        try:
            storage_service.s3.delete_object(Bucket=bucket, Key=key)
        except Exception:
            # log warning but continue deletion
            pass

    db.delete(mv)
    db.commit()
    return None
