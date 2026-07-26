import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.db.session import SessionLocal
from app.db.models import (
    ProcessingJob,
    JobStatus,
    User,
    VideoAsset,
    Session as SessionModel,
    Participant,
    Study,
    Project,
)
from app.api.deps import get_current_user
from app.api.ownership import get_job, jobs_for_user

router = APIRouter(prefix="/jobs", tags=["jobs"])

from app.api.deps import get_db

async def job_status_generator(job_id: UUID, db: Session):
    # This loop polls the DB periodically and yields SSE events.
    # In a fully event-driven architecture, this might use Redis pub/sub.
    last_log_count = 0
    try:
        while True:
            # Refresh from DB each iteration
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break
            
            # Construct payload mapped to frontend expectations
            all_logs = list(job.logs or [])
            payload = {
                "status": job.status.value,
                "progress": float(job.progress) if job.progress else 0,
                "currentStep": _map_status_to_step(job.status, job.progress, job.job_type),
                "logs": all_logs[last_log_count:]
            }
            last_log_count = len(all_logs)
            if job.error_message:
                payload["errorMessage"] = job.error_message
                payload["logs"] = [*payload["logs"], {
                    "timestamp": job.finished_at.isoformat() if job.finished_at else "",
                    "level": "error",
                    "message": job.error_message
                }]

            yield f"data: {json.dumps(payload)}\n\n"

            if job.status in [JobStatus.succeeded, JobStatus.failed, JobStatus.canceled]:
                break

            await asyncio.sleep(2.0)
    except asyncio.CancelledError:
        pass

def _map_status_to_step(status: JobStatus, progress, job_type=None):
    if status == JobStatus.queued: return "Aguardando na fila..."
    if status == JobStatus.running:
        p = float(progress) if progress else 0
        if job_type == "report" or getattr(job_type, "value", None) == "report":
            if p < 15: return "Congelando snapshot"
            if p < 55: return "Executando análises estatísticas"
            if p < 90: return "Gerando PDF e JSON"
            return "Persistindo proveniência"
        if p < 15: return "Extraindo metadados"
        if p < 30: return "Validando qualidade"
        if p < 50: return "Extraindo landmarks faciais"
        if p < 65: return "Gerando janelas temporais"
        if p < 85: return "Executando inferência"
        if p < 95: return "Sumarizando microações"
        return "Gerando relatório"
    if status == JobStatus.succeeded:
        return (
            "Relatório concluído"
            if job_type == "report" or getattr(job_type, "value", None) == "report"
            else "Processamento concluído"
        )
    if status == JobStatus.canceled: return "Cancelado"
    return "Falha"


@router.get("/")
def list_jobs(
    job_status: JobStatus | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = jobs_for_user(db, current_user)
    if job_status is not None:
        query = query.filter(ProcessingJob.status == job_status)
    jobs = (
        query.order_by(
            ProcessingJob.started_at.desc().nullslast(),
            ProcessingJob.id.desc(),
        )
        .offset(skip)
        .limit(min(limit, 500))
        .all()
    )
    now = datetime.utcnow()
    return [
        {
            "id": job.id,
            "video_asset_id": job.video_asset_id,
            "job_type": job.job_type.value,
            "status": job.status.value,
            "progress": float(job.progress or 0),
            "error_message": job.error_message,
            "started_at": job.started_at,
            "finished_at": job.finished_at,
            "worker_id": job.worker_id,
            "current_step": _map_status_to_step(job.status, job.progress, job.job_type),
            "video_filename": job.video_asset.filename if job.video_asset else None,
            "study_name": (
                job.study.name
                if job.study
                else (
                    job.video_asset.session.participant.study.name
                    if job.video_asset
                    and job.video_asset.session
                    and job.video_asset.session.participant
                    else None
                )
            ),
            "result": job.result or {},
            "elapsed_seconds": int(
                ((job.finished_at or now) - job.started_at).total_seconds()
            )
            if job.started_at
            else 0,
        }
        for job in jobs
    ]


@router.get("/{job_id}/stream")
def stream_job_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_job(db, current_user, job_id)
    return StreamingResponse(
        job_status_generator(job_id, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.get("/{job_id}")
def get_job_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = get_job(db, current_user, job_id)
        
    return {
        "id": job.id,
        "status": job.status.value,
        "step": _map_status_to_step(job.status, job.progress, job.job_type),
        "progress": float(job.progress) if job.progress else 0,
        "error": job.error_message,
        "result": job.result or {},
    }

@router.post("/{job_id}/cancel", status_code=202)
def cancel_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = get_job(db, current_user, job_id)
        
    # Revoke celery task
    from app.workers.celery_app import celery_app
    celery_app.control.revoke(str(job.id), terminate=True, signal='SIGKILL')
        
    job.status = JobStatus.canceled
    db.commit()
    
    return {"message": "Job cancelled"}

@router.post("/{job_id}/retry", status_code=202)
def retry_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = get_job(db, current_user, job_id)
        
    if job.status not in [JobStatus.failed, JobStatus.canceled]:
        raise HTTPException(status_code=400, detail="Only failed or canceled jobs can be retried")
        
    # Reset job
    job.status = JobStatus.queued
    job.progress = 0
    job.error_message = None
    if job.logs:
        current_logs = list(job.logs)
        current_logs.append({
            "timestamp": datetime.utcnow().isoformat(),
            "level": "info",
            "message": "Job retried by user"
        })
        job.logs = current_logs
    db.commit()
    
    if job.job_type.value == "report":
        from app.workers.tasks_reports import generate_scientific_report_task
        generate_scientific_report_task.apply_async(
            args=[str(job.id)], task_id=str(job.id)
        )
    else:
        from app.workers.tasks_video import process_video_task
        process_video_task.delay(str(job.id))
    
    return {"message": "Job retried"}

@router.get("/{job_id}/events")
def get_job_events(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = get_job(db, current_user, job_id)
        
    return {
        "job_id": job.id,
        "status": job.status.value,
        "logs": job.logs if job.logs else []
    }
