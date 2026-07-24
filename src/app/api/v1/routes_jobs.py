import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.db.session import SessionLocal
from app.db.models import ProcessingJob, JobStatus

router = APIRouter(prefix="/jobs", tags=["jobs"])

from app.api.deps import get_db

async def job_status_generator(job_id: UUID, db: Session):
    # This loop polls the DB periodically and yields SSE events.
    # In a fully event-driven architecture, this might use Redis pub/sub.
    try:
        while True:
            # Refresh from DB each iteration
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break
            
            # Construct payload mapped to frontend expectations
            payload = {
                "status": job.status.value,
                "progress": float(job.progress) if job.progress else 0,
                "currentStep": _map_status_to_step(job.status, job.progress),
                "logs": job.logs if job.logs else []
            }
            if job.error_message:
                payload["errorMessage"] = job.error_message
                payload["logs"].append({
                    "timestamp": job.finished_at.isoformat() if job.finished_at else "",
                    "level": "error",
                    "message": job.error_message
                })

            yield f"data: {json.dumps(payload)}\n\n"

            if job.status in [JobStatus.succeeded, JobStatus.failed, JobStatus.canceled]:
                break

            await asyncio.sleep(2.0)
    except asyncio.CancelledError:
        pass

def _map_status_to_step(status: JobStatus, progress):
    if status == JobStatus.queued: return "Aguardando na fila..."
    if status == JobStatus.running:
        p = float(progress) if progress else 0
        if p < 15: return "Extraindo metadados"
        if p < 30: return "Validando qualidade"
        if p < 50: return "Extraindo landmarks faciais"
        if p < 65: return "Gerando janelas temporais"
        if p < 85: return "Executando inferência"
        if p < 95: return "Sumarizando microações"
        return "Gerando relatório"
    if status == JobStatus.succeeded: return "Gerando relatório"
    return "Falha"

@router.get("/{job_id}/stream")
def stream_job_status(job_id: UUID, db: Session = Depends(get_db)):
    return StreamingResponse(
        job_status_generator(job_id, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.get("/{job_id}")
def get_job_status(job_id: UUID, db: Session = Depends(get_db)):
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "id": job.id,
        "status": job.status.value,
        "step": _map_status_to_step(job.status, job.progress),
        "progress": float(job.progress) if job.progress else 0,
        "error": job.error_message
    }

@router.post("/{job_id}/cancel", status_code=202)
def cancel_job(job_id: UUID, db: Session = Depends(get_db)):
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    # Revoke celery task
    from app.workers.celery_app import celery_app
    celery_app.control.revoke(str(job.id), terminate=True, signal='SIGKILL')
        
    job.status = JobStatus.canceled
    db.commit()
    
    return {"message": "Job cancelled"}

@router.post("/{job_id}/retry", status_code=202)
def retry_job(job_id: UUID, db: Session = Depends(get_db)):
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
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
    
    from app.workers.tasks_video import process_video_task
    process_video_task.delay(str(job.id))
    
    return {"message": "Job retried"}

@router.get("/{job_id}/events")
def get_job_events(job_id: UUID, db: Session = Depends(get_db)):
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job.id,
        "status": job.status.value,
        "logs": job.logs if job.logs else []
    }
