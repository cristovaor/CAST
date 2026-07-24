from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from pydantic import BaseModel
from app.db.session import SessionLocal
from app.db.models import AuditLog, User
import uuid
from app.workers.tasks_export import export_study_task

router = APIRouter(prefix="/exports", tags=["exports"])

from app.api.deps import get_db, get_current_user
from app.api.ownership import get_study

class ExportRequest(BaseModel):
    study_id: UUID
    format: str = "csv"

class ExportJobResponse(BaseModel):
    job_id: UUID

class ExportDownloadResponse(BaseModel):
    download_url: str


def _require_export(db: Session, current_user: User, job_id: UUID) -> None:
    exists = (
        db.query(AuditLog.id)
        .filter(
            AuditLog.organization_id == current_user.organization_id,
            AuditLog.entity_type == "export",
            AuditLog.entity_id == str(job_id),
        )
        .first()
    )
    if exists is None:
        raise HTTPException(status_code=404, detail="Export not found")

@router.post("/", response_model=ExportJobResponse, status_code=202)
def create_export(
    request: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if request.format not in ["csv", "parquet"]:
        raise HTTPException(status_code=400, detail="Format must be csv or parquet")
    get_study(db, current_user, request.study_id)

    task = export_study_task.delay(str(request.study_id), request.format)

    from app.api.v1.routes_governance import record_access
    record_access(
        db, "export", task.id, actor=current_user,
        detail={"op": "export_request", "format": request.format, "study_id": str(request.study_id)},
    )

    return {"job_id": UUID(task.id)}

@router.get("/{job_id}")
def get_export_status(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_export(db, current_user, job_id)
    from celery.result import AsyncResult
    res = AsyncResult(str(job_id))
    return {
        "job_id": job_id,
        "status": res.state,
        "error": str(res.result) if res.state == "FAILURE" else None
    }

@router.get("/{job_id}/download-url", response_model=ExportDownloadResponse)
def get_export_download_url(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_export(db, current_user, job_id)
    from celery.result import AsyncResult
    res = AsyncResult(str(job_id))
    if res.state != "SUCCESS":
        raise HTTPException(status_code=400, detail="Export not finished or failed")

    # The task returns the presigned URL
    url = res.result

    from app.api.v1.routes_governance import record_access
    record_access(db, "export", job_id, actor=current_user, detail={"op": "download_url"})

    return {"download_url": url}
