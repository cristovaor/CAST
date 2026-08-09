from __future__ import annotations

import hashlib
import json
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.domains.gaze.models import GazeArtifact, GazeCalibration, GazeCalibrationSample
from app.domains.gaze.processing import process_gaze
from app.domains.gaze.schemas import GazeCalibrationCreate, GazeSampleBatch
from app.services.storage_service import storage_service


def create_calibration(db: Session, *, session_id: UUID, user_id: UUID, payload: GazeCalibrationCreate) -> GazeCalibration:
    configuration = payload.configuration | {
        "screen_width_px": payload.screen_width_px,
        "screen_height_px": payload.screen_height_px,
        "pixels_per_degree": payload.pixels_per_degree,
        "random_seed": payload.random_seed,
        "protocol": {"grid": "3x3", "repetitions": 2, "stabilization_ms": 500, "collection_ms": 1500, "validation_points": 5},
    }
    calibration = GazeCalibration(session_id=session_id, created_by=user_id, configuration=configuration)
    db.add(calibration)
    db.commit()
    db.refresh(calibration)
    return calibration


def add_samples(db: Session, *, calibration: GazeCalibration, payload: GazeSampleBatch) -> tuple[int, int]:
    ids = [sample.client_sample_id for sample in payload.samples]
    existing = {row.client_sample_id for row in db.query(GazeCalibrationSample).filter(GazeCalibrationSample.calibration_id == calibration.id, GazeCalibrationSample.client_sample_id.in_(ids)).all()}
    created = 0
    for sample in payload.samples:
        if sample.client_sample_id not in existing:
            db.add(GazeCalibrationSample(calibration_id=calibration.id, **sample.model_dump()))
            created += 1
    db.commit()
    return created, len(payload.samples) - created


def _write_artifact(db: Session, calibration: GazeCalibration, *, kind: str, layer: str, rows: list[dict], metrics: dict) -> GazeArtifact:
    encoded = ("\n".join(json.dumps(row, separators=(",", ":"), sort_keys=True) for row in rows) + "\n").encode()
    checksum = hashlib.sha256(encoded).hexdigest()
    key = f"gaze/{calibration.session_id}/{calibration.id}/{kind.lower()}.jsonl"
    if not storage_service.upload_bytes(key, encoded, "application/x-ndjson"):
        raise IOError(f"could not preserve {kind} gaze artifact")
    artifact = GazeArtifact(
        calibration_id=calibration.id, kind=kind, layer=layer,
        storage_uri=f"s3://{storage_service.bucket_name}/{key}", checksum_sha256=checksum,
        start_time_us=min(row["source_time_us"] for row in rows), end_time_us=max(row["source_time_us"] for row in rows),
        sample_count=len(rows), metrics=metrics,
        provenance={"calibration_id": str(calibration.id), "configuration": calibration.configuration, "experimental": True},
    )
    db.add(artifact)
    return artifact


def finalize_calibration(db: Session, calibration_id: UUID) -> GazeCalibration:
    calibration = db.query(GazeCalibration).filter(GazeCalibration.id == calibration_id).with_for_update().one()
    if calibration.status in {"ready", "no_go"}:
        return calibration
    calibration.status = "processing"
    db.commit()
    try:
        samples = db.query(GazeCalibrationSample).filter(GazeCalibrationSample.calibration_id == calibration.id).order_by(GazeCalibrationSample.source_time_us).all()
        rows = [{column.name: getattr(sample, column.name) for column in GazeCalibrationSample.__table__.columns if column.name not in {"id", "calibration_id", "created_at"}} for sample in samples]
        config = calibration.configuration
        result = process_gaze(rows, screen_width_px=int(config["screen_width_px"]), screen_height_px=int(config["screen_height_px"]), pixels_per_degree=float(config["pixels_per_degree"]), alpha=float(config.get("ridge_alpha", 1.0)))
        _write_artifact(db, calibration, kind="iris_offset_proxy", layer="RAW", rows=result.proxy_rows, metrics=result.metrics)
        if result.calibrated_rows:
            _write_artifact(db, calibration, kind="calibrated_screen_gaze", layer="MODEL_OUTPUT", rows=result.calibrated_rows, metrics=result.metrics)
            _write_artifact(db, calibration, kind="calibrated_screen_gaze", layer="FILTERED", rows=result.filtered_rows, metrics=result.metrics)
        calibration.metrics = result.metrics
        calibration.verdict = result.verdict
        calibration.status = "no_go" if result.verdict == "no_go" else "ready"
        calibration.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(calibration)
        return calibration
    except Exception as exc:
        db.rollback()
        calibration = db.query(GazeCalibration).filter(GazeCalibration.id == calibration_id).one()
        calibration.status = "failed"
        calibration.error_message = str(exc)
        db.commit()
        raise


def read_series(artifact: GazeArtifact, *, start_time_us: int, end_time_us: int, limit: int) -> list[dict]:
    data = storage_service.download_bytes(storage_service.key_from_uri(artifact.storage_uri)).decode()
    rows = (json.loads(line) for line in data.splitlines() if line)
    return [row for row in rows if start_time_us <= row["source_time_us"] <= end_time_us][:limit]
