import celery
from celery.utils.log import get_task_logger
from app.services.report_service import generate_export_url
from app.db.session import SessionLocal
import uuid

logger = get_task_logger(__name__)

# Assuming there's a celery app configured somewhere. E.g., app.workers.celery_app
# If we don't have it, we just create a dummy one for the decorator or import from main
try:
    from app.workers.celery_app import celery_app
except ImportError:
    celery_app = celery.Celery("cast_worker")

@celery_app.task(bind=True, max_retries=3)
def export_study_task(self, study_id_str: str, format_type: str):
    logger.info(f"Starting export for study {study_id_str} format {format_type}")
    db = SessionLocal()
    try:
        study_uuid = uuid.UUID(study_id_str)
        url = generate_export_url(study_uuid, format_type, db)
        return url
    except Exception as exc:
        logger.error(f"Export failed: {exc}")
        raise self.retry(exc=exc, countdown=5)
    finally:
        db.close()
