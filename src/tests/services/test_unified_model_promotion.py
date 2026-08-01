from types import SimpleNamespace

import numpy as np

from cast.config.taxonomy import CORE_ACTIONS
from cast.models.manifest import ModelManifest, TrainingConfig
from app.services.model_service import (
    multimodal_v8_promotion_failures,
    unified_v7_promotion_failures,
)
from app.workers.tasks_model_testing import (
    _is_unified_manifest,
    _landmark_uri_for_test,
    _unified_test_manifest,
)


def _manifest(metrics_by_label):
    return ModelManifest(
        model_id="cast-unified-v7",
        version="0.1.0",
        action="MULTI",
        architecture="cast-unified-v7",
        labels=list(CORE_ACTIONS),
        metrics_by_label=metrics_by_label,
        training_config=TrainingConfig(
            epochs=1,
            batch_size=2,
            learning_rate=1e-4,
        ),
    )


def test_unified_v7_promotion_accepts_supported_high_recall_model():
    metrics = {
        label: {"support": 30.0, "recall": 0.92, "precision": 0.70}
        for label in CORE_ACTIONS
    }

    assert unified_v7_promotion_failures(_manifest(metrics)) == []


def test_unified_v7_promotion_reports_per_label_and_macro_failures():
    metrics = {
        label: {"support": 30.0, "recall": 0.91, "precision": 0.70}
        for label in CORE_ACTIONS
    }
    metrics["OF"]["support"] = 5.0
    metrics["OC"]["recall"] = 0.70

    failures = unified_v7_promotion_failures(_manifest(metrics))

    assert any("OF: suporte insuficiente" in item for item in failures)
    assert any("OC: recall" in item for item in failures)
    assert any("recall macro" in item for item in failures)


def test_multimodal_v8_promotion_requires_eeg_validation_evidence():
    manifest = _manifest(
        {
            label: {"support": 30.0, "recall": 0.92, "precision": 0.70}
            for label in CORE_ACTIONS
        }
    ).model_copy(
        update={
            "model_id": "cast-multimodal-v8",
            "architecture": "cast-multimodal-v8",
        }
    )

    failures = multimodal_v8_promotion_failures(manifest)

    assert any("sessões EEG" in item for item in failures)
    assert any("janelas de validação com EEG" in item for item in failures)


def test_multimodal_v8_promotion_accepts_participant_disjoint_eeg_validation():
    manifest = _manifest(
        {
            label: {"support": 30.0, "recall": 0.92, "precision": 0.70}
            for label in CORE_ACTIONS
        }
    ).model_copy(
        update={
            "model_id": "cast-multimodal-v8",
            "architecture": "cast-multimodal-v8",
            "validation_summary": {
                "eeg_session_count": 3,
                "eeg_validation_windows": 120,
                "approved_sync_required": True,
                "participant_disjoint_split": True,
            },
        }
    )

    assert multimodal_v8_promotion_failures(manifest) == []


def test_unified_model_test_uses_raw_landmarks_instead_of_legacy_normalized_features():
    manifest = _manifest({})
    artifact = SimpleNamespace(
        raw_uri="s3://bucket/raw.parquet",
        normalized_uri="s3://bucket/normalized.parquet",
    )

    assert _is_unified_manifest(manifest)
    assert _landmark_uri_for_test(artifact, manifest) == artifact.raw_uri


def test_unified_model_test_applies_overrides_to_all_output_labels():
    manifest = _manifest({}).model_copy(
        update={
            "output_heads": {
                "actions": ["OF", "OC"],
                "observable_movements": ["SMILE"],
            },
            "postprocessing": {
                "OF": {"enter_threshold": 0.6, "exit_threshold": 0.4}
            },
        }
    )

    test_manifest = _unified_test_manifest(
        manifest,
        fps=25.0,
        threshold_override=0.7,
        min_run_length=5,
    )

    for label in ("OF", "OC", "SMILE"):
        assert test_manifest.postprocessing[label]["enter_threshold"] == 0.7
        assert test_manifest.postprocessing[label]["exit_threshold"] == 0.7
        assert test_manifest.postprocessing[label]["min_duration_ms"] == 200.0
    assert manifest.postprocessing["OF"]["enter_threshold"] == 0.6


def test_unified_model_test_dispatches_to_v7_inference(monkeypatch):
    from app.db.models import LandmarkArtifact, ProcessingJob
    from app.ml import inference_engine, unified_inference
    from app.workers import tasks_model_testing

    video_id = "fd5cfbcc-4634-4149-bec2-9158a771d5f3"
    job = SimpleNamespace(logs=[])
    artifact = SimpleNamespace(
        id="artifact-id",
        video_asset_id=video_id,
        status="ready",
        raw_uri="s3://bucket/raw.parquet",
        normalized_uri="s3://bucket/normalized.parquet",
        fps=30.0,
        configuration={},
        face_detection_rate=1.0,
        frame_count=2,
    )

    class FakeQuery:
        def __init__(self, value):
            self.value = value

        def filter(self, *args):
            return self

        def order_by(self, *args):
            return self

        def first(self):
            return self.value

    class FakeDb:
        def query(self, entity):
            if entity is ProcessingJob:
                return FakeQuery(job)
            if entity is LandmarkArtifact:
                return FakeQuery(artifact)
            return FakeQuery(None)

        def commit(self):
            pass

        def close(self):
            pass

    fake_db = FakeDb()
    manifest = _manifest({}).model_copy(
        update={
            "feature_names": [f"feature_{index}" for index in range(680)],
            "feature_count": 680,
        }
    )
    model = object()
    model_version = SimpleNamespace(
        id="model-version-id",
        model_id="cast-unified-v7",
        version="1.0",
        action="MULTI",
    )
    raw_dataframe = object()
    calls = []

    def fake_run_unified(dataframe, received_model, received_manifest, **kwargs):
        calls.append((dataframe, received_model, received_manifest, kwargs))
        return SimpleNamespace(
            request_id="request-id",
            model_version="1.0",
            schema_version="cast-unified-v7",
            frame_indices=np.array([0, 1]),
            timestamps_ms=np.array([0.0, 33.333]),
            events=[],
            latency_ms=1.5,
            modalities_used=("head_video",),
            eeg_validation_status="not_available",
            legacy_summary=lambda: {},
        )

    def fail_legacy_inference(*args, **kwargs):
        raise AssertionError("V7 must not use the legacy 200-feature path")

    monkeypatch.setattr(tasks_model_testing, "SessionLocal", lambda: fake_db)
    monkeypatch.setattr(
        tasks_model_testing,
        "get_model_by_version_id",
        lambda db, version_id: (model, manifest, model_version),
    )
    monkeypatch.setattr(
        tasks_model_testing.storage_service,
        "key_from_uri",
        lambda uri: uri,
    )
    monkeypatch.setattr(
        tasks_model_testing.storage_service,
        "download_bytes",
        lambda key: b"raw-parquet",
    )
    monkeypatch.setattr("pandas.read_parquet", lambda *args, **kwargs: raw_dataframe)
    monkeypatch.setattr(unified_inference, "run_unified_inference", fake_run_unified)
    monkeypatch.setattr(inference_engine, "run_action_inference", fail_legacy_inference)

    output = tasks_model_testing.test_model_inference(
        "job-id",
        "model-version-id",
        [video_id],
    )

    assert output["results"][0]["status"] == "success"
    assert calls[0][0] is raw_dataframe
    assert calls[0][1] is model
    assert calls[0][3]["video_id"] == video_id
