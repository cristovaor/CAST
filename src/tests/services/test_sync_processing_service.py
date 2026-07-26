from datetime import datetime, timedelta, timezone

import pytest

from app.services.sync_processing_service import process_sync
from app.services.sync_transform_service import eeg_to_video_ms, video_to_eeg_ms


def assert_proposal(result, expected_offset, tolerance=1.0):
    assert result["outcome"] == "proposal"
    assert result["quality_grade"] in {"high", "medium", "low"}
    assert result["result"]["offset_ms"] == pytest.approx(expected_offset, abs=tolerance)


def test_absolute_timestamp_uses_positive_offset_when_eeg_starts_later():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    result = process_sync(
        "absolute_timestamp",
        {
            "video_start": start.isoformat(),
            "eeg_start": (start + timedelta(seconds=2)).isoformat(),
            "video_precision_ms": 2,
            "eeg_precision_ms": 2,
            "source": "acquisition clocks",
        },
    )
    assert_proposal(result, 2000)


def test_hardware_trigger_recovers_offset_and_drift():
    video = [1000, 5000, 9000, 13000]
    eeg = [value * 1.0001 - 250 for value in video]
    result = process_sync(
        "hardware_trigger",
        {"video_events": video, "eeg_events": eeg, "precision_ms": 1},
    )
    assert_proposal(result, 250, tolerance=0.01)
    assert result["result"]["drift_ms_per_min"] == pytest.approx(6, abs=0.01)


def test_digital_marker_matches_codes_instead_of_position():
    result = process_sync(
        "digital_marker",
        {
            "video_markers": [
                {"code": "A", "time_ms": 1000},
                {"code": "B", "time_ms": 5000},
            ],
            "eeg_markers": [
                {"code": "X", "time_ms": 10},
                {"code": "A", "time_ms": 800},
                {"code": "B", "time_ms": 4800},
            ],
            "precision_ms": 5,
        },
    )
    assert_proposal(result, 200)
    assert result["metrics"]["matched_event_count"] == 2


def test_visual_event_fits_detected_peaks():
    result = process_sync(
        "visual_event",
        {
            "visual_peaks": [1000, 4000, 7000],
            "eeg_events": [900, 3900, 6900],
            "frame_period_ms": 20,
            "sample_period_ms": 4,
            "roi": {"x": 0, "y": 0, "width": 0.2, "height": 0.2},
        },
    )
    assert_proposal(result, 100)
    assert result["metrics"]["detector"] == "opencv-luminance-peak"


def test_audio_event_correlates_real_signal_envelopes():
    video = [0.0] * 2000
    eeg = [0.0] * 2000
    for index in range(500, 550):
        video[index] = 1.0
    for index in range(300, 350):
        eeg[index] = 1.0
    result = process_sync(
        "audio_event",
        {
            "video_audio": video,
            "eeg_audio": eeg,
            "video_audio_rate_hz": 1000,
            "eeg_audio_rate_hz": 1000,
            "bin_ms": 10,
            "max_lag_ms": 1000,
        },
    )
    assert_proposal(result, 200, tolerance=10)


def test_reference_frame_converts_frame_and_sample():
    result = process_sync(
        "reference_frame",
        {
            "fps": 25,
            "sample_rate_hz": 100,
            "anchors": [
                {"video_frame": 100, "eeg_sample": 390, "label": "first"},
                {"video_frame": 200, "eeg_sample": 790, "label": "second"},
            ],
        },
    )
    assert_proposal(result, 100)


def test_manual_rejects_outlier_anchor():
    result = process_sync(
        "manual",
        {
            "uncertainty_ms": 10,
            "anchors": [
                {"video_time_ms": 1000, "eeg_time_ms": 900},
                {"video_time_ms": 5000, "eeg_time_ms": 4900},
                {"video_time_ms": 9000, "eeg_time_ms": 8900},
                {"video_time_ms": 12000, "eeg_time_ms": 500},
            ],
        },
    )
    assert_proposal(result, 100)
    assert result["metrics"]["rejected_count"] == 1


def test_event_correlation_uses_temporal_variation_not_absolute_band_threshold():
    facial = [{"start_time": 2.0, "confidence_mean": 1.0}]
    rows = []
    for timestamp in range(0, 6000, 250):
        value = 10.0
        if 1000 <= timestamp <= 1250:
            value = 40.0
        rows.append({"timestamp_ms": timestamp, "alpha": value, "beta": value / 2})
    result = process_sync(
        "event_correlation",
        {"facial_events": facial, "eeg_rows": rows, "bin_ms": 250, "max_lag_ms": 3000},
    )
    assert result["outcome"] == "proposal"
    assert result["result"]["offset_ms"] == pytest.approx(1000, abs=500)


def test_informed_offset_requires_provenance_and_normalises_units():
    result = process_sync(
        "informed_offset",
        {
            "offset": 0.25,
            "unit": "s",
            "uncertainty_ms": 15,
            "source": "acquisition notebook",
            "justification": "Delay measured before collection",
        },
    )
    assert_proposal(result, 250)
    missing = process_sync("informed_offset", {"offset": 10, "uncertainty_ms": 5})
    assert missing["outcome"] == "insufficient_evidence"


def test_semi_automatic_refits_base_with_human_anchor():
    result = process_sync(
        "semi_automatic",
        {
            "base_result": {
                "offset_ms": 100,
                "drift_ms_per_min": 0,
                "uncertainty_ms": 50,
            },
            "duration_ms": 10000,
            "anchors": [
                {"label": "review", "video_time_ms": 5000, "eeg_time_ms": 4900}
            ],
        },
    )
    assert_proposal(result, 100)
    assert result["metrics"]["review_anchor_count"] == 1


def test_transform_round_trip_uses_canonical_sign_and_drift():
    mapping = {"offset_ms": 2000, "drift_ms_per_min": 6}
    eeg_ms = video_to_eeg_ms(10000, mapping)
    assert eeg_ms == pytest.approx(8001)
    assert eeg_to_video_ms(eeg_ms, mapping) == pytest.approx(10000)
