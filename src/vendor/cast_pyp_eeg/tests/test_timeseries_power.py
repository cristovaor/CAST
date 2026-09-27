import json

import numpy as np
import pandas as pd

from cast_pyp_eeg import AnalysisConfig, Band, ROI, compute_timeseries_power


class _Raw:
    def __init__(self) -> None:
        self.ch_names = ["Cz"]
        self.info = {"sfreq": 64.0}
        time = np.arange(0, 8, 1 / self.info["sfreq"])
        self._data = np.sin(2 * np.pi * 10 * time)[None, :]

    def copy(self):
        return self

    def pick(self, kind):
        assert kind == "eeg"
        return self

    def get_data(self):
        return self._data


def test_empty_roi_timeseries_keeps_csv_schema_and_warning(tmp_path):
    config = AnalysisConfig(
        bands=(Band("alpha", 8.0, 12.9),),
        rois=(ROI("missing", ("Fp1", "Fp2")),),
        timeseries_window_seconds=4.0,
        timeseries_step_seconds=1.0,
    )

    result = compute_timeseries_power(_Raw(), tmp_path, config)

    csv_artifact = next(item for item in result.artifacts if item.kind == "timeseries-csv")
    frame = pd.read_csv(csv_artifact.path)
    assert frame.empty
    assert list(frame.columns) == [
        "time_seconds",
        "state",
        "channel",
        "roi",
        "band",
        "metric",
        "value",
        "channel_coverage",
    ]
    assert result.metrics["point_count"] == 0
    assert "no time-series power rows" in result.warnings[0]

    index_artifact = next(
        item for item in result.artifacts if item.kind == "timeseries-index"
    )
    index = json.loads(open(index_artifact.path, encoding="utf-8").read())
    assert index["preview"] == []
    assert index["tiles"] == []
    assert index["warnings"] == list(result.warnings)
