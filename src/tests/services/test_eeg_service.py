from app.services.eeg_service import parse_eeg, format_from_filename


def _csv_bytes(rows: list[dict]) -> bytes:
    cols = list(rows[0].keys())
    lines = [",".join(cols)]
    for r in rows:
        lines.append(",".join(str(r[c]) for c in cols))
    return "\n".join(lines).encode("utf-8")


def test_format_from_filename_detects_known_extensions():
    assert format_from_filename("rec.edf") == "EDF"
    assert format_from_filename("rec.bdf") == "BDF"
    assert format_from_filename("rec.vhdr") == "BrainVision"
    assert format_from_filename("rec.fif") == "FIF"
    assert format_from_filename("rec.set") == "EEGLAB"
    assert format_from_filename("rec.csv") == "CSV"
    assert format_from_filename("rec.weird") == "proprietary"
    assert format_from_filename(None) == "CSV"


def test_parse_eeg_csv_detects_channels_and_sample_rate():
    # 16 samples spanning 3750ms at a 250ms step -> (16-1) samples / 3.75s = 4 Hz.
    rows = [{"timestamp_ms": t, "Fp1": 10.0, "Cz": 12.0} for t in range(0, 4000, 250)]
    data = _csv_bytes(rows)
    report = parse_eeg(data, "recording.csv")

    assert report["parser"] == "csv"
    assert report["eeg_format"] == "CSV"
    assert set(report["channel_names"]) == {"Fp1", "Cz"}
    assert report["sample_rate_hz"] == 4.0


def test_parse_eeg_csv_flags_flat_channel():
    # Cz never varies -> flat; Fp1 varies normally.
    rows = []
    for i, t in enumerate(range(0, 2000, 250)):
        rows.append({"timestamp_ms": t, "Fp1": 10.0 + (i % 3), "Cz": 5.0})
    data = _csv_bytes(rows)
    report = parse_eeg(data, "recording.csv")

    by_name = {c["name"]: c for c in report["channel_quality"]}
    assert by_name["Cz"]["status"] == "flat"
    assert by_name["Fp1"]["status"] == "good"
    # A flat channel is a "danger" finding and must push the verdict to review.
    assert report["quality_verdict"] == "review_required"
    assert any(f["issue"].startswith("Canal plano") for f in report["quality_findings"])


def test_parse_eeg_csv_flags_noisy_channel_from_artifacts():
    # Most Fp2 samples exceed the 150 uV artifact threshold.
    rows = []
    for i, t in enumerate(range(0, 4000, 250)):
        rows.append({"timestamp_ms": t, "Fp2": 500.0 if i % 4 != 0 else 10.0})
    data = _csv_bytes(rows)
    report = parse_eeg(data, "recording.csv")

    ch = report["channel_quality"][0]
    assert ch["name"] == "Fp2"
    assert ch["status"] == "noisy"
    assert ch["valid_ratio"] < 0.6


def test_parse_eeg_csv_approves_clean_signal():
    # Smooth sine-like variation, all well within the artifact threshold and
    # with many distinct values, so neither the flat nor the noisy check fires.
    import math
    rows = [
        {"timestamp_ms": t, "Fp1": 10.0 + math.sin(t / 200.0), "Cz": 8.0 + math.cos(t / 150.0)}
        for t in range(0, 4000, 50)
    ]
    data = _csv_bytes(rows)
    report = parse_eeg(data, "clean.csv")

    assert report["quality_verdict"] == "approved"
    assert report["quality_findings"] == []
    assert report["valid_ratio"] == 1.0
