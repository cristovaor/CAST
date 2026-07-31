import os
from celery import Celery

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "cast_worker",
    broker=redis_url,
    backend=redis_url,
    include=[
        "app.workers.tasks_video", "app.workers.tasks_inference",
        "app.workers.tasks_eeg", "app.workers.tasks_dataset", "app.workers.tasks_sync",
        "app.workers.tasks_train", "app.workers.tasks_model_testing",
        "app.workers.tasks_reports",
        "app.workers.tasks_eeg_analysis",
    ]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.workers.tasks_eeg.*": {"queue": "eeg"},
        "app.workers.tasks_eeg_analysis.*": {"queue": "eeg"},
    },
    task_track_started=True,
    worker_prefetch_multiplier=1,
)
