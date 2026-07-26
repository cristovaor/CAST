"""Canonical approved video↔EEG time transformation."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import Synchronization


MAPPING_VERSION = "affine-v1"


def approved_mapping(db: Session, session_id: UUID) -> dict[str, Any]:
    synchronization = (
        db.query(Synchronization)
        .filter(
            Synchronization.session_id == session_id,
            Synchronization.approved_run_id.isnot(None),
        )
        .first()
    )
    if synchronization is None:
        return {
            "mapping_version": MAPPING_VERSION,
            "approved": False,
            "offset_ms": 0.0,
            "drift_ms_per_min": 0.0,
            "quality_grade": None,
            "uncertainty_ms": None,
        }
    return {
        "mapping_version": synchronization.mapping_version or MAPPING_VERSION,
        "approved": True,
        "offset_ms": float(synchronization.offset_ms or 0),
        "drift_ms_per_min": float(synchronization.drift_ms_per_min or 0),
        "quality_grade": synchronization.quality_grade,
        "uncertainty_ms": synchronization.uncertainty_ms,
        "approved_run_id": str(synchronization.approved_run_id),
    }


def video_to_eeg_ms(video_ms: float, mapping: dict[str, Any]) -> float:
    slope = 1.0 + float(mapping.get("drift_ms_per_min") or 0) / 60000.0
    return float(video_ms) * slope - float(mapping.get("offset_ms") or 0)


def eeg_to_video_ms(eeg_ms: float, mapping: dict[str, Any]) -> float:
    slope = 1.0 + float(mapping.get("drift_ms_per_min") or 0) / 60000.0
    if abs(slope) < 1e-12:
        raise ValueError("Invalid synchronization slope")
    return (float(eeg_ms) + float(mapping.get("offset_ms") or 0)) / slope
