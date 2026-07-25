"""API routes for testing a specific ModelVersion against chosen videos.

Unlike POST /videos/{id}/infer (which always runs whatever ModelVersion is
currently "active"), these routes let a caller run inference with an
explicit model_version_id — including draft/candidate versions — so a new
model can be evaluated before being promoted.
"""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.api.v1.routes_jobs import _map_status_to_step
from app.db.models import JobStatus, JobType, ModelVersion, ProcessingJob, User

router = APIRouter()


class ModelTestRunRequest(BaseModel):
    video_asset_ids: List[UUID]
    threshold_override: Optional[float] = Field(None, ge=0.0, le=1.0)
    min_run_length: Optional[int] = Field(None, ge=1)
    persist_as_prediction: bool = False


@router.post("/models/{version_id}/test-run", status_code=status.HTTP_202_ACCEPTED)
def start_model_test_run(
    version_id: UUID,
    req: ModelTestRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Start an async test-run of one model version against chosen videos.

    Works for any status (draft/candidate/active) — this is the way to try
    out a newly trained model before promoting it.
    """
    mv = db.query(ModelVersion).filter(ModelVersion.id == version_id).first()
    if not mv:
        raise HTTPException(status_code=404, detail="Model version not found")

    if not req.video_asset_ids:
        raise HTTPException(status_code=400, detail="video_asset_ids must not be empty")

    job = ProcessingJob(
        video_asset_id=None,
        job_type=JobType.model_test_run,
        status=JobStatus.queued,
        progress=0.0,
        logs=[{"level": "info", "message": "Job de teste de modelo criado, aguardando worker"}],
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from app.workers.tasks_model_testing import test_model_inference_task

    test_model_inference_task.delay(
        str(job.id),
        str(version_id),
        [str(v) for v in req.video_asset_ids],
        req.threshold_override,
        req.min_run_length,
        req.persist_as_prediction,
    )

    return {
        "job_id": str(job.id),
        "model_version_id": str(version_id),
        "status": "queued",
        "message": "Model test-run enqueued. Poll /api/v1/models/test-runs/{job_id} for status.",
    }


def _get_test_run_job(db: Session, job_id: UUID) -> ProcessingJob:
    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.id == job_id, ProcessingJob.job_type == JobType.model_test_run)
        .first()
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Model test-run job not found")
    return job


@router.get("/models/test-runs/{job_id}")
def get_model_test_run_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    job = _get_test_run_job(db, job_id)
    return {
        "id": job.id,
        "status": job.status.value,
        "step": _map_status_to_step(job.status, job.progress),
        "progress": float(job.progress) if job.progress else 0,
        "error": job.error_message,
        "result": job.result,
    }
