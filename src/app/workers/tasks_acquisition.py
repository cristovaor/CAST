"""Thin Celery adapters for live acquisition finalization."""

from uuid import UUID

from app.db.session import SessionLocal
from app.domains.acquisition.finalization import (
    finalize_capture,
    mark_finalization_failed,
)
from app.workers.celery_app import celery_app


@celery_app.task(bind=True)
def finalize_capture_task(self, capture_id: str, job_id: str):
    db = SessionLocal()
    try:
        video, landmark_job, reused = finalize_capture(
            db, capture_id=UUID(capture_id), job_id=UUID(job_id)
        )
        if not reused:
            from app.workers.tasks_video import extract_landmarks_task

            extract_landmarks_task.delay(str(landmark_job.id))
        return {
            "video_asset_id": str(video.id),
            "landmark_job_id": (
                str(landmark_job.id) if landmark_job is not None else None
            ),
            "reused": reused,
        }
    except Exception as error:
        mark_finalization_failed(
            db,
            capture_id=UUID(capture_id),
            job_id=UUID(job_id),
            error=error,
        )
        raise
    finally:
        db.close()
