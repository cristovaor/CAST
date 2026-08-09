"""Thin task adapter for environment-series materialization."""
from uuid import UUID

from app.db.session import SessionLocal
from app.domains.context.materialization import materialize_environment_artifact
from app.workers.celery_app import celery_app


@celery_app.task(bind=True)
def materialize_environment_task(self, artifact_id: str):
    db = SessionLocal()
    try:
        artifact = materialize_environment_artifact(db, UUID(artifact_id))
        return {"artifact_id": str(artifact.id), "status": artifact.status}
    finally:
        db.close()
