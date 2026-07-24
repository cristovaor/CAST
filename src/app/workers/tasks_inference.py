from celery.utils.log import get_task_logger
import pandas as pd
from uuid import UUID

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import ProcessingJob, JobStatus, VideoAsset, Prediction
from app.services.storage_service import storage_service
import json

logger = get_task_logger(__name__)

@celery_app.task(bind=True)
def run_inference_task(self, job_id: str):
    db = SessionLocal()
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        db.close()
        return "Job not found"
        
    try:
        job.status = JobStatus.running
        db.commit()
        
        import numpy as np
        data = np.random.rand(100, 478*3)
        cols = [f"lm_{i}_{axis}" for i in range(478) for axis in ['x', 'y', 'z']]
        df = pd.DataFrame(data, columns=cols)
        
        model_name = "OLHO_FECHADO"
        preds = {"status": "mock", "frame_predictions": [0, 1, 1, 0]}
        summary = {"event_count": 1, "avg_confidence": 0.95}
        
        preds_json = json.dumps(preds).encode('utf-8')
        prediction_uri = f"{job.video_asset.session_id}/preds_{model_name}.json"
        storage_service.upload_bytes(prediction_uri, preds_json, "application/json")
        
        pred_record = Prediction(
            video_asset_id=job.video_asset.id,
            prediction_uri=f"s3://{storage_service.bucket_name}/{prediction_uri}",
            threshold=0.5,
            summary={model_name: summary}
        )
        db.add(pred_record)
        
        job.status = JobStatus.succeeded
        job.progress = 100.0
        db.commit()
        
        return {"summary": summary}
        
    except Exception as e:
        job.status = JobStatus.failed
        job.error_message = str(e)
        db.commit()
        logger.error(f"Error inferring video {job_id}: {str(e)}")
        raise e
    finally:
        db.close()
