import io

import pandas as pd
import pytest

from app.domains.lsl.materialization import eeg_stream_to_csv, select_eeg_stream


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
