import numpy as np
import pandas as pd

from cast.features.unified import (
    extract_unified_features,
    make_time_centered_windows,
    unified_feature_names,
)


def _landmarks(frame_count: int = 3) -> pd.DataFrame:
    point_ids = [
        0, 1, 13, 14, 17, 33, 61, 107, 133, 144, 145, 153, 158, 159,
        160, 263, 291, 336, 362, 373, 374, 380, 385, 386, 387,
        469, 470, 471, 472, 474, 475, 476, 477,
    ]
    rows = []
    for frame in range(frame_count):
        for point_id in point_ids:
            rows.append(
                {
                    "frame_idx": frame,
                    "timestamp_ms": frame * 40.0,
                    "face_detected": True,
                    "landmark_idx": point_id,
                    "x": 0.2 + point_id / 2000.0 + frame * 0.001,
                    "y": 0.3 + point_id / 3000.0,
                    "z": point_id / 10000.0,
                }
            )
    return pd.DataFrame(rows)


def test_unified_features_are_manifest_ordered_and_include_signals():
    series = extract_unified_features(_landmarks(), landmark_ids=(1, 33, 263))

    assert series.values.shape == (3, len(series.feature_names))
    assert series.feature_names == unified_feature_names((1, 33, 263))
    assert {"yaw", "pitch", "roll", "gaze_horizontal"}.issubset(
        series.signals[0]
    )
    assert np.isfinite(series.values).all()


def test_time_centered_windows_cover_first_and_last_frame():
    series = extract_unified_features(_landmarks(), landmark_ids=(1, 33, 263))
    windows, targets = make_time_centered_windows(
        series.values,
        series.timestamps_ms,
        target_fps=10,
        window_ms=400,
    )

    assert windows.shape == (3, 5, series.values.shape[1])
    assert targets.tolist() == [0, 1, 2]
    np.testing.assert_array_equal(windows[0, 0], series.values[0])
    np.testing.assert_array_equal(windows[-1, -1], series.values[-1])


def test_missing_depth_is_masked_to_a_finite_value():
    landmarks = _landmarks(frame_count=1)
    landmarks.loc[landmarks.index[0], "z"] = np.nan

    series = extract_unified_features(landmarks, landmark_ids=(1, 33, 263))

    assert np.isfinite(series.values).all()
