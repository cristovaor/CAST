from app.domains.context.materialization import materialize_environment_artifact
from app.domains.context.models import ExperimentalEvent
from app.domains.context.schemas import (
    EnvironmentSample, EnvironmentSeriesCreate,
    ExperimentalEventBatch, ExperimentalEventCreate, TrialCreate,
)
from app.domains.context.service import create_environment_series, create_trial, record_event_batch
from tests.services.test_live_capture_service import _session


def test_trial_and_event_batch_are_client_idempotent(db, normal_user):
    session = _session(db, normal_user)
    trial_payload = TrialCreate(
        client_trial_id="trial-browser-1",
        label="Baseline",
        source_clock_id="browser-performance",
        started_source_time_us=100,
    )
    first_trial = create_trial(db, session_id=session.id, payload=trial_payload)
    same_trial = create_trial(db, session_id=session.id, payload=trial_payload)
    assert first_trial.id == same_trial.id

    batch = ExperimentalEventBatch(events=[ExperimentalEventCreate(
        client_event_id="event-browser-1",
        trial_id=first_trial.id,
        event_type="stimulus_presented",
        source_time_us=200,
        source_clock_id="browser-performance",
        canonical_time_us=250,
        payload={"stimulus": "checkerboard"},
    )])
    events, created, reused = record_event_batch(db, session_id=session.id, payload=batch)
    assert (created, reused) == (1, 0)
    same_events, created, reused = record_event_batch(db, session_id=session.id, payload=batch)
    assert (created, reused) == (0, 1)
    assert events[0].id == same_events[0].id
    assert db.query(ExperimentalEvent).count() == 1


def test_environment_materialization_preserves_observed_values_and_orders_time(db, normal_user, monkeypatch):
    session = _session(db, normal_user)
    objects = {}
    monkeypatch.setattr(
        "app.domains.context.service.storage_service.upload_bytes",
        lambda key, body, _content_type: objects.setdefault(key, body) is body,
    )
    artifact = create_environment_series(
        db,
        session_id=session.id,
        payload=EnvironmentSeriesCreate(
            kind="ambient_luminance",
            unit="lux",
            method="calibrated-sensor",
            samples=[
                EnvironmentSample(source_time_us=200, source_clock_id="sensor-1", value=20.0),
                EnvironmentSample(source_time_us=100, source_clock_id="sensor-1", value=10.0),
            ],
        ),
    )
    raw = next(iter(objects.values()))
    monkeypatch.setattr(
        "app.domains.context.materialization.storage_service.download_bytes",
        lambda _key: raw,
    )
    uploaded = {}
    normalized_rows = []
    monkeypatch.setattr(
        "app.domains.context.materialization._parquet_bytes",
        lambda rows: normalized_rows.extend(rows) or b"parquet-evidence",
    )
    monkeypatch.setattr(
        "app.domains.context.materialization.storage_service.s3.put_object",
        lambda **kwargs: uploaded.update({kwargs["Key"]: kwargs["Body"]}),
    )

    ready = materialize_environment_artifact(db, artifact.id)
    assert ready.status == "ready"
    assert [row["source_time_us"] for row in normalized_rows] == [100, 200]
    assert [row["value"] for row in normalized_rows] == [10.0, 20.0]
    assert all("luminance" not in row for row in normalized_rows)
    assert next(iter(uploaded.values())) == b"parquet-evidence"
