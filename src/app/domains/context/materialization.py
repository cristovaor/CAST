from __future__ import annotations

import hashlib
import io
import json
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.domains.context.models import EnvironmentArtifact
from app.services.storage_service import storage_service


def normalize_environment_rows(raw: bytes, source_clock_id: str) -> list[dict]:
    rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    if not rows:
        raise ValueError("Environment series is empty")
    if any(row.get("source_clock_id") != source_clock_id for row in rows):
        raise ValueError("Environment series mixes source clocks")
    rows.sort(key=lambda row: row["source_time_us"])
    return rows


def _parquet_bytes(rows: list[dict]) -> bytes:
    import pandas as pd

    buffer = io.BytesIO()
    pd.DataFrame(rows).to_parquet(buffer, index=False, engine="pyarrow")
    return buffer.getvalue()


def materialize_environment_artifact(db: Session, artifact_id: UUID) -> EnvironmentArtifact:
    artifact = db.query(EnvironmentArtifact).filter(EnvironmentArtifact.id == artifact_id).one()
    if artifact.status == "ready" and artifact.derived_uri:
        return artifact
    try:
        raw = storage_service.download_bytes(storage_service.key_from_uri(artifact.raw_uri))
        if hashlib.sha256(raw).hexdigest() != artifact.raw_checksum_sha256:
            raise ValueError("Environment raw checksum mismatch")
        rows = normalize_environment_rows(raw, artifact.source_clock_id)
        derived = _parquet_bytes(rows)
        checksum = hashlib.sha256(derived).hexdigest()
        key = f"context/{artifact.session_id}/{artifact.id}/normalized.parquet"
        storage_service.s3.put_object(
            Bucket=storage_service.bucket_name,
            Key=key,
            Body=derived,
            ContentType="application/vnd.apache.parquet",
        )
        artifact.derived_uri = f"s3://{storage_service.bucket_name}/{key}"
        artifact.derived_checksum_sha256 = checksum
        artifact.status = "ready"
        artifact.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(artifact)
        return artifact
    except Exception as error:
        db.rollback()
        artifact = db.query(EnvironmentArtifact).filter(EnvironmentArtifact.id == artifact_id).one()
        artifact.status = "failed"
        artifact.error_message = str(error)
        db.commit()
        raise
