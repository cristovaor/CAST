import io

import pandas as pd
import pytest

from app.domains.lsl.materialization import (
    _auxiliary_kind,
    _prepare_eeg_stream,
    _write_auxiliary_csv,
    canonicalize_eeg_channel,
    eeg_stream_to_csv,
    select_eeg_stream,
)
from app.workers.tasks_eeg import _primary_member


def _stream(stream_type="EEG", uid="eeg-1"):
    return {
        "info": {
            "uid": [uid], "source_id": [uid], "name": ["Amplifier"],
            "type": [stream_type], "channel_count": ["2"], "nominal_srate": ["100"],
        },
        "time_series": [[1.0, 2.0], [3.0, 4.0]],
        "time_stamps": [10.0, 10.01],
    }


def test_selects_exactly_one_eeg_stream_and_preserves_lsl_time():
    stream = select_eeg_stream([_stream(), _stream("Markers", "markers")], ["eeg-1"])
    encoded, metadata = eeg_stream_to_csv(stream)
    frame = pd.read_csv(io.BytesIO(encoded))
    assert frame["timestamp_ms"].tolist() == pytest.approx([0.0, 10.0])
    assert metadata["sample_rate_hz"] == 100
    assert metadata["first_lsl_time_seconds"] == 10.0


def test_rejects_ambiguous_eeg_selection():
    with pytest.raises(ValueError, match="exactly one"):
        select_eeg_stream([_stream(uid="a"), _stream(uid="b")], [])


def test_parser_primary_member_allows_legacy_storage_fallback():
    class Member:
        def __init__(self, is_primary):
            self.is_primary = is_primary

    assert _primary_member([Member(False)]) is None
    selected = Member(True)
    assert _primary_member([Member(False), selected]) is selected

    with pytest.raises(ValueError, match="multiple primary"):
        _primary_member([Member(True), Member(True)])


def test_actichamp_ordinal_channel_names_are_canonicalized():
    assert canonicalize_eeg_channel("1FP1") == "Fp1"
    assert canonicalize_eeg_channel("2FZ") == "Fz"
    assert canonicalize_eeg_channel("32OZ") == "Oz"
    assert canonicalize_eeg_channel("AUX") == "AUX"


def test_high_rate_eeg_is_antialiased_and_resampled_to_500_hz():
    import numpy as np

    sample_count = 10_000
    stream = {
        "info": {
            "uid": ["fast"], "source_id": ["fast"], "name": ["actiCHamp"],
            "type": ["EEG"], "channel_count": ["2"], "nominal_srate": ["10000"],
            "desc": [{"channels": [{"channel": [{"label": ["1FP1"]}, {"label": ["2FZ"]}]}]}],
        },
        "time_series": np.column_stack((
            np.sin(np.arange(sample_count) / 20.0),
            np.cos(np.arange(sample_count) / 20.0),
        )),
        "time_stamps": 10.0 + np.arange(sample_count) / 10_000.0,
    }

    samples, timestamps, metadata = _prepare_eeg_stream(stream)
    assert samples.shape == (500, 2)
    assert len(timestamps) == 500
    assert metadata["sample_rate_hz"] == 500.0
    assert metadata["resampled"] is True
    assert metadata["channel_names"] == ["Fp1", "Fz"]


def test_polar_and_marker_streams_are_recognized():
    def stream(name, stream_type=""):
        return {"info": {"name": [name], "type": [stream_type]}}

    assert _auxiliary_kind(stream("HeartRate"))[0] == "heart-rate"
    assert _auxiliary_kind(stream("RRinterval"))[0] == "rr-interval"
    assert _auxiliary_kind(stream("CAST Markers", "Markers"))[0] == "markers"


def test_auxiliary_timestamps_use_the_eeg_lsl_origin(tmp_path):
    stream = {
        "time_stamps": [10.2, 10.7],
        "time_series": [[60.0], [61.0]],
    }
    target = tmp_path / "heart_rate.csv"
    metadata = _write_auxiliary_csv(
        stream,
        target,
        "heart-rate",
        origin_lsl_time_seconds=10.0,
    )

    frame = pd.read_csv(target)
    assert frame["timestamp_ms"].tolist() == pytest.approx([200.0, 700.0])
    assert metadata["alignment_origin_lsl_time_seconds"] == 10.0
