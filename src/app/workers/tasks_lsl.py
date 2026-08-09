from uuid import UUID

from app.db.session import SessionLocal
from app.domains.lsl.materialization import materialize_lsl_recording
from app.workers.celery_app import celery_app


@celery_app.task(bind=True)
def materialize_lsl_recording_task(self, recording_id: str):
    db = SessionLocal()
    try:
        recording = materialize_lsl_recording(db, UUID(recording_id))
        from app.workers.tasks_eeg import parse_eeg_task
        parse_eeg_task.delay(str(recording.eeg_asset_id))
        return {"recording_id": recording_id, "eeg_asset_id": str(recording.eeg_asset_id)}
    finally:
        db.close()
