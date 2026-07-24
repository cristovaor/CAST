from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import redis

from app.api.deps import get_db
from app.core.config import settings
from app.services.storage_service import storage_service

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/")
def health_check(db: Session = Depends(get_db)):
    health_status = {"status": "ok", "services": {}}
    
    # 1. Check PostgreSQL
    try:
        db.execute(text("SELECT 1"))
        health_status["services"]["postgres"] = "ok"
    except Exception as e:
        health_status["services"]["postgres"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
        
    # 2. Check Redis (Celery Broker)
    try:
        r = redis.Redis(host="localhost", port=6379, socket_timeout=1)
        r.ping()
        health_status["services"]["redis"] = "ok"
    except Exception as e:
        health_status["services"]["redis"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
        
    # 3. Check MinIO
    try:
        storage_service.s3.head_bucket(Bucket=storage_service.bucket_name)
        health_status["services"]["minio"] = "ok"
    except Exception as e:
        health_status["services"]["minio"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
        
    return health_status
