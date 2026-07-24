from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from pydantic import BaseModel
from datetime import datetime

from app.db.session import SessionLocal
from app.db.models import AnnotationTask as TaskModel, AnnotationEvent as EventModel, AnnotationTaskStatus, User

router = APIRouter(prefix="/annotation-tasks", tags=["annotations"])
# Separate router for paths that don't share the /annotation-tasks prefix
# (previously registered with literal ".." path segments, which FastAPI/ASGI
# does not normalize — those routes never actually matched real requests).
annotation_events_router = APIRouter(tags=["annotations"])

from app.api.deps import get_db, get_current_user

class EventCreate(BaseModel):
    action: str
    start_frame: int
    end_frame: int
    start_time: float
    end_time: float

class EventUpdate(BaseModel):
    action: str = None
    start_frame: int = None
    end_frame: int = None

class TaskCreate(BaseModel):
    video_id: UUID
    assignee_id: UUID

@router.post("/", status_code=201)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    task = TaskModel(video_asset_id=payload.video_id, assignee_id=payload.assignee_id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"task_id": task.id}

@router.get("/")
def get_tasks(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    from app.db.models import User
    tasks = (
        db.query(TaskModel, User.name.label("assignee_name"))
        .outerjoin(User, TaskModel.assignee_id == User.id)
        .order_by(TaskModel.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [
        {
            "id": t.TaskModel.id, 
            "video_id": t.TaskModel.video_asset_id, 
            "assignee_id": t.TaskModel.assignee_id, 
            "assignee_name": t.assignee_name or "Unknown",
            "status": t.TaskModel.status.value,
            "created_at": t.TaskModel.created_at.isoformat() if t.TaskModel.created_at else None
        } 
        for t in tasks
    ]

@router.get("/{task_id}")
def get_task(task_id: UUID, db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    events = [{"id": e.id, "action": e.action, "start_time": e.start_time, "end_time": e.end_time} for e in task.events]
    return {
        "id": task.id,
        "video_id": task.video_asset_id,
        "status": task.status.value,
        "events": events
    }

@router.post("/{task_id}/events", status_code=201)
def create_event(task_id: UUID, payload: EventCreate, db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    event = EventModel(task_id=task_id, **payload.model_dump())
    db.add(event)
    
    if task.status == AnnotationTaskStatus.pending:
        task.status = AnnotationTaskStatus.in_progress
        
    db.commit()
    db.refresh(event)
    return {"event_id": event.id}

@annotation_events_router.patch("/annotation-events/{event_id}")
def update_event(event_id: UUID, payload: EventUpdate, db: Session = Depends(get_db)):
    event = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)
        
    db.commit()
    return {"message": "Event updated"}

@router.post("/{task_id}/submit")
def submit_task(task_id: UUID, db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = AnnotationTaskStatus.submitted
    db.commit()
    return {"message": "Task submitted"}

@router.post("/{task_id}/review")
def review_task(task_id: UUID, db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = AnnotationTaskStatus.reviewed
    db.commit()
    return {"message": "Task reviewed"}

class CorrectionPayload(BaseModel):
    corrected_action: str
    corrected_start_time: float
    corrected_end_time: float

@annotation_events_router.post("/annotations/{annotation_id}/correct_and_export")
def correct_and_export(
    annotation_id: UUID,
    payload: CorrectionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Applies a human correction and exports the corrected event to the
    active-learning retrain dataset in storage (docs §15, §21)."""
    event = db.query(EventModel).filter(EventModel.id == annotation_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Annotation event not found")

    event.action = payload.corrected_action
    event.start_time = payload.corrected_start_time
    event.end_time = payload.corrected_end_time
    db.commit()
    db.refresh(event)

    import json
    from datetime import datetime as _dt
    from app.services.storage_service import storage_service

    export_data = {
        "event_id": str(event.id),
        "task_id": str(event.task_id),
        "action": event.action,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "is_corrected": True,
        "corrected_by": current_user.email,
        "corrected_at": _dt.utcnow().isoformat(),
    }

    object_key = f"retrain_dataset/annotations/{event.id}.json"
    storage_service.upload_bytes(
        object_key,
        json.dumps(export_data, ensure_ascii=False, indent=2).encode("utf-8"),
        "application/json",
    )

    from app.api.v1.routes_governance import record_access
    record_access(
        db, "annotation_event", annotation_id, actor=current_user.email,
        detail={"op": "correct_and_export", "storage_key": object_key},
    )

    return {
        "message": "Correction applied and exported for active learning",
        "data": export_data,
        "storage_uri": f"s3://{storage_service.bucket_name}/{object_key}",
    }
