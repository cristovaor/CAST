import pytest

from app.services.annotation_analysis_service import (
    FrameGeometry,
    _motion,
    _peak_frame,
    _point_ids,
)


def test_motion_uses_only_landmarks_shared_by_consecutive_frames():
    previous = FrameGeometry(
        frame_index=10,
        face_detected=True,
        points={1: (0.1, 0.2), 2: (0.4, 0.5)},
    )
    current = FrameGeometry(
        frame_index=11,
        face_detected=True,
        points={1: (0.13, 0.24), 3: (0.8, 0.9)},
    )

    assert _motion(previous, current, {1, 2, 3}) == pytest.approx(0.05)


def test_peak_frame_respects_the_requested_boundary_window():
    motion = {8: 0.8, 11: 0.3, 14: 0.9}

    assert _peak_frame(motion, target=10, radius=2) == (8, 0.8)
    assert _peak_frame(motion, target=20, radius=2) == (20, 0.0)


def test_supported_action_resolves_to_a_facial_landmark_region():
    assert _point_ids("OF")
