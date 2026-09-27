from uuid import UUID

from app.db.session import SessionLocal
from app.domains.lsl.materialization import materialize_lsl_recording
from app.workers.celery_app import celery_app


@celery_app.task(bind=True)
def materialize_lsl_recording_task(self, recording_id: str):
    db = SessionLocal()
    try:
        recording = materialize_lsl_recording(db, UUID(recording_id))
        # XDF materialization already extracts metadata and vectorized quality
        # before writing the chunked CSV. Re-parsing that large derived CSV
        # would duplicate memory and can exhaust the single EEG worker.
        return {"recording_id": recording_id, "eeg_asset_id": str(recording.eeg_asset_id)}
    finally:
        db.close()
