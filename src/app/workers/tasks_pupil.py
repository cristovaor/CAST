from uuid import UUID

from app.db.session import SessionLocal
from app.domains.pupil.service import materialize_pupil_run
from app.workers.celery_app import celery_app


@celery_app.task(bind=True)
def process_pupil_run_task(self, run_id: str):
    db = SessionLocal()
    try:
        run = materialize_pupil_run(db, UUID(run_id))
        return {"run_id": run_id, "status": run.status, "verdict": run.verdict}
    finally:
        db.close()
