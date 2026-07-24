"""Reproducible, versioned multimodal datasets (docs §17).

Each dataset carries a full manifest; freezing snapshots it and every export
ships the manifest (versions, criteria, transformations, checksum). Exports are
recorded in the governance audit trail.
"""
import json
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from typing import List

from app.api.deps import get_db, get_current_user
from app.db.models import Dataset, DatasetState, AuditLog, AuditAction, User
from app.schemas.multimodal import (
    DatasetCreate, DatasetDetail, DatasetBuildCriteria, DatasetBuildPreview,
)

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _get_dataset(
    db: Session,
    current_user: User,
    dataset_id: UUID,
) -> Dataset:
    dataset = (
        db.query(Dataset)
        .filter(
            Dataset.id == dataset_id,
            Dataset.organization_id == current_user.organization_id,
        )
        .first()
    )
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/", response_model=List[DatasetDetail])
def list_datasets(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Dataset)
        .filter(Dataset.organization_id == current_user.organization_id)
        .order_by(Dataset.created_at.desc())
        .offset(skip).limit(limit).all()
    )


@router.post("/", response_model=DatasetDetail, status_code=201)
def create_dataset(
    payload: DatasetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    duplicate = (
        db.query(Dataset.id)
        .filter(
            Dataset.organization_id == current_user.organization_id,
            Dataset.name == payload.name,
            Dataset.dataset_version == payload.dataset_version,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="A dataset with this name and version already exists",
        )

    ds = Dataset(
        organization_id=current_user.organization_id,
        name=payload.name,
        dataset_version=payload.dataset_version,
        level=payload.level,
        state=DatasetState.draft,
        manifest=payload.manifest,
        participant_count=payload.participant_count,
        session_count=payload.session_count,
        owner=current_user.name,
        created_by=current_user.id,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_dataset(db, current_user, dataset_id)


@router.post("/preview", response_model=DatasetBuildPreview)
def preview_dataset(
    criteria: DatasetBuildCriteria,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dry-run the criteria: how many sessions would be included/excluded and why.

    Lets the researcher validate inclusion/exclusion before materializing (§17,
    fluxo 6). No dataset is created or modified.
    """
    from app.services.dataset_service import select_sessions
    included, excluded = select_sessions(
        db,
        criteria.model_dump(),
        organization_id=current_user.organization_id,
    )
    participants = {r["participant_code"] for r in included}
    conditions = sorted({r["condition"] for r in included if r["condition"]})
    return DatasetBuildPreview(
        included=len(included),
        excluded=len(excluded),
        excluded_sample=excluded[:20],
        participant_count=len(participants),
        conditions=conditions,
    )


@router.post("/{dataset_id}/build", response_model=DatasetDetail)
def build_dataset_endpoint(
    dataset_id: UUID,
    criteria: DatasetBuildCriteria,
    sync: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Materializes the dataset from sessions matching the criteria (docs §17).

    Persists the criteria, then dispatches the Celery worker. Falls back to
    inline building when the broker is unreachable (or `sync=true`).
    """
    ds = _get_dataset(db, current_user, dataset_id)
    if ds.state in (DatasetState.frozen, DatasetState.published_internal):
        raise HTTPException(status_code=409, detail="Dataset is frozen; create a new version to rebuild")

    ds.build_criteria = criteria.model_dump()
    db.commit()

    from app.workers.tasks_dataset import build_dataset_task, build_dataset

    if not sync:
        try:
            build_dataset_task.delay(str(dataset_id))
            return _get_dataset(db, current_user, dataset_id)
        except Exception:
            pass  # broker down — build inline

    try:
        build_dataset(str(dataset_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build dataset: {e}")

    db.expire_all()
    return _get_dataset(db, current_user, dataset_id)


@router.post("/{dataset_id}/freeze", response_model=DatasetDetail)
def freeze_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Freezes a dataset: computes a manifest checksum and locks the version."""
    ds = _get_dataset(db, current_user, dataset_id)
    if ds.state in (DatasetState.frozen, DatasetState.published_internal):
        raise HTTPException(status_code=409, detail="Dataset already frozen")

    manifest = dict(ds.manifest or {})
    manifest.update({
        "dataset_version": ds.dataset_version,
        "level": ds.level,
        "participant_count": ds.participant_count,
        "session_count": ds.session_count,
        "frozen_at": datetime.utcnow().isoformat(),
    })
    checksum = "sha256:" + hashlib.sha256(
        json.dumps(manifest, sort_keys=True).encode()
    ).hexdigest()[:16]
    ds.manifest = manifest
    ds.checksum = checksum
    ds.state = DatasetState.frozen
    ds.frozen_at = datetime.utcnow()

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        action=AuditAction.dataset_freeze,
        actor_id=current_user.id,
        actor_label=current_user.email,
        entity_type="dataset",
        entity_id=str(dataset_id),
        detail={"version": ds.dataset_version, "checksum": checksum},
    ))
    db.commit()
    db.refresh(ds)
    return ds


@router.get("/{dataset_id}/export")
def export_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns the export manifest and records the access in the audit trail.

    Every export ships version, pipeline & model versions, criteria, filters,
    exclusions, schema, checksum, date and responsible party (docs §17).
    """
    ds = _get_dataset(db, current_user, dataset_id)

    export_manifest = {
        "dataset_id": str(ds.id),
        "name": ds.name,
        "dataset_version": ds.dataset_version,
        "level": ds.level,
        "state": ds.state.value,
        "checksum": ds.checksum,
        "manifest": ds.manifest,
        "participant_count": ds.participant_count,
        "session_count": ds.session_count,
        "generated_at": datetime.utcnow().isoformat(),
        "owner": ds.owner,
    }

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        action=AuditAction.export,
        actor_id=current_user.id,
        actor_label=current_user.email,
        entity_type="dataset",
        entity_id=str(dataset_id),
        detail={"version": ds.dataset_version},
    ))
    db.commit()

    return JSONResponse(
        content=export_manifest,
        headers={"Content-Disposition": f'attachment; filename="{ds.name}_{ds.dataset_version}_manifest.json"'},
    )
