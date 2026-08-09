"""Thin task adapter for reproducible Explorer interval bundles."""
import hashlib
import json
from datetime import datetime
from uuid import UUID

from app.db.models import Session as SessionModel
from app.db.session import SessionLocal
from app.domains.explorer.service import build_explorer_manifest
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app


@celery_app.task(bind=True)
def export_explorer_interval_task(self, session_id: str, start_time_us: int, end_time_us: int, track_ids: list[str], export_format: str):
    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.id == UUID(session_id)).one()
        manifest = build_explorer_manifest(db, session)
        selected = [track.model_dump(mode="json") for track in manifest.tracks if not track_ids or track.id in track_ids]
        bundle = {
            "schema_version": "cast-explorer-interval-v1", "session_id": session_id,
            "start_time_us": start_time_us, "end_time_us": end_time_us,
            "format": export_format, "tracks": selected, "warnings": manifest.warnings,
            "generated_at": datetime.utcnow().isoformat(),
            "note": "Track samples remain modality-owned; URLs are range-bounded templates with provenance.",
        }
        canonical = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
        checksum = hashlib.sha256(canonical).hexdigest(); bundle["checksum_sha256"] = checksum
        encoded = json.dumps(bundle, ensure_ascii=False, indent=2).encode()
        key = f"explorer-exports/{session_id}/{self.request.id}.json"
        if not storage_service.upload_bytes(key, encoded, "application/json"):
            raise IOError("could not store Explorer export")
        return {"object_key": key, "checksum_sha256": checksum, "track_count": len(selected)}
    finally:
        db.close()
