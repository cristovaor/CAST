"""Celery task for EEG parsing & quality assessment.

Pipeline (docs §10):
    1. Download the EEG file from storage
    2. Parse metadata + per-channel quality (MNE when available, else CSV)
    3. Persist the enriched metadata and quality report on the EEGAsset

Operates directly on the EEGAsset (no ProcessingJob row, which is video-bound).
"""
from __future__ import annotations

import logging
from datetime import datetime

from celery.utils.log import get_task_logger

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import EEGAsset, QualityVerdict
from app.services.storage_service import storage_service
from app.services.eeg_service import parse_eeg, format_from_filename

logger = get_task_logger(__name__)


def _apply_report(eeg: EEGAsset, report: dict) -> None:
    """Copies parsed fields onto the EEGAsset (only overwriting when present)."""
    eeg.eeg_format = report.get("eeg_format") or eeg.eeg_format or format_from_filename(eeg.filename)
    if report.get("device"):
        eeg.device = report["device"]
    if report.get("channel_count") is not None:
        eeg.channel_count = report["channel_count"]
    if report.get("channel_names"):
        eeg.channel_names = report["channel_names"]
    if report.get("sample_rate_hz") is not None:
        eeg.sample_rate_hz = report["sample_rate_hz"]
    if report.get("duration_seconds") is not None:
        eeg.duration_seconds = report["duration_seconds"]
    if report.get("units"):
        eeg.units = report["units"]
    if report.get("event_count") is not None:
        eeg.event_count = report["event_count"]
    eeg.valid_ratio = report.get("valid_ratio")
    eeg.channel_quality = report.get("channel_quality", [])
    eeg.quality_findings = report.get("quality_findings", [])
    eeg.quality_criteria = report.get("quality_criteria", [])
    verdict = report.get("quality_verdict")
    if verdict:
        eeg.quality_verdict = QualityVerdict(verdict)


def parse_eeg_asset(eeg_id: str) -> dict:
    """Synchronous core so both the Celery task and a fallback path can call it."""
    db = SessionLocal()
    try:
        eeg = db.query(EEGAsset).filter(EEGAsset.id == eeg_id).first()
        if not eeg:
            return {"error": "EEG asset not found"}
        if not eeg.storage_uri:
            return {"error": "EEG asset has no storage_uri"}

        key = storage_service.key_from_uri(eeg.storage_uri)
        data = storage_service.download_bytes(key)

        report = parse_eeg(data, eeg.filename or "recording.csv")
        _apply_report(eeg, report)
        db.commit()

        from app.services.session_state_service import refresh_session_state
        refresh_session_state(db, eeg.session_id)

        return {
            "eeg_asset_id": str(eeg_id),
            "parser": report.get("parser"),
            "channel_count": eeg.channel_count,
            "valid_ratio": eeg.valid_ratio,
            "quality_verdict": eeg.quality_verdict.value if eeg.quality_verdict else None,
        }
    except Exception as e:
        logger.error(f"Error parsing EEG {eeg_id}: {e}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def parse_eeg_task(self, eeg_id: str):
    """Async EEG parse & quality assessment."""
    started = datetime.utcnow()
    result = parse_eeg_asset(eeg_id)
    result["elapsed_ms"] = (datetime.utcnow() - started).total_seconds() * 1000
    return result
