import math

from app.domains.gaze.processing import process_gaze


def _row(index, x, y, phase="fit", *, valid=True):
    return {
        "client_sample_id": f"{phase}-{index}", "phase": phase,
        "target_x": x, "target_y": y,
        "iris_offset_x": x * 0.2 + 0.03, "iris_offset_y": y * 0.2 - 0.02,
        "head_yaw_deg": 0.0, "head_pitch_deg": 0.0,
        "source_time_us": index * 10_000 + ({"fit": 0, "validation": 1_000_000, "drift": 2_000_000}[phase]),
        "source_clock_id": "browser-performance", "canonical_time_us": None,
        "uncertainty_us": 0, "quality_flags": [], "valid": valid,
    }


def test_calibrated_gaze_passes_and_keeps_layers_separate():
    grid = [(x, y) for y in (0.1, 0.5, 0.9) for x in (0.1, 0.5, 0.9)]
    rows = [_row(i, x, y) for i, (x, y) in enumerate(grid * 2)]
    rows += [_row(i, x, y, "validation") for i, (x, y) in enumerate(grid[:5])]
    rows += [_row(0, 0.5, 0.5, "drift")]
    result = process_gaze(rows, screen_width_px=1920, screen_height_px=1080, pixels_per_degree=40, alpha=1e-8)
    assert result.verdict == "go"
    assert len(result.proxy_rows) == len(rows)
    assert len(result.calibrated_rows) == len(rows)
    assert all(row["layer"] == "MODEL_OUTPUT" for row in result.calibrated_rows)
    assert all(row["layer"] == "FILTERED" for row in result.filtered_rows)
    assert result.metrics["median_error_deg"] <= 3


def test_failed_gate_suppresses_screen_coordinates_but_keeps_proxy():
    rows = [_row(i, (i % 3) / 2, (i // 3) / 2) for i in range(18)]
    rows += [_row(i, 0.9, 0.9, "validation", valid=i == 0) for i in range(5)]
    try:
        process_gaze(rows, screen_width_px=1920, screen_height_px=1080, pixels_per_degree=40)
    except ValueError as exc:
        assert "validation" in str(exc)
    else:
        raise AssertionError("insufficient validation should not create calibrated coordinates")
