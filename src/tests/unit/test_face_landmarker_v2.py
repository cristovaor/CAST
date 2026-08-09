import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.domains.face.landmarker_v2 import (
    MODEL_SHA256,
    probe_pts_us,
    rotation_matrix_to_euler,
    verify_model,
)
from app.workers.tasks_video import _extractor_config_for_video


def test_pinned_official_model_checksum():
    model = Path("/app/models/face_landmarker_v1.task")
    if not model.exists():
        pytest.skip("official model is mounted only in the vision worker")
    assert verify_model(str(model)) == MODEL_SHA256
    assert hashlib.sha256(model.read_bytes()).hexdigest() == MODEL_SHA256


def test_probe_pts_uses_real_monotonic_timestamps(monkeypatch):
    payload = {"frames": [
        {"best_effort_timestamp_time": "0.000000"},
        {"best_effort_timestamp_time": "0.041708"},
    ]}
    monkeypatch.setattr(
        "app.domains.face.landmarker_v2.subprocess.run",
        lambda *_args, **_kwargs: SimpleNamespace(stdout=json.dumps(payload)),
    )
    assert probe_pts_us("vfr.mp4") == [0, 41_708]


def test_rotation_identity_is_zero_pose():
    yaw, pitch, roll = rotation_matrix_to_euler([
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ])
    assert yaw == pytest.approx(0)
    assert pitch == pytest.approx(0)
    assert roll == pytest.approx(0)


def test_feature_flag_changes_extractor_and_idempotency_config(monkeypatch):
    monkeypatch.setattr("app.workers.tasks_video.settings.FACE_LANDMARKER_V2_ENABLED", True)
    config = _extractor_config_for_video(SimpleNamespace(session=None))
    assert config["extractor"] == "mediapipe_face_landmarker_v2"
    assert config["running_mode"] == "VIDEO"
    assert config["model_checksum"] == MODEL_SHA256
    assert config["output_face_blendshapes"] is True
