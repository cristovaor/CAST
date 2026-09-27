import numpy as np

from cast.features.multimodal import (
    build_multimodal_windows,
    eeg_feature_names,
    extract_eeg_features,
    modality_dropout,
)


def _eeg_rows():
    return [
        {
            "time_seconds": 0.0,
            "roi": "frontal",
            "band": "alpha",
            "value": 10.0,
            "channel_coverage": 1.0,
        },
        {
            "time_seconds": 0.0,
            "roi": "frontal",
            "band": "beta",
            "value": 5.0,
            "channel_coverage": 0.8,
        },
        {
            "time_seconds": 1.0,
            "roi": "frontal",
            "band": "alpha",
            "value": 12.0,
            "channel_coverage": 1.0,
        },
    ]


def test_eeg_rows_become_stable_schema():
    series = extract_eeg_features(_eeg_rows())

    assert series.feature_names == eeg_feature_names()
    assert series.values.shape == (2, len(series.feature_names))
    assert series.timestamps_ms.tolist() == [0.0, 1000.0]
    assert series.valid_mask.tolist() == [True, True]
    assert np.isfinite(series.values).all()


def test_multimodal_windows_require_approved_sync():
    head = np.arange(12, dtype=np.float32).reshape(3, 4)
    timestamps = np.array([0.0, 500.0, 1000.0])
    eeg = extract_eeg_features(_eeg_rows())

    unapproved = build_multimodal_windows(
        head,
        timestamps,
        eeg_series=eeg,
        sync_mapping={"approved": False},
        target_fps=2,
        head_window_ms=1000,
    )
    assert unapproved.modalities_used == ("head_video",)
    assert not unapproved.eeg_present.any()
    assert not unapproved.eeg.any()

    approved = build_multimodal_windows(
        head,
        timestamps,
        eeg_series=eeg,
        sync_mapping={
            "approved": True,
            "offset_ms": 0,
            "drift_ms_per_min": 0,
        },
        target_fps=2,
        head_window_ms=1000,
    )
    assert approved.modalities_used == ("head_video", "eeg")
    assert approved.eeg_present.all()
    assert approved.eeg.shape[:2] == approved.head.shape[:2]


def test_modality_dropout_never_creates_eeg_presence():
    presence = np.array([[1.0], [0.0], [1.0], [1.0]], dtype=np.float32)
    dropped = modality_dropout(presence, probability=0.5, seed=7)

    assert dropped.shape == presence.shape
    assert dropped[1, 0] == 0.0
    assert np.all(dropped <= presence)


def test_multimodal_windows_do_not_extrapolate_eeg_outside_recording():
    head = np.arange(12, dtype=np.float32).reshape(3, 4)
    timestamps = np.array([20_000.0, 20_500.0, 21_000.0])
    eeg = extract_eeg_features(_eeg_rows())

    windows = build_multimodal_windows(
        head,
        timestamps,
        eeg_series=eeg,
        sync_mapping={"approved": True, "offset_ms": 0, "drift_ms_per_min": 0},
        target_fps=2,
        head_window_ms=1000,
    )

    assert windows.modalities_used == ("head_video",)
    assert not windows.eeg_present.any()
    assert not windows.eeg.any()
    assert not windows.eeg_valid_fraction.any()


def test_multimodal_windows_zero_only_out_of_range_eeg_points():
    head = np.arange(12, dtype=np.float32).reshape(3, 4)
    timestamps = np.array([0.0, 500.0, 1000.0])
    eeg = extract_eeg_features(_eeg_rows())

    windows = build_multimodal_windows(
        head,
        timestamps,
        eeg_series=eeg,
        sync_mapping={"approved": True, "offset_ms": 0, "drift_ms_per_min": 0},
        target_fps=2,
        head_window_ms=1000,
        eeg_window_ms=8000,
    )

    assert windows.eeg_present.all()
    assert np.all(windows.eeg_valid_fraction[:, 0] < 1.0)
    assert np.any(np.all(windows.eeg == 0.0, axis=2))


def test_multimodal_windows_do_not_bridge_large_eeg_gaps():
    head = np.arange(4, dtype=np.float32).reshape(1, 4)
    timestamps = np.array([50_000.0])
    rows = [
        {"time_seconds": 0.0, "roi": "frontal", "band": "alpha", "value": 1.0},
        {"time_seconds": 1.0, "roi": "frontal", "band": "alpha", "value": 1.0},
        {"time_seconds": 99.0, "roi": "frontal", "band": "alpha", "value": 1.0},
        {"time_seconds": 100.0, "roi": "frontal", "band": "alpha", "value": 1.0},
    ]

    windows = build_multimodal_windows(
        head,
        timestamps,
        eeg_series=extract_eeg_features(rows),
        sync_mapping={"approved": True, "offset_ms": 0, "drift_ms_per_min": 0},
        target_fps=1,
        head_window_ms=1000,
        eeg_window_ms=1000,
    )

    assert not windows.eeg_present.any()
    assert not windows.eeg.any()
