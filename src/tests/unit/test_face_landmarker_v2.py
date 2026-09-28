import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import subprocess
from unittest.mock import Mock

import pandas as pd
import pytest

from app.domains.face.landmarker_v2 import (
    MODEL_SHA256,
    FaceLandmarkerV2,
    probe_pts_us,
    rotation_matrix_to_euler,
    verify_model,
)
from app.workers.tasks_video import _extract_landmarks, _extractor_config_for_video


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


def test_isolated_extraction_preserves_all_outputs_and_cleans_files(monkeypatch, tmp_path):
    model = tmp_path / "model.task"
    model.write_bytes(b"fixture-model")
    checksum = hashlib.sha256(model.read_bytes()).hexdigest()
    directories = []

    def run(command, **kwargs):
        assert command[:3] == ["isolated-python", "-m", "app.domains.face.landmarker_v2"]
        assert command[command.index("--checksum") + 1] == checksum
        assert command[command.index("--min-confidence") + 1] == "0.7"
        assert kwargs["check"] is True
        output_dir = Path(command[command.index("--output-dir") + 1])
        directories.append(output_dir)
        for name in ("landmarks", "features", "quality"):
            pd.DataFrame({"kind": [name], "source_time_us": [41_708]}).to_pickle(output_dir / f"{name}.pkl")

    monkeypatch.setattr("app.domains.face.landmarker_v2.subprocess.run", run)
    output = FaceLandmarkerV2(str(model), expected_sha256=checksum, min_confidence=0.7).extract_isolated(
        "isolated-python", "video.mp4", "video-123",
    )
    for name in ("landmarks", "features", "quality"):
        assert getattr(output, name)["kind"].tolist() == [name]
        assert getattr(output, name)["source_time_us"].tolist() == [41_708]
    assert not directories[0].exists()


def test_isolated_extraction_surfaces_runtime_failure_and_cleans_files(monkeypatch, tmp_path):
    model = tmp_path / "model.task"
    model.write_bytes(b"fixture-model")
    directories = []

    def run(command, **kwargs):
        directories.append(Path(command[command.index("--output-dir") + 1]))
        raise subprocess.CalledProcessError(134, command, stderr="free(): invalid pointer")

    monkeypatch.setattr("app.domains.face.landmarker_v2.subprocess.run", run)
    with pytest.raises(RuntimeError, match=r"Face Landmarker extraction failed: free\(\): invalid pointer"):
        FaceLandmarkerV2(str(model), expected_sha256=hashlib.sha256(model.read_bytes()).hexdigest()).extract_isolated(
            "isolated-python", "video.mp4", "video-123",
        )
    assert not directories[0].exists()


@pytest.mark.parametrize("isolated", [True, False])
def test_worker_uses_tasks_runtime_when_available(monkeypatch, isolated):
    landmarker = Mock()
    factory = Mock(return_value=landmarker)
    monkeypatch.setattr("app.domains.face.landmarker_v2.FaceLandmarkerV2", factory)
    monkeypatch.setenv("MEDIAPIPE_TASKS_PYTHON", "tasks-python")
    monkeypatch.setattr("app.workers.tasks_video.os.path.exists", lambda path: isolated)
    _extract_landmarks("video.mp4", "video-123", {
        "extractor": "mediapipe_face_landmarker_v2", "model_path": "model.task", "model_checksum": MODEL_SHA256,
    })
    if isolated:
        landmarker.extract_isolated.assert_called_once_with("tasks-python", "video.mp4", "video-123")
        landmarker.extract_from_video.assert_not_called()
    else:
        landmarker.extract_from_video.assert_called_once_with("video.mp4", "video-123")
        landmarker.extract_isolated.assert_not_called()
