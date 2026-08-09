from __future__ import annotations

import hashlib
import json
from uuid import UUID

from sqlalchemy.orm import Session

from app.domains.context.models import EnvironmentArtifact, ExperimentalEvent, ExperimentalTrial
from app.domains.context.schemas import EnvironmentSeriesCreate, ExperimentalEventBatch, TrialCreate
from app.services.storage_service import storage_service


def create_trial(db: Session, *, session_id: UUID, payload: TrialCreate) -> ExperimentalTrial:
    existing = db.query(ExperimentalTrial).filter(
        ExperimentalTrial.session_id == session_id,
        ExperimentalTrial.client_trial_id == payload.client_trial_id,
    ).first()
    if existing is not None:
        return existing
    trial = ExperimentalTrial(session_id=session_id, **payload.model_dump())
    db.add(trial)
    db.commit()
    db.refresh(trial)
    return trial


def record_event_batch(db: Session, *, session_id: UUID, payload: ExperimentalEventBatch):
    trial_ids = {item.trial_id for item in payload.events if item.trial_id is not None}
    if trial_ids:
        owned_count = db.query(ExperimentalTrial).filter(
            ExperimentalTrial.session_id == session_id,
            ExperimentalTrial.id.in_(trial_ids),
        ).count()
        if owned_count != len(trial_ids):
            raise ValueError("event batch references a trial from another session")
    client_ids = [item.client_event_id for item in payload.events]
    existing = {
        item.client_event_id: item
        for item in db.query(ExperimentalEvent).filter(
            ExperimentalEvent.session_id == session_id,
            ExperimentalEvent.client_event_id.in_(client_ids),
        ).all()
    }
    ordered = []
    created = 0
    for item in payload.events:
        event = existing.get(item.client_event_id)
        if event is None:
            event = ExperimentalEvent(session_id=session_id, **item.model_dump())
            db.add(event)
            created += 1
        ordered.append(event)
    db.commit()
    for event in ordered:
        db.refresh(event)
    return ordered, created, len(ordered) - created


def create_environment_series(
    db: Session, *, session_id: UUID, payload: EnvironmentSeriesCreate
) -> EnvironmentArtifact:
    rows = [sample.model_dump() for sample in payload.samples]
    encoded = ("\n".join(json.dumps(row, separators=(",", ":"), sort_keys=True) for row in rows) + "\n").encode("utf-8")
    checksum = hashlib.sha256(encoded).hexdigest()
    artifact = EnvironmentArtifact(
        session_id=session_id,
        kind=payload.kind,
        status="queued",
        unit=payload.unit,
        method=payload.method,
        raw_uri="pending",
        raw_checksum_sha256=checksum,
        start_time_us=min(row["source_time_us"] for row in rows),
        end_time_us=max(row["source_time_us"] for row in rows),
        sample_count=len(rows),
        source_clock_id=rows[0]["source_clock_id"],
        provenance=payload.provenance,
    )
    db.add(artifact)
    db.flush()
    key = f"context/{session_id}/{artifact.id}/raw.jsonl"
    if not storage_service.upload_bytes(key, encoded, "application/x-ndjson"):
        db.rollback()
        raise IOError("Could not preserve environment series")
    artifact.raw_uri = f"s3://{storage_service.bucket_name}/{key}"
    db.commit()
    db.refresh(artifact)
    return artifact


def read_environment_series(artifact: EnvironmentArtifact, *, start_time_us: int, end_time_us: int, limit: int) -> list[dict]:
    data = storage_service.download_bytes(storage_service.key_from_uri(artifact.raw_uri)).decode("utf-8")
    rows = (json.loads(line) for line in data.splitlines() if line)
    return [row for row in rows if start_time_us <= row["source_time_us"] <= end_time_us][:limit]
