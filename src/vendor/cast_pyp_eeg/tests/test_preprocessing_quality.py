import numpy as np

from cast_pyp_eeg.pipeline import _signal_quality_snapshot


class _Raw:
    def __init__(self):
        self.ch_names = ["Fp1", "Cz"]
        self._data = np.asarray(
            [
                [0.0, 100.0, 500.0, 100.0],
                [10.0, 20.0, 30.0, 20.0],
            ]
        ) * 1e-6

    def copy(self):
        return self

    def pick(self, kind):
        assert kind == "eeg"
        return self

    def get_data(self):
        return self._data


def test_signal_quality_snapshot_preserves_channel_evidence():
    snapshot = _signal_quality_snapshot(_Raw(), threshold_uv=150.0)

    assert snapshot["overall_valid_ratio"] == 0.875
    assert snapshot["channels"][0]["name"] == "Fp1"
    assert snapshot["channels"][0]["valid_ratio"] == 0.75
    assert snapshot["channels"][1]["valid_ratio"] == 1.0
    assert snapshot["p95_abs_centered_uv"] > 150.0
