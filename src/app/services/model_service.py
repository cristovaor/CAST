"""Service for managing model registry operations."""
from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional, Tuple, Any

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.models import ModelVersion
from cast.models.manifest import ModelManifest

# Usually you'd import the loaded model from a cache
# For now we'll simulate loading it or rely on the caller
from cast.models.manifest import ModelManifest

class ModelNotFoundError(Exception):
    pass


def register_model_version(
    db: Session,
    model_id: str,
    version: str,
    action: str,
    manifest: ModelManifest,
    artifact_uri: Optional[str] = None,
    manifest_uri: Optional[str] = None,
    notes: Optional[str] = None,
) -> ModelVersion:
    """Register a new candidate model version."""
    
    # Check if exists
    existing = db.query(ModelVersion).filter(
        ModelVersion.model_id == model_id,
        ModelVersion.version == version,
        ModelVersion.action == action,
    ).first()

    if existing:
        raise ValueError(f"Version {version} already exists for model {model_id} action {action}")

    metrics = {}
    if manifest.avg_metrics:
        metrics = manifest.avg_metrics.model_dump()

    mv = ModelVersion(
        model_id=model_id,
        version=version,
        action=action,
        status="draft",
        artifact_uri=artifact_uri or manifest.artifact_uri,
        manifest_uri=manifest_uri,
        manifest=manifest.model_dump(),
        metrics=metrics,
        notes=notes,
    )
    db.add(mv)
    db.commit()
    db.refresh(mv)
    return mv


def promote_model_version(
    db: Session,
    version_id: str,
    target_status: str,
    notes: Optional[str] = None,
) -> ModelVersion:
    """Promote or demote a model version.

    If target_status is 'active', demotes the currently active model for the same action.
    """
    mv = db.query(ModelVersion).filter(ModelVersion.id == version_id).first()
    if not mv:
        raise ModelNotFoundError(f"Model version {version_id} not found")

    if target_status == "active":
        # Demote current active
        active_others = db.query(ModelVersion).filter(
            ModelVersion.action == mv.action,
            ModelVersion.status == "active",
            ModelVersion.id != mv.id,
        ).all()
        for other in active_others:
            other.status = "archived"
            other.notes = f"{other.notes or ''}\nDemoted by activation of {mv.id}".strip()
        
        mv.activated_at = datetime.utcnow()

    mv.status = target_status
    if notes:
        mv.notes = notes

    db.commit()
    db.refresh(mv)
    return mv


def get_model_by_version_id(db: Session, model_version_id: str) -> Tuple[Any, ModelManifest, ModelVersion]:
    """Load a specific model version's artifact regardless of its status.

    Unlike get_active_model, this does not require status == "active" — it lets
    callers (e.g. the model test-run flow) try out a draft/candidate version
    before promoting it.

    NOTE: This function imports ML frameworks dynamically and should only
    be called from the Celery worker, not from the API server.
    """
    mv = db.query(ModelVersion).filter(ModelVersion.id == model_version_id).first()
    if not mv:
        raise ModelNotFoundError(f"Model version {model_version_id} not found")

    if not mv.artifact_uri:
        raise ValueError(f"Model version {model_version_id} has no artifact_uri")

    manifest = ModelManifest.model_validate(mv.manifest)

    from app.ml.model_loader import load_active_model_artifact
    model = load_active_model_artifact(mv.artifact_uri, manifest)

    return model, manifest, mv


def get_active_model(db: Session, action: str) -> Tuple[Any, ModelManifest]:
    """Get the active model artifact and manifest for an action.
    
    Downloads the model from MinIO if necessary, loads it into memory,
    and returns both the model object and its manifest.
    
    NOTE: This function imports ML frameworks dynamically and should only
    be called from the Celery worker, not from the API server.
    """
    mv = db.query(ModelVersion).filter(
        ModelVersion.action == action,
        ModelVersion.status == "active",
    ).first()

    if not mv:
        raise ValueError(f"No active model found for action {action}")

    # Load manifest
    manifest = ModelManifest.model_validate(mv.manifest)
    
    if not mv.artifact_uri:
        raise ValueError(f"No artifact_uri found for active model action {action}")
    
    # Delegate to model_loader (keeps ML imports out of the API server)
    from app.ml.model_loader import load_active_model_artifact
    model = load_active_model_artifact(mv.artifact_uri, manifest)
    
    return model, manifest
