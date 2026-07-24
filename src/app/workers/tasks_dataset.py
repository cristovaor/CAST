"""Celery task for building reproducible multimodal datasets (docs §17).

Pipeline:
    1. Select sessions by the dataset's build_criteria (inclusion/exclusion)
    2. Assemble the multimodal record set + reproducible manifest
    3. Compute a content checksum and write the artifact (JSONL + manifest) to storage
    4. Persist lineage (included/excluded sessions) and mark the dataset built

Operates directly on the Dataset row. Runs the same core synchronously as a
fallback when no broker is available.
"""
from __future__ import annotations

import json
import hashlib
import logging
from datetime import datetime

from celery.utils.log import get_task_logger

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import Dataset, DatasetState, AuditLog, AuditAction
from app.services.storage_service import storage_service
from app.services.dataset_service import select_sessions, build_manifest

logger = get_task_logger(__name__)


def build_dataset(dataset_id: str) -> dict:
    """Synchronous core: select → assemble → checksum → store → persist lineage."""
    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not ds:
            return {"error": "Dataset not found"}
        if ds.state in (DatasetState.frozen, DatasetState.published_internal):
            return {"error": "Dataset is frozen; create a new version to rebuild"}

        ds.build_status = "building"
        ds.state = DatasetState.building
        ds.build_error = None
        db.commit()

        criteria = dict(ds.build_criteria or {})
        included, excluded = select_sessions(
            db,
            criteria,
            organization_id=ds.organization_id,
        )

        manifest = build_manifest(
            db, criteria, included, excluded,
            dataset_version=ds.dataset_version, level=ds.level or "analytic", owner=ds.owner,
        )

        # Artifact: newline-delimited JSON of records + the manifest as a header.
        records_jsonl = "\n".join(json.dumps(r, ensure_ascii=False) for r in included)
        checksum = "sha256:" + hashlib.sha256(records_jsonl.encode("utf-8")).hexdigest()[:16]
        manifest["checksum"] = checksum
        manifest["generatedAt"] = datetime.utcnow().isoformat()

        artifact = {
            "manifest": manifest,
            "records": included,
            "excluded": excluded,
        }
        object_key = f"datasets/{ds.id}/{ds.dataset_version}/dataset.json"
        storage_service.upload_bytes(
            object_key,
            json.dumps(artifact, ensure_ascii=False, indent=2).encode("utf-8"),
            "application/json",
        )

        # Persist results & lineage.
        ds.manifest = manifest
        ds.checksum = checksum
        ds.storage_uri = f"s3://{storage_service.bucket_name}/{object_key}"
        ds.participant_count = manifest["participantCount"]
        ds.session_count = manifest["sessionCount"]
        ds.included_session_ids = [r["session_id"] for r in included]
        ds.excluded_sessions = excluded
        ds.lineage = {
            "included": len(included),
            "excluded": len(excluded),
            "criteria": criteria,
            "built_at": datetime.utcnow().isoformat(),
        }
        ds.build_status = "built"
        ds.state = DatasetState.validating  # ready for review before freezing
        ds.built_at = datetime.utcnow()

        db.add(AuditLog(
            organization_id=ds.organization_id,
            action=AuditAction.dataset_freeze,  # closest audit kind for build/materialize
            entity_type="dataset",
            entity_id=str(dataset_id),
            detail={"op": "build", "version": ds.dataset_version, "sessions": len(included), "excluded": len(excluded)},
        ))
        db.commit()

        return {
            "dataset_id": str(dataset_id),
            "included": len(included),
            "excluded": len(excluded),
            "checksum": checksum,
            "storage_uri": ds.storage_uri,
        }
    except Exception as e:
        logger.error(f"Error building dataset {dataset_id}: {e}", exc_info=True)
        db.rollback()
        ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if ds:
            ds.build_status = "failed"
            ds.state = DatasetState.draft
            ds.build_error = str(e)
            db.commit()
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def build_dataset_task(self, dataset_id: str):
    """Async dataset build."""
    started = datetime.utcnow()
    result = build_dataset(dataset_id)
    result["elapsed_ms"] = (datetime.utcnow() - started).total_seconds() * 1000
    return result
