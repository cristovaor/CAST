from uuid import UUID

from app.db.session import SessionLocal
from app.domains.gaze.service import finalize_calibration
from app.workers.celery_app import celery_app


@celery_app.task(bind=True)
def process_gaze_calibration_task(self, calibration_id: str):
    db = SessionLocal()
    try:
        calibration = finalize_calibration(db, UUID(calibration_id))
        return {"calibration_id": calibration_id, "status": calibration.status, "verdict": calibration.verdict}
    finally:
        db.close()
