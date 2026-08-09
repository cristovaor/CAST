from app.domains.pupil.processing import process_pupil


def _rows(*, luminance=True, reference=True):
    rows = []
    for index in range(20):
        ratio = 0.30 + index * 0.001
        rows.append({
            "source_time_us": index * 33_333, "source_clock_id": "video-pts",
            "canonical_time_us": None, "uncertainty_us": 0,
            "pupil_diameter_px": ratio * 100, "iris_diameter_px": 100,
            "luminance": 100 + index if luminance else None,
            "reference_ratio": ratio + 0.001 if reference else None,
            "quality_flags": [], "valid": True,
        })
    return rows


def test_pupil_preserves_raw_normalized_and_luminance_corrected_layers():
    result = process_pupil(_rows())
    assert len(result.raw) == len(result.normalized) == len(result.corrected) == 20
    assert result.metrics["luminance_corrected_available"] is True
    assert result.metrics["mae_ratio"] <= 0.03
    assert result.verdict == "go"


def test_missing_luminance_never_invents_corrected_series():
    result = process_pupil(_rows(luminance=False))
    assert result.corrected == []
    assert result.metrics["luminance_corrected_available"] is False


def test_quality_flags_remove_invalid_samples_from_scientific_series():
    rows = _rows()
    rows[0]["quality_flags"] = ["blink"]
    rows[1]["quality_flags"] = ["reflection"]
    result = process_pupil(rows)
    assert result.raw[0]["valid"] is False
    assert result.raw[1]["valid"] is False
    assert result.metrics["valid_ratio"] == 0.9
