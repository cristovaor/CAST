import gzip
import json

import pandas as pd
import pytest
from fastapi import HTTPException

from app.api.v1.routes_videos import _roi_point_ids
from app.workers.tasks_video import _write_overlay_chunks
from cast.config.landmarks import FACEMESH_REGIONS


def test_roi_uses_action_points_and_default_union():
    of_points = _roi_point_ids("OF")
    assert set(FACEMESH_REGIONS["olho_direito"]).issubset(of_points)
    assert not set(FACEMESH_REGIONS["labios"]).issubset(of_points)
    assert of_points.issubset(_roi_point_ids(None))

    with pytest.raises(HTTPException):
        _roi_point_ids("UNKNOWN")


def test_overlay_chunks_keep_frames_without_faces(monkeypatch):
    uploaded = {}

    def put_object(**kwargs):
        uploaded[kwargs["Key"]] = kwargs["Body"]

    from app.workers import tasks_video

    monkeypatch.setattr(tasks_video.storage_service.s3, "put_object", put_object)
    dataframe = pd.DataFrame(
        [
            {
                "frame_idx": 0,
                "timestamp_ms": 0.0,
                "face_detected": True,
                "landmark_idx": 33,
                "x": 0.25,
                "y": 0.5,
            },
            {
                "frame_idx": 1,
                "timestamp_ms": 100.0,
                "face_detected": False,
                "landmark_idx": -1,
                "x": float("nan"),
                "y": float("nan"),
            },
        ]
    )

    chunk_size, frame_count, checksum = _write_overlay_chunks(
        dataframe,
        prefix="landmarks/video/artifact/overlay",
        fps=10.0,
    )

    payload = json.loads(gzip.decompress(next(iter(uploaded.values()))))
    assert chunk_size == 10
    assert frame_count == 2
    assert len(checksum) == 64
    assert payload["frames"][0]["points"] == [[33, 0.25, 0.5]]
    assert payload["frames"][1]["faceDetected"] is False
    assert payload["frames"][1]["points"] == []
