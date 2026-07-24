from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from uuid import UUID, uuid4

from app.schemas.video import VideoAssetCreate, VideoAsset
from app.db.models import VideoAsset as VideoAssetModel, Session as SessionModel, Participant as ParticipantModel, EEGAsset as EEGAssetModel
from app.db.session import SessionLocal
from app.services.storage_service import storage_service

router = APIRouter(prefix="/videos", tags=["videos"])

from app.api.deps import get_db

@router.post("/init-upload")
def init_upload(participant_id: UUID, filename: str, mime_type: str, size_bytes: int, db: Session = Depends(get_db)):
    # Create Session for the participant if uploading a new video
    # In a real scenario, the session might be created before.
    participant = db.query(ParticipantModel).filter(ParticipantModel.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    
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
    db: Session = Depends(get_db)
):
    participant = db.query(ParticipantModel).filter(ParticipantModel.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Attach to an existing session (from the session wizard) or create one.
    if session_id:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
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

from app.db.models import ProcessingJob, JobType
from app.workers.tasks_video import process_video_task

@router.post("/{video_id}/process")
def process_video(video_id: UUID, db: Session = Depends(get_db)):
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")
        
    job = ProcessingJob(
        video_asset_id=video_id,
        job_type=JobType.extract_landmarks
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Trigger celery task
    process_video_task.delay(str(job.id))
    
    return {"job_id": job.id, "status": "queued"}

from app.db.models import Prediction
import json


def load_timeline_events(video_asset, db: Session):
    """Loads micro-action events (from the latest prediction JSON) for a video.

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
                    events.append({
                        "event_id": str(uuid4()),
                        "action": act["action"],
                        "start_frame": ev["start_frame"],
                        "end_frame": ev["end_frame"],
                        "start_time": ev.get("start_ms", 0) / 1000.0,
                        "end_time": ev.get("end_ms", 0) / 1000.0,
                        "confidence_mean": ev.get("avg_confidence", 0.0),
                    })
        except Exception as e:
            print(f"Failed to load prediction JSON: {e}")

    return events, model_version


@router.get("/{video_id}/timeline")
def get_video_timeline(video_id: UUID, source: str = "model", db: Session = Depends(get_db)):
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")

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
def get_video_playback_url(video_id: UUID, db: Session = Depends(get_db)):
    """Presigned GET URL so the browser can stream the video directly from storage."""
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")

    url = None
    if video_asset.storage_uri:
        object_key = video_asset.storage_uri.replace(f"s3://{storage_service.bucket_name}/", "")
        url = storage_service.generate_presigned_download_url(object_key) or None

    # Audit access to raw facial video (sensitive data, docs §21).
    from app.api.v1.routes_governance import record_access
    record_access(db, "video", video_id, detail={"op": "playback"})

    return {"video_id": video_id, "url": url}

@router.get("/{video_id}/quality-report")
def get_video_quality(video_id: UUID, db: Session = Depends(get_db)):
    """Real quality assessment persisted by the processing worker (docs §9).

    Returns the actual report once the video has been processed; before that,
    it reports `assessed: false` rather than fabricating numbers.
    """
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")

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

@router.get("/{video_id}/landmarks")
def get_video_landmarks(video_id: UUID, db: Session = Depends(get_db)):
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")
        
    object_name = f"landmarks/{video_id}.parquet"
    url = storage_service.generate_presigned_download_url(object_name)
    return {"download_url": url}

from pydantic import BaseModel
class VideoRegister(BaseModel):
    study_id: UUID
    participant_id: UUID
    session_id: UUID = None
    object_key: str
    filename: str
    content_type: str = "video/mp4"

@router.post("/", status_code=201)
def register_video(payload: VideoRegister, db: Session = Depends(get_db)):
    session_id = payload.session_id
    if not session_id:
        new_session = SessionModel(participant_id=payload.participant_id)
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id
        
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
def get_video(video_id: UUID, db: Session = Depends(get_db)):
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")
        
    latest_job = db.query(ProcessingJob).filter(ProcessingJob.video_asset_id == video_id).order_by(ProcessingJob.started_at.desc()).first()
    if not latest_job:
        latest_job = db.query(ProcessingJob).filter(ProcessingJob.video_asset_id == video_id).first()

    eeg_asset = db.query(EEGAssetModel).filter(EEGAssetModel.session_id == video_asset.session_id).first()

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
        "eeg_sync_offset_ms": eeg_asset.sync_offset_ms if eeg_asset else None
    }

@router.post("/{video_id}/quality-check", status_code=202)
def quality_check_video(video_id: UUID, db: Session = Depends(get_db)):
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")
        
    job = ProcessingJob(
        video_asset_id=video_id,
        job_type=JobType.quality_check
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    return {"job_id": job.id, "status": "queued"}

@router.get("/{video_id}/frames")
def get_video_frames(video_id: UUID, skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.id == video_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="Video not found")
        
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
def list_global_videos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    from app.db.models import Study
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
