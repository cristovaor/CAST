from app.db.models import Participant, Session as DbSession, VideoAsset
from app.domains.acquisition.models import VideoCapturePart
from app.domains.acquisition.schemas import (
    CompletedCapturePart,
    ResearchBookmarkCreate,
    VideoCaptureComplete,
    VideoCaptureCreate,
)
from app.domains.acquisition.service import (
    complete_capture,
    create_bookmark,
    create_capture,
)
from tests.utils import create_random_project, create_random_study


def _session(db, user):
    project = create_random_project(db, user.organization_id)
    study = create_random_study(db, project.id)
    participant = Participant(study_id=study.id, external_code="capture-test")
    db.add(participant)
    db.flush()
    session = DbSession(participant_id=participant.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def test_complete_capture_is_idempotent_and_does_not_create_video_asset(
    db, normal_user, monkeypatch
):
    session = _session(db, normal_user)
    monkeypatch.setattr(
        "app.domains.acquisition.service.storage_service.create_multipart_upload",
        lambda *_args, **_kwargs: "upload-1",
    )
    completed_calls = []
    monkeypatch.setattr(
        "app.domains.acquisition.service.storage_service.complete_multipart_upload",
        lambda *args, **kwargs: completed_calls.append((args, kwargs)) or {},
    )
    capture = create_capture(
        db,
        session_id=session.id,
        user_id=normal_user.id,
        payload=VideoCaptureCreate(
            filename="capture.webm",
            mime_type="video/webm",
            expected_size_bytes=10,
        ),
    )
    payload = VideoCaptureComplete(
        parts=[
            CompletedCapturePart(
                part_number=1,
                etag="etag-1",
                size_bytes=10,
                checksum_sha256="b" * 64,
            )
        ],
        checksum_sha256="c" * 64,
    )

    first = complete_capture(db, capture=capture, payload=payload)
    second = complete_capture(db, capture=first, payload=payload)

    assert first.id == second.id
    assert first.status == "completed"
    assert len(completed_calls) == 1
    assert db.query(VideoCapturePart).count() == 1
    assert db.query(VideoAsset).filter(VideoAsset.session_id == session.id).count() == 0


def test_bookmark_client_event_id_is_idempotent(db, normal_user):
    session = _session(db, normal_user)
    payload = ResearchBookmarkCreate(
        client_event_id="browser-event-1",
        start_canonical_time_us=1_000,
        end_canonical_time_us=2_000,
        label="Trecho relevante",
    )
    first = create_bookmark(
        db, session_id=session.id, user_id=normal_user.id, payload=payload
    )
    second = create_bookmark(
        db, session_id=session.id, user_id=normal_user.id, payload=payload
    )
    assert first.id == second.id

