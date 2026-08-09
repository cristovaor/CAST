from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import LandmarkArtifact, VideoAsset
from app.domains.pupil.models import PupilArtifact, PupilRun
from app.domains.pupil.processing import process_pupil
from app.domains.pupil.schemas import PupilRunCreate
from app.services.storage_service import storage_service


def _json_safe(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def create_pupil_run(db: Session, *, session_id: UUID, user_id: UUID, payload: PupilRunCreate) -> PupilRun:
    face = db.query(LandmarkArtifact).join(VideoAsset, VideoAsset.id == LandmarkArtifact.video_asset_id).filter(LandmarkArtifact.id == payload.face_artifact_id, VideoAsset.session_id == session_id).first()
    if face is None:
        raise ValueError("face artifact does not belong to session")
    if payload.environment_artifact_id is not None:
        owned_environment = db.execute(
            text("SELECT 1 FROM environment_artifacts WHERE id=:id AND session_id=:session_id"),
            {"id": payload.environment_artifact_id, "session_id": session_id},
        ).first()
        if owned_environment is None: raise ValueError("environment artifact does not belong to session")
    rows = [row.model_dump() for row in payload.observations]
    encoded = ("\n".join(json.dumps(row, separators=(",", ":"), sort_keys=True) for row in rows) + "\n").encode()
    checksum = hashlib.sha256(encoded).hexdigest()
    run = PupilRun(session_id=session_id, created_by=user_id, face_artifact_id=payload.face_artifact_id, environment_artifact_id=payload.environment_artifact_id, input_uri="pending", input_checksum_sha256=checksum, configuration=payload.configuration)
    db.add(run); db.flush()
    key = f"pupil/{session_id}/{run.id}/observations.jsonl"
    if not storage_service.upload_bytes(key, encoded, "application/x-ndjson"):
        db.rollback(); raise IOError("could not preserve raw pupil observations")
    run.input_uri = f"s3://{storage_service.bucket_name}/{key}"
    db.commit(); db.refresh(run)
    return run


def _artifact(db: Session, run: PupilRun, *, kind: str, layer: str, rows: list[dict], metrics: dict) -> None:
    safe_rows = _json_safe(rows); safe_metrics = _json_safe(metrics)
    encoded = ("\n".join(json.dumps(row, separators=(",", ":"), sort_keys=True) for row in safe_rows) + "\n").encode()
    checksum = hashlib.sha256(encoded).hexdigest(); key = f"pupil/{run.session_id}/{run.id}/{kind}.jsonl"
    if not storage_service.upload_bytes(key, encoded, "application/x-ndjson"): raise IOError(f"could not preserve {kind}")
    db.add(PupilArtifact(run_id=run.id, kind=kind, layer=layer, storage_uri=f"s3://{storage_service.bucket_name}/{key}", checksum_sha256=checksum, start_time_us=rows[0]["source_time_us"], end_time_us=rows[-1]["source_time_us"], sample_count=len(rows), metrics=safe_metrics, provenance={"face_artifact_id": str(run.face_artifact_id), "environment_artifact_id": str(run.environment_artifact_id) if run.environment_artifact_id else None, "webcam_rgb_not_pupillometer": True}))


def materialize_pupil_run(db: Session, run_id: UUID) -> PupilRun:
    run = db.query(PupilRun).filter(PupilRun.id == run_id).with_for_update().one()
    if run.status in {"ready", "no_go"}: return run
    run.status = "processing"; db.commit()
    try:
        data = storage_service.download_bytes(storage_service.key_from_uri(run.input_uri)).decode()
        rows = [json.loads(line) for line in data.splitlines() if line]
        result = process_pupil(rows, baseline_fraction=float(run.configuration.get("baseline_fraction", 0.2)))
        _artifact(db, run, kind="pupil_raw", layer="RAW", rows=result.raw, metrics=result.metrics)
        _artifact(db, run, kind="pupil_normalized", layer="DERIVED", rows=result.normalized, metrics=result.metrics)
        if result.corrected: _artifact(db, run, kind="pupil_luminance_corrected", layer="FILTERED", rows=result.corrected, metrics=result.metrics)
        run.metrics = _json_safe(result.metrics); run.verdict = result.verdict
        run.status = "ready" if result.verdict == "go" else "no_go"; run.completed_at = datetime.utcnow()
        db.commit(); db.refresh(run); return run
    except Exception as exc:
        db.rollback(); run = db.query(PupilRun).filter(PupilRun.id == run_id).one(); run.status = "failed"; run.error_message = str(exc); db.commit(); raise


def read_series(artifact: PupilArtifact, *, start_time_us: int, end_time_us: int, limit: int) -> list[dict]:
    data = storage_service.download_bytes(storage_service.key_from_uri(artifact.storage_uri)).decode()
    return [row for row in (json.loads(line) for line in data.splitlines() if line) if start_time_us <= row["source_time_us"] <= end_time_us][:limit]
