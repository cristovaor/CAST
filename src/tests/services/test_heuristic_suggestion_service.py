import io
import json
import uuid
from datetime import timedelta

import pytest

pytest.importorskip("pyarrow")

from app.db.models import JobStatus, LandmarkArtifact, Prediction, ProcessingJob, VideoAsset
from app.services import heuristic_suggestion_service as service
from tests.cast.test_landmark_rules import _close_eyes, _raw


@pytest.fixture
def storage(monkeypatch):
    objects = {}

    def put_object(Bucket, Key, Body, **kwargs):
        objects[Key] = Body

    monkeypatch.setattr(service.storage_service.s3, "put_object", put_object)
    monkeypatch.setattr(service.storage_service, "download_bytes", objects.__getitem__)
    return objects


@pytest.fixture
def artifact(db, storage):
    video = VideoAsset(
        session_id=uuid.uuid4(),
        filename="clip.mp4",
        storage_uri="s3://cast-videos/videos/clip.mp4",
        status="uploaded",
        width=640,
        height=640,
    )
    db.add(video)
    db.flush()
    job = ProcessingJob(video_asset_id=video.id, status=JobStatus.succeeded)
    db.add(job)
    db.flush()
    raw_key = f"landmarks/{video.id}/a/raw.parquet"
    buffer = io.BytesIO()
    _raw({(50, 58): _close_eyes}).to_parquet(buffer, index=False, engine="pyarrow")
    storage[raw_key] = buffer.getvalue()
    artifact = LandmarkArtifact(
        video_asset_id=video.id,
        processing_job_id=job.id,
        status="ready",
        extractor_version="v1",
        video_checksum="abc",
        config_hash="def",
        fps=30.0,
        frame_count=300,
        raw_uri=f"s3://{service.storage_service.bucket_name}/{raw_key}",
    )
    db.add(artifact)
    db.flush()
    return artifact


def test_rules_are_stored_as_a_heuristic_prediction(db, storage, artifact):
    prediction, created = service.create_heuristic_prediction(db, artifact)

    assert created
    assert service.is_heuristic_prediction(prediction)
    assert prediction.summary["event_counts"]["OF"] == 1
    payload = json.loads(storage[service.storage_service.key_from_uri(prediction.prediction_uri)])
    assert [event["actionCode"] for event in payload["events"]] == ["OF"]
    assert payload["events"][0]["startFrame"] in range(48, 53)


def test_rerunning_reuses_the_prediction_so_reviews_stay_attached(db, artifact):
    first, _ = service.create_heuristic_prediction(db, artifact)
    second, created = service.create_heuristic_prediction(db, artifact)

    assert not created
    assert second.id == first.id


def test_model_output_wins_and_heuristics_stay_out_of_model_views(db, artifact):
    heuristic, _ = service.create_heuristic_prediction(db, artifact)
    video_id = artifact.video_asset_id

    assert service.latest_model_prediction(db, video_id) is None
    assert service.latest_suggestion_prediction(db, video_id).id == heuristic.id

    model = Prediction(
        video_asset_id=video_id,
        summary={"model_version": "v6"},
        created_at=heuristic.created_at - timedelta(days=1),
    )
    db.add(model)
    db.flush()

    assert service.latest_model_prediction(db, video_id).id == model.id
    assert service.latest_suggestion_prediction(db, video_id).id == model.id
    assert service.model_predictions([heuristic, model]) == [model]
