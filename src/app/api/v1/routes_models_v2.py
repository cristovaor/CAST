"""API routes for Model Registry (v2)."""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.db.models import User, ModelVersion
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

    class Config:
        from_attributes = True

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
    current_user: User = Depends(get_current_user),
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

@router.post("/models/{version_id}/promote", response_model=ModelVersionResponse)
def promote_model(
    version_id: UUID,
    req: PromoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    mv = db.query(ModelVersion).filter(ModelVersion.id == version_id).first()
    if not mv:
        raise HTTPException(status_code=404, detail="Model version not found")
        
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
    current_user: User = Depends(get_current_user),
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
