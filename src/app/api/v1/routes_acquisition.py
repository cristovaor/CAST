from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_session as get_owned_session
from app.core.config import settings
from app.db.models import User
from app.domains.acquisition.models import ResearchBookmark, VideoCaptureRun
from app.domains.acquisition.schemas import (
    ResearchBookmarkCreate,
    ResearchBookmarkDetail,
    VideoCaptureComplete,
    VideoCaptureCreate,
    VideoCaptureDetail,
    VideoCapturePartPresign,
    VideoCapturePartURL,
)
from app.domains.acquisition.service import (
    abort_capture,
    complete_capture,
    create_bookmark,
    create_capture,
    enqueue_capture_finalization,
    presign_part,
)


router = APIRouter(tags=["live-acquisition"])


def _require_enabled() -> None:
    if not settings.LIVE_CAPTURE_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Live capture is disabled",
        )


def _owned_capture(
    db: Session, current_user: User, capture_id: UUID
) -> VideoCaptureRun:
    capture = (
        db.query(VideoCaptureRun).filter(VideoCaptureRun.id == capture_id).first()
    )
    if capture is None:
        raise HTTPException(status_code=404, detail="Video capture not found")
    get_owned_session(db, current_user, capture.session_id)
    return capture


@router.post(
    "/sessions/{session_id}/video-captures",
    response_model=VideoCaptureDetail,
    status_code=status.HTTP_201_CREATED,
)
def start_video_capture(
    session_id: UUID,
    payload: VideoCaptureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    get_owned_session(db, current_user, session_id)
    return create_capture(
        db, session_id=session_id, user_id=current_user.id, payload=payload
    )


@router.get(
    "/video-captures/{capture_id}",
    response_model=VideoCaptureDetail,
)
def get_video_capture(
    capture_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    return _owned_capture(db, current_user, capture_id)


@router.post(
    "/video-captures/{capture_id}/parts/presign",
    response_model=VideoCapturePartURL,
)
def sign_video_capture_part(
    capture_id: UUID,
    payload: VideoCapturePartPresign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    capture = _owned_capture(db, current_user, capture_id)
    return VideoCapturePartURL(
        part_number=payload.part_number,
        upload_url=presign_part(capture, payload.part_number),
        expires_in_seconds=3600,
    )


@router.post(
    "/video-captures/{capture_id}/complete",
    response_model=VideoCaptureDetail,
)
def finish_video_capture(
    capture_id: UUID,
    payload: VideoCaptureComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    capture = _owned_capture(db, current_user, capture_id)
    capture = complete_capture(db, capture=capture, payload=payload)
    job, created = enqueue_capture_finalization(db, capture)
    if created:
        from app.workers.tasks_acquisition import finalize_capture_task

        finalize_capture_task.delay(str(capture.id), str(job.id))
    db.refresh(capture)
    return capture


@router.post(
    "/video-captures/{capture_id}/abort",
    response_model=VideoCaptureDetail,
)
def cancel_video_capture(
    capture_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_enabled()
    return abort_capture(db, _owned_capture(db, current_user, capture_id))


@router.get(
    "/sessions/{session_id}/bookmarks",
    response_model=list[ResearchBookmarkDetail],
)
def list_bookmarks(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_session(db, current_user, session_id)
    return (
        db.query(ResearchBookmark)
        .filter(ResearchBookmark.session_id == session_id)
        .order_by(ResearchBookmark.start_canonical_time_us)
        .all()
    )


@router.post(
    "/sessions/{session_id}/bookmarks",
    response_model=ResearchBookmarkDetail,
    status_code=status.HTTP_201_CREATED,
)
def add_bookmark(
    session_id: UUID,
    payload: ResearchBookmarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_session(db, current_user, session_id)
    return create_bookmark(
        db, session_id=session_id, user_id=current_user.id, payload=payload
    )


@router.delete(
    "/sessions/{session_id}/bookmarks/{bookmark_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_bookmark(
    session_id: UUID,
    bookmark_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_session(db, current_user, session_id)
    bookmark = (
        db.query(ResearchBookmark)
        .filter(
            ResearchBookmark.id == bookmark_id,
            ResearchBookmark.session_id == session_id,
        )
        .first()
    )
    if bookmark is None:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(bookmark)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
