"""Load versioned EEG temporal features for multimodal ML consumers."""
from __future__ import annotations

import io
import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import EEGAnalysisArtifact, EEGAnalysisRun, EEGAsset
from app.services.storage_service import storage_service
from app.services.sync_transform_service import approved_mapping


@dataclass(frozen=True)
class SessionEEGFeatures:
    rows: list[dict[str, Any]]
    mapping: dict[str, Any]
    eeg_asset_id: str | None
    analysis_run_id: str | None
    valid_ratio: float | None
    status: str


def _artifact_payload(artifact: EEGAnalysisArtifact) -> bytes:
    return storage_service.download_bytes(
        storage_service.key_from_uri(artifact.storage_uri)
    )


def load_session_eeg_features(
    db: Session,
    session_id: UUID,
) -> SessionEEGFeatures:
    """Return the latest successful EEG time-series plus approved alignment."""
    mapping = approved_mapping(db, session_id)
    asset = db.query(EEGAsset).filter(EEGAsset.session_id == session_id).first()
    if asset is None:
        return SessionEEGFeatures(
            rows=[],
            mapping=mapping,
            eeg_asset_id=None,
            analysis_run_id=None,
            valid_ratio=None,
            status="eeg_missing",
        )
    run = (
        db.query(EEGAnalysisRun)
        .filter(
            EEGAnalysisRun.eeg_asset_id == asset.id,
            EEGAnalysisRun.status.in_(("succeeded", "partial")),
        )
        .order_by(EEGAnalysisRun.finished_at.desc().nullslast())
        .first()
    )
    if run is None:
        return SessionEEGFeatures(
            rows=[],
            mapping=mapping,
            eeg_asset_id=str(asset.id),
            analysis_run_id=None,
            valid_ratio=asset.valid_ratio,
            status="analysis_missing",
        )
    artifact = (
        db.query(EEGAnalysisArtifact)
        .filter(
            EEGAnalysisArtifact.run_id == run.id,
            EEGAnalysisArtifact.kind == "timeseries-csv",
        )
        .order_by(EEGAnalysisArtifact.created_at.desc())
        .first()
    )
    rows: list[dict[str, Any]] = []
    if artifact is not None:
        rows = pd.read_csv(io.BytesIO(_artifact_payload(artifact))).to_dict(
            orient="records"
        )
    else:
        artifact = (
            db.query(EEGAnalysisArtifact)
            .filter(
                EEGAnalysisArtifact.run_id == run.id,
                EEGAnalysisArtifact.kind == "timeseries-index",
            )
            .order_by(EEGAnalysisArtifact.created_at.desc())
            .first()
        )
        if artifact is not None:
            payload = json.loads(_artifact_payload(artifact).decode("utf-8"))
            rows = list(payload.get("preview") or [])
    if not rows:
        status = "timeseries_missing"
    elif not mapping.get("approved"):
        status = "sync_unapproved"
    else:
        status = "ready"
    return SessionEEGFeatures(
        rows=rows,
        mapping=mapping,
        eeg_asset_id=str(asset.id),
        analysis_run_id=str(run.id),
        valid_ratio=asset.valid_ratio,
        status=status,
    )
