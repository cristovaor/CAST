"""Inference API endpoints."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_job, get_video
from app.db.models import (
    User, VideoAsset, ProcessingJob, JobStatus, JobType, Prediction
)
from app.schemas.inference import (
    InferenceRequest, InferenceJobStatus, PredictionResult, VideoDescriptors,
)
from app.workers.tasks_video import process_video_task

router = APIRouter()


@router.post("/videos/{video_id}/infer", status_code=status.HTTP_202_ACCEPTED)
def start_inference(
    video_id: UUID,
    body: InferenceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start an async inference job for a video.

    Returns a job_id to poll for status. The inference pipeline runs
    asynchronously via Celery.
    """
    video = get_video(db, current_user, video_id)

    # Governance: block analysis without valid consent (docs §21).
    from app.api.v1.routes_governance import assert_consent_valid_for_video, record_access
    assert_consent_valid_for_video(video_id, db)
    record_access(db, "video", video_id, actor=current_user, detail={"op": "infer"})

    # Create a processing job
    job = ProcessingJob(
        video_asset_id=video.id,
        job_type=JobType.infer,
        status=JobStatus.queued,
        progress=0.0,
        logs=[{"level": "info", "message": "Job criado, aguardando worker"}],
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Dispatch Celery task
    process_video_task.delay(str(job.id))

    return {
        "job_id": str(job.id),
        "video_id": str(video_id),
        "status": "queued",
        "message": "Inference job enqueued. Poll /api/v1/inference-jobs/{job_id} for status.",
    }


@router.get("/inference-jobs/{job_id}", response_model=InferenceJobStatus)
def get_inference_job_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the status of an inference job."""
    job = get_job(db, current_user, job_id)

    return InferenceJobStatus(
        job_id=str(job.id),
        video_id=str(job.video_asset_id),
        status=job.status.value if hasattr(job.status, "value") else str(job.status),
        progress=float(job.progress or 0),
        started_at=job.started_at.isoformat() if job.started_at else None,
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
        error=job.error_message,
    )


@router.get("/videos/{video_id}/predictions")
def get_video_predictions(
    video_id: UUID,
    model_version: Optional[str] = Query(None, description="Filter by model version"),
    include_frames: bool = Query(False, description="Include per-frame predictions"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get prediction results for a video.

    Returns the most recent prediction, with optional per-frame detail.
    """
    get_video(db, current_user, video_id)

    query = db.query(Prediction).filter(Prediction.video_asset_id == video_id)
    prediction = query.order_by(Prediction.created_at.desc()).first()

    if not prediction:
        raise HTTPException(
            status_code=404,
            detail="No predictions found. Run inference first.",
        )

    response = {
        "video_id": str(video_id),
        "prediction_id": str(prediction.id),
        "prediction_uri": prediction.prediction_uri,
        "threshold": float(prediction.threshold or 0.5),
        "created_at": prediction.created_at.isoformat() if prediction.created_at else None,
        "summary": prediction.summary or {},
    }

    return response


@router.get("/videos/{video_id}/descriptors", response_model=VideoDescriptors)
def get_video_descriptors(
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get high-level event descriptors per action for a video."""
    get_video(db, current_user, video_id)

    prediction = (
        db.query(Prediction)
        .filter(Prediction.video_asset_id == video_id)
        .order_by(Prediction.created_at.desc())
        .first()
    )

    if not prediction or not prediction.summary:
        return VideoDescriptors(video_id=str(video_id), actions={})

    return VideoDescriptors(
        video_id=str(video_id),
        actions=prediction.summary,
    )
