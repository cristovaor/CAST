import gzip
import hashlib
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from uuid import UUID

from app.schemas.video import VideoAssetCreate, VideoAsset
from app.db.models import (
    AnnotationEvent,
    AnnotationTask,
    EEGAsset as EEGAssetModel,
    JobStatus,
    JobType,
    LandmarkArtifact,
    Participant as ParticipantModel,
    Prediction,
    ProcessingJob,
    Project,
    Session as SessionModel,
    Study,
    User,
    UserRole,
    VideoAsset as VideoAssetModel,
)
from app.db.session import SessionLocal
from app.services.storage_service import storage_service

router = APIRouter(prefix="/videos", tags=["videos"])

from app.api.deps import get_db, get_current_user
from app.api.ownership import (
    get_participant,
    get_session,
    get_study,
    get_video as get_owned_video,
)

@router.post("/init-upload")
def init_upload(
    participant_id: UUID,
    filename: str,
    mime_type: str,
    size_bytes: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Create Session for the participant if uploading a new video
    # In a real scenario, the session might be created before.
    get_participant(db, current_user, participant_id)
    
    new_session = SessionModel(participant_id=participant_id)
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # Generate an object name
    object_name = f"{new_session.id}/{filename}"
    
    # Create VideoAsset in draft
    video_asset = VideoAssetModel(
        session_id=new_session.id,
        filename=filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_uri=f"s3://{storage_service.bucket_name}/{object_name}"
    )
    db.add(video_asset)
    db.commit()
    db.refresh(video_asset)

    # Generate pre-signed URL
    upload_url = storage_service.generate_presigned_upload_url(object_name)

    return {
        "video_asset_id": video_asset.id,
        "upload_url": upload_url
    }

@router.post("/upload-proxy")
async def upload_proxy(
    participant_id: UUID = Form(...),
    session_id: UUID = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    participant = get_participant(db, current_user, participant_id)

    # Attach to an existing session (from the session wizard) or create one.
    if session_id:
        session = get_session(db, current_user, session_id)
        if session.participant_id != participant.id:
            raise HTTPException(
                status_code=409,
                detail="Session does not belong to the selected participant",
            )
        if db.query(VideoAssetModel).filter(VideoAssetModel.session_id == session_id).first():
            raise HTTPException(status_code=409, detail="Session already has a video asset")
    else:
        session = SessionModel(participant_id=participant_id)
        db.add(session)
        db.commit()
        db.refresh(session)
    session_id = session.id

    object_name = f"{session_id}/{file.filename}"

    # Upload to storage
    contents = await file.read()
    storage_service.upload_bytes(object_name, contents, file.content_type)

    video_asset = VideoAssetModel(
        session_id=session_id,
        filename=file.filename,
        mime_type=file.content_type,
        size_bytes=len(contents),
        storage_uri=f"s3://{storage_service.bucket_name}/{object_name}"
    )
    db.add(video_asset)
    db.commit()
    db.refresh(video_asset)

    from app.services.session_state_service import refresh_session_state
    refresh_session_state(db, session_id)

    return {
        "video_asset_id": video_asset.id,
        "session_id": session_id,
        "message": "Video uploaded successfully"
    }

from app.workers.tasks_video import extract_landmarks_task

@router.post("/{video_id}/process")
def process_video(
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_video(db, current_user, video_id)
    active_job = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.video_asset_id == video_id,
            ProcessingJob.job_type == JobType.extract_landmarks,
            ProcessingJob.status.in_([JobStatus.queued, JobStatus.running]),
        )
        .order_by(ProcessingJob.started_at.desc())
        .first()
    )
    if active_job is not None:
        return {"job_id": active_job.id, "status": active_job.status.value}

    job = ProcessingJob(
        video_asset_id=video_id,
        job_type=JobType.extract_landmarks,
        status=JobStatus.queued,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Trigger celery task
    extract_landmarks_task.delay(str(job.id))
    
    return {"job_id": job.id, "status": "queued"}

def load_timeline_events(video_asset, db: Session):
    """Loads micro-action events for a video: model predictions plus manual
    annotations, merged into a single chronological timeline.

    Shared by the timeline endpoint and the EEG co-activation analysis so both
    read events from the same source. Returns (events, model_version).
    """
    prediction = (
        db.query(Prediction)
        .filter(Prediction.video_asset_id == video_asset.id)
        .order_by(Prediction.created_at.desc())
        .first()
    )

    events = []
    model_version = "unknown"

    if prediction and prediction.prediction_uri:
        try:
            object_key = prediction.prediction_uri.replace(f"s3://{storage_service.bucket_name}/", "")
            response = storage_service.s3.get_object(Bucket=storage_service.bucket_name, Key=object_key)
            events_payload = json.loads(response["Body"].read())

            model_version = events_payload.get("model_version", model_version)
            for act in events_payload.get("actions", []):
                for ev in act.get("events", []):
                    stable_value = (
                        f"{prediction.id}:{act['action']}:"
                        f"{ev['start_frame']}:{ev['end_frame']}"
                    )
                    events.append({
                        "event_id": hashlib.sha256(
                            stable_value.encode("utf-8")
                        ).hexdigest()[:24],
                        "action": act["action"],
                        "start_frame": ev["start_frame"],
                        "end_frame": ev["end_frame"],
                        "start_time": ev.get("start_ms", 0) / 1000.0,
                        "end_time": ev.get("end_ms", 0) / 1000.0,
                        "confidence_mean": ev.get("avg_confidence", 0.0),
                        "origin": "model",
                    })
        except Exception as e:
            print(f"Failed to load prediction JSON: {e}")

    annotation_events = (
        db.query(AnnotationEvent)
        .join(AnnotationTask, AnnotationEvent.task_id == AnnotationTask.id)
        .filter(AnnotationTask.video_asset_id == video_asset.id)
        .all()
    )
    for event in annotation_events:
        events.append({
            "event_id": str(event.id),
            "action": event.action,
            "start_frame": event.start_frame,
            "end_frame": event.end_frame,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "confidence_mean": event.confidence if event.confidence is not None else 1.0,
            "origin": "annotator" if event.source == "manual" else "model",
            "region": event.region,
            "side": event.side,
        })

    events.sort(key=lambda ev: ev["start_time"])
    return events, model_version


@router.get("/{video_id}/timeline")
def get_video_timeline(
    video_id: UUID,
    source: str = "model",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video_asset = get_owned_video(db, current_user, video_id)

    events, model_version = load_timeline_events(video_asset, db)

    return {
        "video_id": video_id,
        "fps": float(video_asset.fps) if video_asset.fps else 30.0,
        "duration_seconds": float(video_asset.duration_seconds) if video_asset.duration_seconds else 120.0,
        "model_version": model_version,
        "source": source,
        "events": events
    }


@router.get("/{video_id}/playback-url")
def get_video_playback_url(
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Presigned GET URL so the browser can stream the video directly from storage."""
    video_asset = get_owned_video(db, current_user, video_id)

    url = None
    if video_asset.storage_uri:
        object_key = video_asset.storage_uri.replace(f"s3://{storage_service.bucket_name}/", "")
        url = storage_service.generate_presigned_download_url(object_key) or None

    # Audit access to raw facial video (sensitive data, docs §21).
    from app.api.v1.routes_governance import record_access
    record_access(
        db,
        "video",
        video_id,
        actor=current_user,
        detail={"op": "playback"},
    )

    return {"video_id": video_id, "url": url}

@router.get("/{video_id}/quality-report")
def get_video_quality(
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Real quality assessment persisted by the processing worker (docs §9).

    Returns the actual report once the video has been processed; before that,
    it reports `assessed: false` rather than fabricating numbers.
    """
    video_asset = get_owned_video(db, current_user, video_id)

    report = video_asset.quality_report or {}
    return {
        "video_id": video_id,
        "assessed": bool(video_asset.quality_verdict),
        "verdict": video_asset.quality_verdict.value if video_asset.quality_verdict else None,
        "faceDetectionRate": report.get("faceDetectionRate"),
        "validFrameRatio": report.get("validFrameRatio"),
        "fps": float(video_asset.fps) if video_asset.fps else report.get("fps"),
        "width": video_asset.width,
        "height": video_asset.height,
        "durationSeconds": float(video_asset.duration_seconds) if video_asset.duration_seconds else None,
        "findings": report.get("findings", []),
        "criteria": report.get("criteria", []),
    }

CANONICAL_ANNOTATION_CATEGORIES = [
    {"code": "OF", "label": "Olho fechado", "shortcut": 1},
    {"code": "OC", "label": "Olhando para canto", "shortcut": 2},
    {"code": "ML", "label": "Mexeu lábios", "shortcut": 3},
    {"code": "VR", "label": "Virou rosto", "shortcut": 4},
    {"code": "MSO", "label": "Mexeu sobrancelha", "shortcut": 5},
]


def _annotation_categories(video_asset: VideoAssetModel) -> list[dict]:
    configured = (
        (video_asset.session.participant.study.config or {}).get(
            "annotation_categories",
            [],
        )
        if video_asset.session
        and video_asset.session.participant
        and video_asset.session.participant.study
        else []
    )
    categories = list(CANONICAL_ANNOTATION_CATEGORIES)
    known = {item["code"] for item in categories}
    for index, item in enumerate(configured, start=6):
        if isinstance(item, str):
            code = "CUSTOM_" + "".join(
                char if char.isalnum() else "_" for char in item.upper()
            ).strip("_")
            candidate = {"code": code, "label": item, "shortcut": index}
        elif isinstance(item, dict):
            candidate = {
                "code": str(item.get("code") or "").upper(),
                "label": str(item.get("label") or item.get("code") or ""),
                "shortcut": item.get("shortcut", index),
            }
        else:
            continue
        if candidate["code"] and candidate["code"] not in known:
            categories.append(candidate)
            known.add(candidate["code"])
    return categories


def _artifact_response(artifact: LandmarkArtifact | None) -> dict | None:
    if artifact is None:
        return None
    return {
        "id": str(artifact.id),
        "status": artifact.status,
        "extractor": artifact.extractor,
        "extractorVersion": artifact.extractor_version,
        "configuration": artifact.configuration,
        "fps": artifact.fps,
        "frameCount": artifact.frame_count,
        "pointCount": artifact.point_count,
        "faceDetectionRate": artifact.face_detection_rate,
        "chunkSizeFrames": artifact.chunk_size_frames,
        "checksums": {
            "raw": artifact.raw_checksum,
            "normalized": artifact.normalized_checksum,
            "overlay": artifact.overlay_checksum,
        },
        "createdAt": artifact.created_at.isoformat(),
        "errorMessage": artifact.error_message,
    }


def _roi_point_ids(action: str | None) -> set[int]:
    from cast.config.actions import ACTION_REGIONS
    from cast.config.landmarks import FACEMESH_REGIONS

    actions = [action] if action else list(ACTION_REGIONS)
    point_ids: set[int] = set()
    for action_code in actions:
        if action_code not in ACTION_REGIONS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown ROI action: {action_code}",
            )
        for region in ACTION_REGIONS[action_code]:
            point_ids.update(FACEMESH_REGIONS.get(region, set()))
    return point_ids


@router.get("/{video_id}/annotation-context")
def get_annotation_context(
    video_id: UUID,
    task_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video = get_owned_video(db, current_user, video_id)
    task_query = db.query(AnnotationTask).filter(
        AnnotationTask.video_asset_id == video_id,
    )
    if task_id is not None:
        task_query = task_query.filter(AnnotationTask.id == task_id)
    else:
        task_query = task_query.filter(AnnotationTask.assignee_id == current_user.id)
    task = task_query.order_by(AnnotationTask.created_at.desc()).first()
    if (
        task is not None
        and current_user.role == UserRole.annotator
        and task.assignee_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Task belongs to another annotator")
    artifact = (
        db.query(LandmarkArtifact)
        .filter(LandmarkArtifact.video_asset_id == video_id)
        .order_by(LandmarkArtifact.created_at.desc())
        .first()
    )
    prediction = (
        db.query(Prediction)
        .filter(Prediction.video_asset_id == video_id)
        .order_by(Prediction.created_at.desc())
        .first()
    )
    jobs = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.video_asset_id == video_id,
            ProcessingJob.job_type.in_(
                [JobType.extract_landmarks, JobType.infer]
            ),
        )
        .order_by(ProcessingJob.started_at.desc())
        .limit(10)
        .all()
    )
    from app.api.v1.routes_governance import record_access

    record_access(
        db,
        "video_annotation_context",
        video_id,
        actor=current_user,
        detail={"task_id": str(task.id) if task else None},
    )
    return {
        "video": {
            "id": str(video.id),
            "filename": video.filename,
            "fps": float(video.fps or 30.0),
            "durationSeconds": (
                float(video.duration_seconds)
                if video.duration_seconds is not None
                else None
            ),
            "width": video.width,
            "height": video.height,
        },
        "categories": _annotation_categories(video),
        "task": (
            {
                "id": str(task.id),
                "assigneeId": str(task.assignee_id),
                "status": task.status.value,
            }
            if task
            else None
        ),
        "landmarkArtifact": _artifact_response(artifact),
        "prediction": (
            {
                "id": str(prediction.id),
                "modelVersion": (prediction.summary or {}).get("model_version"),
                "createdAt": prediction.created_at.isoformat(),
            }
            if prediction
            else None
        ),
        "processing": [
            {
                "jobId": str(job.id),
                "type": job.job_type.value,
                "status": job.status.value,
                "progress": float(job.progress or 0),
                "error": job.error_message,
            }
            for job in jobs
        ],
    }


@router.get("/{video_id}/landmarks")
def get_video_landmarks(
    video_id: UUID,
    artifact_id: UUID | None = None,
    chunk: int = 0,
    mode: Literal["roi", "mesh"] = "roi",
    action: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_video(db, current_user, video_id)
    query = db.query(LandmarkArtifact).filter(
        LandmarkArtifact.video_asset_id == video_id,
        LandmarkArtifact.status == "ready",
    )
    if artifact_id is not None:
        query = query.filter(LandmarkArtifact.id == artifact_id)
    artifact = query.order_by(LandmarkArtifact.created_at.desc()).first()
    if artifact is None or not artifact.overlay_prefix:
        raise HTTPException(status_code=404, detail="Landmark artifact not found")
    if chunk < 0:
        raise HTTPException(status_code=422, detail="chunk must be non-negative")
    key = f"{artifact.overlay_prefix}/{chunk:06d}.json.gz"
    try:
        compressed = storage_service.download_bytes(key)
        payload = json.loads(gzip.decompress(compressed))
    except storage_service.s3.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Landmark chunk not found")
    except Exception as error:
        raise HTTPException(
            status_code=404,
            detail=f"Landmark chunk not found: {error}",
        )

    if mode == "roi":
        point_ids = _roi_point_ids(action)
        for frame in payload["frames"]:
            frame["points"] = [
                point for point in frame["points"] if point[0] in point_ids
            ]
    payload.update(
        {
            "artifactId": str(artifact.id),
            "mode": mode,
            "action": action,
        }
    )
    return payload

@router.get("/{video_id}/landmarks/download")
def get_video_landmarks_download(
    video_id: UUID,
    artifact_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Presigned download URLs for the raw/normalized landmark Parquet files."""
    get_owned_video(db, current_user, video_id)
    query = db.query(LandmarkArtifact).filter(
        LandmarkArtifact.video_asset_id == video_id,
        LandmarkArtifact.status == "ready",
    )
    if artifact_id is not None:
        query = query.filter(LandmarkArtifact.id == artifact_id)
    artifact = query.order_by(LandmarkArtifact.created_at.desc()).first()
    if artifact is None:
        raise HTTPException(status_code=404, detail="Landmark artifact not found")

    from app.api.v1.routes_governance import record_access

    record_access(
        db,
        "video_landmarks",
        video_id,
        actor=current_user,
        detail={"op": "download", "artifact_id": str(artifact.id)},
    )

    return {
        "artifactId": str(artifact.id),
        "raw": (
            storage_service.generate_presigned_download_url(storage_service.key_from_uri(artifact.raw_uri))
            if artifact.raw_uri
            else None
        ),
        "normalized": (
            storage_service.generate_presigned_download_url(storage_service.key_from_uri(artifact.normalized_uri))
            if artifact.normalized_uri
            else None
        ),
    }


from pydantic import BaseModel
class VideoRegister(BaseModel):
    study_id: UUID
    participant_id: UUID
    session_id: UUID = None
    object_key: str
    filename: str
    content_type: str = "video/mp4"

@router.post("/", status_code=201)
def register_video(
    payload: VideoRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    study = get_study(db, current_user, payload.study_id)
    participant = get_participant(db, current_user, payload.participant_id)
    if participant.study_id != study.id:
        raise HTTPException(
            status_code=409,
            detail="Participant does not belong to the selected study",
        )
    session_id = payload.session_id
    if not session_id:
        new_session = SessionModel(participant_id=payload.participant_id)
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id
        
    else:
        session = get_session(db, current_user, session_id)
        if session.participant_id != participant.id:
            raise HTTPException(
                status_code=409,
                detail="Session does not belong to the selected participant",
            )

    video_asset = VideoAssetModel(
        session_id=session_id,
        filename=payload.filename,
        mime_type=payload.content_type,
        storage_uri=f"s3://{storage_service.bucket_name}/{payload.object_key}"
    )
    db.add(video_asset)
    db.commit()
    db.refresh(video_asset)
    return {"video_asset_id": video_asset.id}

@router.get("/{video_id}")
def get_video(
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video_asset = get_owned_video(db, current_user, video_id)
        
    latest_job = db.query(ProcessingJob).filter(ProcessingJob.video_asset_id == video_id).order_by(ProcessingJob.started_at.desc()).first()
    if not latest_job:
        latest_job = db.query(ProcessingJob).filter(ProcessingJob.video_asset_id == video_id).first()

    eeg_asset = db.query(EEGAssetModel).filter(EEGAssetModel.session_id == video_asset.session_id).first()

    landmark_artifact = (
        db.query(LandmarkArtifact)
        .filter(
            LandmarkArtifact.video_asset_id == video_id,
            LandmarkArtifact.status == "ready",
        )
        .order_by(LandmarkArtifact.created_at.desc())
        .first()
    )

    return {
        "id": video_asset.id,
        "filename": video_asset.filename,
        "mime_type": video_asset.mime_type,
        "size_bytes": video_asset.size_bytes,
        "fps": video_asset.fps,
        "duration_seconds": video_asset.duration_seconds,
        "latest_job_id": latest_job.id if latest_job else None,
        "session_id": video_asset.session_id,
        "eeg_asset_id": eeg_asset.id if eeg_asset else None,
        "eeg_sync_offset_ms": eeg_asset.sync_offset_ms if eeg_asset else None,
        "landmark_artifact_id": landmark_artifact.id if landmark_artifact else None,
        "landmark_chunk_size_frames": landmark_artifact.chunk_size_frames if landmark_artifact else None,
    }

@router.post("/{video_id}/quality-check", status_code=202)
def quality_check_video(
    video_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_video(db, current_user, video_id)
        
    job = ProcessingJob(
        video_asset_id=video_id,
        job_type=JobType.quality_check
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    return {"job_id": job.id, "status": "queued"}

@router.get("/{video_id}/frames")
def get_video_frames(
    video_id: UUID,
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_video(db, current_user, video_id)
        
    # Stub: Normally would return presigned URLs to individual frames in S3
    return {
        "video_id": video_id,
        "frames": [
            {"frame_index": i, "url": f"https://mock-storage.com/frames/{video_id}/{i}.jpg"}
            for i in range(skip, skip + limit)
        ]
    }

from typing import List
from pydantic import BaseModel

class VideoListResponse(BaseModel):
    id: UUID
    filename: str
    status: str
    created_at: str
    session_id: UUID
    participant_id: UUID
    study_id: UUID

@router.get("/", response_model=List[VideoListResponse])
def list_global_videos(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    videos = (
        db.query(
            VideoAssetModel.id, 
            VideoAssetModel.filename, 
            VideoAssetModel.status, 
            VideoAssetModel.created_at,
            SessionModel.id.label("session_id"),
            ParticipantModel.id.label("participant_id"),
            Study.id.label("study_id")
        )
        .join(SessionModel, VideoAssetModel.session_id == SessionModel.id)
        .join(ParticipantModel, SessionModel.participant_id == ParticipantModel.id)
        .join(Study, ParticipantModel.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == current_user.organization_id)
        .order_by(VideoAssetModel.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    return [
        VideoListResponse(
            id=v.id,
            filename=v.filename,
            status=v.status.value,
            created_at=v.created_at.isoformat(),
            session_id=v.session_id,
            participant_id=v.participant_id,
            study_id=v.study_id
        ) for v in videos
    ]
