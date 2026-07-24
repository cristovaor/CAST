import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.db.session import SessionLocal
from app.db.models import (
    AnnotationEvent as EventModel,
    AnnotationTask as TaskModel,
    AnnotationTaskStatus,
    AuditAction,
    AuditLog,
    Prediction,
    PredictionReview,
    User,
    UserRole,
)
from app.api.ownership import (
    annotation_tasks_for_user,
    get_annotation_event,
    get_annotation_task,
    get_video,
)

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
    action: Optional[str] = None
    start_frame: Optional[int] = None
    end_frame: Optional[int] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None

class TaskCreate(BaseModel):
    video_id: UUID
    assignee_id: UUID

@router.post("/", status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_video(db, current_user, payload.video_id)
    assignee = (
        db.query(User)
        .filter(
            User.id == payload.assignee_id,
            User.organization_id == current_user.organization_id,
        )
        .first()
    )
    if assignee is None:
        raise HTTPException(status_code=404, detail="Assignee not found")
    task = TaskModel(video_asset_id=payload.video_id, assignee_id=payload.assignee_id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"task_id": task.id}

@router.get("/")
def get_tasks(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scoped_ids = annotation_tasks_for_user(db, current_user).with_entities(TaskModel.id)
    tasks = (
        db.query(TaskModel, User.name.label("assignee_name"))
        .outerjoin(User, TaskModel.assignee_id == User.id)
        .filter(TaskModel.id.in_(scoped_ids))
        .order_by(TaskModel.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [
        {
            "id": task.id,
            "video_id": task.video_asset_id,
            "assignee_id": task.assignee_id,
            "assignee_name": assignee_name or "Unknown",
            "status": task.status.value,
            "created_at": task.created_at.isoformat() if task.created_at else None
        }
        for task, assignee_name in tasks
    ]

@router.get("/{task_id}")
def get_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_annotation_task(db, current_user, task_id)
    events = [{"id": e.id, "action": e.action, "start_time": e.start_time, "end_time": e.end_time} for e in task.events]
    return {
        "id": task.id,
        "video_id": task.video_asset_id,
        "status": task.status.value,
        "events": events
    }

@router.post("/{task_id}/events", status_code=201)
def create_event(
    task_id: UUID,
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_annotation_task(db, current_user, task_id)
        
    event = EventModel(
        task_id=task_id,
        annotator_id=current_user.id,
        **payload.model_dump(),
    )
    db.add(event)
    
    if task.status == AnnotationTaskStatus.pending:
        task.status = AnnotationTaskStatus.in_progress
        
    db.commit()
    db.refresh(event)
    return {"event_id": event.id}

@annotation_events_router.patch("/annotation-events/{event_id}")
def update_event(
    event_id: UUID,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = get_annotation_event(db, current_user, event_id)
        
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)
        
    db.commit()
    return {"message": "Event updated"}


class VideoAnnotationCreate(BaseModel):
    kind: str = "interval"
    actionCode: Optional[str] = None
    actionLabel: Optional[str] = None
    taskId: Optional[UUID] = None
    microActionType: Optional[str] = None
    startFrame: int
    endFrame: int
    startTime: Optional[float] = None
    endTime: Optional[float] = None
    confidence: Optional[float] = None
    notes: Optional[str] = None


class VideoAnnotationUpdate(BaseModel):
    kind: Optional[str] = None
    actionCode: Optional[str] = None
    actionLabel: Optional[str] = None
    microActionType: Optional[str] = None
    startTime: Optional[float] = None
    endTime: Optional[float] = None
    startFrame: Optional[int] = None
    endFrame: Optional[int] = None
    notes: Optional[str] = None


def _video_event_response(event: EventModel, video_id: UUID) -> dict:
    return {
        "id": str(event.id),
        "videoId": str(video_id),
        "taskId": str(event.task_id),
        "kind": event.kind,
        "source": event.source,
        "actionCode": event.action,
        "actionLabel": event.action_label or event.action,
        # Temporary compatibility alias. New clients should use actionCode.
        "microActionType": event.action,
        "startTime": event.start_time,
        "endTime": event.end_time,
        "startFrame": event.start_frame,
        "endFrame": event.end_frame,
        "confidence": event.confidence,
        "annotatorId": str(event.annotator_id or event.task.assignee_id),
        "notes": event.notes,
        "createdAt": event.created_at.isoformat() if event.created_at else "",
        "updatedAt": event.updated_at.isoformat() if event.updated_at else "",
    }


def _task_for_video(
    db: Session,
    current_user: User,
    video_id: UUID,
    task_id: UUID | None = None,
    *,
    create: bool = False,
) -> TaskModel | None:
    if task_id is not None:
        task = get_annotation_task(db, current_user, task_id)
        if task.video_asset_id != video_id:
            raise HTTPException(status_code=404, detail="Annotation task not found")
        if (
            current_user.role == UserRole.annotator
            and task.assignee_id != current_user.id
        ):
            raise HTTPException(status_code=403, detail="Task belongs to another annotator")
        return task
    task = (
        db.query(TaskModel)
        .filter(
            TaskModel.video_asset_id == video_id,
            TaskModel.assignee_id == current_user.id,
        )
        .order_by(TaskModel.created_at.desc())
        .first()
    )
    if task is None and create:
        task = TaskModel(
            video_asset_id=video_id,
            assignee_id=current_user.id,
            status=AnnotationTaskStatus.in_progress,
        )
        db.add(task)
        db.flush()
    return task


def _validate_frames(kind: str, start_frame: int, end_frame: int) -> None:
    if kind not in {"interval", "point"}:
        raise HTTPException(status_code=422, detail="kind must be interval or point")
    if start_frame < 0 or end_frame < 0:
        raise HTTPException(status_code=422, detail="frames must be non-negative")
    if kind == "point" and start_frame != end_frame:
        raise HTTPException(
            status_code=422,
            detail="point annotations require identical startFrame and endFrame",
        )
    if kind == "interval" and end_frame < start_frame:
        raise HTTPException(
            status_code=422,
            detail="interval annotations require endFrame >= startFrame",
        )


def _canonical_times(
    video,
    start_frame: int,
    end_frame: int,
    start_time: float | None,
    end_time: float | None,
) -> tuple[float, float]:
    fps = float(video.fps or 30.0)
    derived_start = start_frame / fps
    derived_end = end_frame / fps
    tolerance = max(0.002, 0.5 / fps)
    if start_time is not None and abs(start_time - derived_start) > tolerance:
        raise HTTPException(
            status_code=422,
            detail="startTime is inconsistent with startFrame and video FPS",
        )
    if end_time is not None and abs(end_time - derived_end) > tolerance:
        raise HTTPException(
            status_code=422,
            detail="endTime is inconsistent with endFrame and video FPS",
        )
    return derived_start, derived_end


def _audit_change(
    db: Session,
    current_user: User,
    action: AuditAction,
    entity_type: str,
    entity_id,
    detail: dict,
) -> None:
    db.add(
        AuditLog(
            organization_id=current_user.organization_id,
            action=action,
            actor_id=current_user.id,
            actor_label=current_user.email,
            entity_type=entity_type,
            entity_id=str(entity_id),
            detail=detail,
        )
    )


@annotation_events_router.get("/videos/{video_id}/annotations")
def list_video_annotations(
    video_id: UUID,
    task_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_video(db, current_user, video_id)
    task = _task_for_video(db, current_user, video_id, task_id)
    if task is None:
        return []
    events = (
        db.query(EventModel)
        .filter(EventModel.task_id == task.id)
        .order_by(EventModel.start_time, EventModel.start_frame)
        .all()
    )
    return [_video_event_response(event, video_id) for event in events]


@annotation_events_router.post("/videos/{video_id}/annotations", status_code=201)
def create_video_annotation(
    video_id: UUID,
    payload: VideoAnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = get_video(db, current_user, video_id)
    task = _task_for_video(
        db,
        current_user,
        video_id,
        payload.taskId,
        create=True,
    )
    assert task is not None
    if task.status == AnnotationTaskStatus.pending:
        task.status = AnnotationTaskStatus.in_progress
    action_code = payload.actionCode or payload.microActionType
    if not action_code:
        raise HTTPException(status_code=422, detail="actionCode is required")
    _validate_frames(payload.kind, payload.startFrame, payload.endFrame)
    start_time, end_time = _canonical_times(
        video,
        payload.startFrame,
        payload.endFrame,
        payload.startTime,
        payload.endTime,
    )
    event = EventModel(
        task_id=task.id,
        action=action_code,
        action_label=payload.actionLabel or action_code,
        kind=payload.kind,
        source="manual",
        start_time=start_time,
        end_time=end_time,
        start_frame=payload.startFrame,
        end_frame=payload.endFrame,
        confidence=payload.confidence,
        notes=payload.notes,
        annotator_id=current_user.id,
    )
    db.add(event)
    db.flush()
    _audit_change(
        db,
        current_user,
        AuditAction.create,
        "annotation_event",
        event.id,
        {"video_id": str(video_id), "task_id": str(task.id)},
    )
    db.commit()
    db.refresh(event)
    return _video_event_response(event, video_id)


@annotation_events_router.put("/videos/{video_id}/annotations/{event_id}")
def update_video_annotation(
    video_id: UUID,
    event_id: UUID,
    payload: VideoAnnotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = get_video(db, current_user, video_id)
    event = get_annotation_event(db, current_user, event_id)
    if event.task.video_asset_id != video_id:
        raise HTTPException(status_code=404, detail="Annotation event not found")
    update = payload.model_dump(exclude_unset=True)
    action_code = update.pop("actionCode", None) or update.pop(
        "microActionType",
        None,
    )
    if action_code is not None:
        event.action = action_code
    if "actionLabel" in update:
        event.action_label = update.pop("actionLabel")
    kind = update.pop("kind", event.kind)
    start_frame = update.pop("startFrame", event.start_frame)
    end_frame = update.pop("endFrame", event.end_frame)
    start_time_input = update.pop("startTime", None)
    end_time_input = update.pop("endTime", None)
    _validate_frames(kind, start_frame, end_frame)
    start_time, end_time = _canonical_times(
        video,
        start_frame,
        end_frame,
        start_time_input,
        end_time_input,
    )
    event.kind = kind
    event.start_frame = start_frame
    event.end_frame = end_frame
    event.start_time = start_time
    event.end_time = end_time
    if "notes" in update:
        event.notes = update["notes"]
    event.updated_at = datetime.utcnow()
    _audit_change(
        db,
        current_user,
        AuditAction.update,
        "annotation_event",
        event.id,
        {"video_id": str(video_id)},
    )
    db.commit()
    db.refresh(event)
    return _video_event_response(event, video_id)


@annotation_events_router.delete(
    "/videos/{video_id}/annotations/{event_id}",
    status_code=204,
)
def delete_video_annotation(
    video_id: UUID,
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_video(db, current_user, video_id)
    event = get_annotation_event(db, current_user, event_id)
    if event.task.video_asset_id != video_id:
        raise HTTPException(status_code=404, detail="Annotation event not found")
    _audit_change(
        db,
        current_user,
        AuditAction.delete,
        "annotation_event",
        event.id,
        {"video_id": str(video_id)},
    )
    db.delete(event)
    db.commit()
    return None


def _model_event_key(
    prediction_id: UUID,
    action: str,
    start_frame: int,
    end_frame: int,
) -> str:
    value = f"{prediction_id}:{action}:{start_frame}:{end_frame}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _load_prediction_events(prediction: Prediction) -> tuple[list[dict], str | None]:
    if not prediction.prediction_uri:
        return [], None
    from app.services.storage_service import storage_service

    payload = json.loads(
        storage_service.download_bytes(
            storage_service.key_from_uri(prediction.prediction_uri)
        )
    )
    events = []
    for action in payload.get("actions", []):
        for item in action.get("events", []):
            events.append(
                {
                    "modelEventKey": _model_event_key(
                        prediction.id,
                        action["action"],
                        int(item["start_frame"]),
                        int(item["end_frame"]),
                    ),
                    "actionCode": action["action"],
                    "startFrame": int(item["start_frame"]),
                    "endFrame": int(item["end_frame"]),
                    "startTime": float(item.get("start_ms", 0)) / 1000.0,
                    "endTime": float(item.get("end_ms", 0)) / 1000.0,
                    "confidence": float(item.get("avg_confidence", 0)),
                }
            )
    return events, payload.get("model_version")


@annotation_events_router.get("/videos/{video_id}/annotation-suggestions")
def list_annotation_suggestions(
    video_id: UUID,
    task_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_video(db, current_user, video_id)
    task = _task_for_video(db, current_user, video_id, task_id)
    prediction = (
        db.query(Prediction)
        .filter(Prediction.video_asset_id == video_id)
        .order_by(Prediction.created_at.desc())
        .first()
    )
    if prediction is None:
        return {"predictionId": None, "modelVersion": None, "suggestions": []}
    events, model_version = _load_prediction_events(prediction)
    reviews = {}
    if task is not None:
        reviews = {
            review.model_event_key: review
            for review in db.query(PredictionReview)
            .filter(
                PredictionReview.task_id == task.id,
                PredictionReview.prediction_id == prediction.id,
            )
            .all()
        }
    for event in events:
        review = reviews.get(event["modelEventKey"])
        event["review"] = (
            {
                "id": str(review.id),
                "decision": review.decision,
                "annotationEventId": (
                    str(review.annotation_event_id)
                    if review.annotation_event_id
                    else None
                ),
                "reviewedAt": review.reviewed_at.isoformat(),
            }
            if review
            else None
        )
        event["modelVersion"] = model_version
    return {
        "predictionId": str(prediction.id),
        "modelVersion": model_version,
        "suggestions": events,
    }


class SuggestionReviewCreate(BaseModel):
    predictionId: UUID
    decision: str
    taskId: Optional[UUID] = None
    correction: Optional[VideoAnnotationCreate] = None


@annotation_events_router.post(
    "/videos/{video_id}/annotation-suggestions/{model_event_key}/review",
)
def review_annotation_suggestion(
    video_id: UUID,
    model_event_key: str,
    payload: SuggestionReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = get_video(db, current_user, video_id)
    if payload.decision not in {"accepted", "corrected", "rejected"}:
        raise HTTPException(status_code=422, detail="Invalid review decision")
    prediction = (
        db.query(Prediction)
        .filter(
            Prediction.id == payload.predictionId,
            Prediction.video_asset_id == video_id,
        )
        .first()
    )
    if prediction is None:
        raise HTTPException(status_code=404, detail="Prediction not found")
    task = _task_for_video(
        db,
        current_user,
        video_id,
        payload.taskId,
        create=True,
    )
    assert task is not None
    existing = (
        db.query(PredictionReview)
        .filter(
            PredictionReview.task_id == task.id,
            PredictionReview.prediction_id == prediction.id,
            PredictionReview.model_event_key == model_event_key,
        )
        .first()
    )
    if existing is not None:
        return {
            "id": str(existing.id),
            "decision": existing.decision,
            "annotationEventId": (
                str(existing.annotation_event_id)
                if existing.annotation_event_id
                else None
            ),
            "idempotent": True,
        }
    suggestions, _ = _load_prediction_events(prediction)
    original = next(
        (
            suggestion
            for suggestion in suggestions
            if suggestion["modelEventKey"] == model_event_key
        ),
        None,
    )
    if original is None:
        raise HTTPException(status_code=404, detail="Model event not found")

    annotation = None
    if payload.decision != "rejected":
        correction = payload.correction
        if payload.decision == "corrected" and correction is None:
            raise HTTPException(
                status_code=422,
                detail="correction is required when decision is corrected",
            )
        kind = correction.kind if correction else "interval"
        action_code = (
            (correction.actionCode or correction.microActionType)
            if correction
            else original["actionCode"]
        )
        if not action_code:
            raise HTTPException(status_code=422, detail="actionCode is required")
        start_frame = correction.startFrame if correction else original["startFrame"]
        end_frame = correction.endFrame if correction else original["endFrame"]
        _validate_frames(kind, start_frame, end_frame)
        start_time, end_time = _canonical_times(
            video,
            start_frame,
            end_frame,
            correction.startTime if correction else None,
            correction.endTime if correction else None,
        )
        annotation = EventModel(
            task_id=task.id,
            action=action_code,
            action_label=(
                correction.actionLabel if correction else original["actionCode"]
            ),
            kind=kind,
            source="model_review",
            start_frame=start_frame,
            end_frame=end_frame,
            start_time=start_time,
            end_time=end_time,
            confidence=original["confidence"],
            notes=correction.notes if correction else None,
            annotator_id=current_user.id,
        )
        db.add(annotation)
        db.flush()

    review = PredictionReview(
        task_id=task.id,
        prediction_id=prediction.id,
        model_event_key=model_event_key,
        decision=payload.decision,
        original_event=original,
        annotation_event_id=annotation.id if annotation else None,
        reviewer_id=current_user.id,
    )
    db.add(review)
    db.flush()
    _audit_change(
        db,
        current_user,
        AuditAction.update,
        "prediction_review",
        review.id,
        {
            "video_id": str(video_id),
            "decision": payload.decision,
            "model_event_key": model_event_key,
        },
    )
    db.commit()
    return {
        "id": str(review.id),
        "decision": review.decision,
        "annotationEventId": str(annotation.id) if annotation else None,
        "idempotent": False,
    }

@router.post("/{task_id}/submit")
def submit_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_annotation_task(db, current_user, task_id)
    task.status = AnnotationTaskStatus.submitted
    db.commit()
    return {"message": "Task submitted"}

@router.post("/{task_id}/review")
def review_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_annotation_task(db, current_user, task_id)
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
    event = get_annotation_event(db, current_user, annotation_id)

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
        db, "annotation_event", annotation_id, actor=current_user,
        detail={"op": "correct_and_export", "storage_key": object_key},
    )

    return {
        "message": "Correction applied and exported for active learning",
        "data": export_data,
        "storage_uri": f"s3://{storage_service.bucket_name}/{object_key}",
    }
