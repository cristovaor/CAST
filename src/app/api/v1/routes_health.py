from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import os
import redis

from app.api.deps import get_db
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
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        r = redis.Redis.from_url(redis_url, socket_timeout=1)
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
