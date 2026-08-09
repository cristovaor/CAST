from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_session as get_owned_session
from app.core.config import settings
from app.db.models import AuditLog, User
from app.domains.explorer.schemas import ExplorerExportJob, ExplorerIntervalExportRequest, ExplorerManifest
from app.domains.explorer.service import build_explorer_manifest
from app.services.storage_service import storage_service


router = APIRouter(prefix="/sessions", tags=["research-explorer"])


@router.get("/{session_id}/explorer-manifest", response_model=ExplorerManifest)
def get_explorer_manifest(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not settings.MULTIMODAL_EXPLORER_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Multimodal Research Explorer is disabled",
        )
    session = get_owned_session(db, current_user, session_id)
    return build_explorer_manifest(db, session)


@router.post("/{session_id}/explorer-exports", response_model=ExplorerExportJob, status_code=202)
def create_explorer_export(session_id: UUID, payload: ExplorerIntervalExportRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not settings.MULTIMODAL_EXPLORER_ENABLED:
        raise HTTPException(status_code=404, detail="Multimodal Research Explorer is disabled")
    get_owned_session(db, current_user, session_id)
    from app.workers.tasks_explorer import export_explorer_interval_task
    task = export_explorer_interval_task.delay(str(session_id), payload.start_time_us, payload.end_time_us, payload.track_ids, payload.format)
    from app.api.v1.routes_governance import record_access
    record_access(db, "explorer_export", task.id, actor=current_user, detail={"session_id": str(session_id), **payload.model_dump()})
    return ExplorerExportJob(job_id=task.id)


@router.get("/{session_id}/explorer-exports/{job_id}")
def get_explorer_export(session_id: UUID, job_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_owned_session(db, current_user, session_id)
    owned = db.query(AuditLog.id).filter(AuditLog.organization_id == current_user.organization_id, AuditLog.entity_type == "explorer_export", AuditLog.entity_id == str(job_id)).first()
    if owned is None:
        raise HTTPException(status_code=404, detail="Explorer export not found")
    from celery.result import AsyncResult
    result = AsyncResult(str(job_id))
    response = {"job_id": str(job_id), "status": result.state, "error": str(result.result) if result.state == "FAILURE" else None}
    if result.state == "SUCCESS":
        response["download_url"] = storage_service.generate_presigned_download_url(result.result["object_key"])
        response["checksum_sha256"] = result.result["checksum_sha256"]
    return response
