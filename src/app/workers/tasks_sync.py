"""Celery task for automatic synchronization detection (docs §11).

Correlates facial-event density (video) with EEG activity envelope to propose
an offset + confidence. Always lands the Synchronization in `auto_available` —
never auto-approved; the researcher reviews and decides via
POST /sync/{session_id}/decision.
"""
from __future__ import annotations

import logging
from datetime import datetime

from celery.utils.log import get_task_logger

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import (
    Session as SessionModel, VideoAsset, EEGAsset, Synchronization, SyncState,
)
from app.services.storage_service import storage_service
from app.services.sync_detection_service import propose_sync

logger = get_task_logger(__name__)


def _read_eeg_rows(eeg_asset: EEGAsset) -> list[dict]:
    key = storage_service.key_from_uri(eeg_asset.storage_uri)
    data = storage_service.download_bytes(key)
    # Native CSV row reader (kept independent of the mne path — detection only
    # needs raw sample values, not full channel metadata).
    import csv, io
    text = data.decode("utf-8", errors="replace")
    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        parsed = {}
        for k, v in row.items():
            try:
                parsed[k] = float(v)
            except (ValueError, TypeError):
                parsed[k] = v
        rows.append(parsed)
    return rows


def detect_sync(session_id: str) -> dict:
    """Synchronous core: load events + EEG, propose offset, persist as auto_available."""
    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            return {"error": "Session not found"}

        video = db.query(VideoAsset).filter(VideoAsset.session_id == session_id).first()
        eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session_id).first()
        if not video or not eeg:
            return {"error": "Session needs both video and EEG to auto-detect sync"}

        from app.api.v1.routes_videos import load_timeline_events
        events, _ = load_timeline_events(video, db)

        try:
            rows = _read_eeg_rows(eeg)
        except Exception as e:
            return {"error": f"Failed to read EEG for sync detection: {e}"}

        duration_ms = float(video.duration_seconds or 0) * 1000 or (
            (rows[-1]["timestamp_ms"] - rows[0]["timestamp_ms"]) if len(rows) > 1 else 0
        )
        proposal = propose_sync(events, rows, duration_ms)

        sync = db.query(Synchronization).filter(Synchronization.session_id == session_id).first()
        if not sync:
            sync = Synchronization(session_id=session_id)
            db.add(sync)

        sync.method = "event_correlation"
        sync.offset_ms = proposal["offset_ms"]
        sync.confidence = proposal["confidence"]
        sync.state = SyncState.auto_available
        history = list(sync.history or [])
        history.append({
            "at": datetime.utcnow().isoformat(),
            "action": "Detecção automática de sincronização",
            "note": proposal.get("note"),
        })
        sync.history = history
        db.commit()

        from app.services.session_state_service import refresh_session_state
        refresh_session_state(db, session_id)

        return {"session_id": str(session_id), **proposal}
    except Exception as e:
        logger.error(f"Error detecting sync for session {session_id}: {e}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def detect_sync_task(self, session_id: str):
    started = datetime.utcnow()
    result = detect_sync(session_id)
    result["elapsed_ms"] = (datetime.utcnow() - started).total_seconds() * 1000
    return result
