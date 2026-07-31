"""Container smoke test for the complete scientific runtime."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from cast_pyp_eeg import AnalysisConfig, Band, ROI, run_pipeline


def main() -> None:
    sampling_frequency = 128.0
    time = np.arange(0, 12, 1 / sampling_frequency)
    frame = pd.DataFrame(
        {
            "time_seconds": time,
            "Fp1": 12 * np.sin(2 * np.pi * 10 * time),
            "Fp2": 10 * np.sin(2 * np.pi * 10 * time + 0.2),
            "F3": 4 * np.sin(2 * np.pi * 6 * time),
        }
    )
    with tempfile.TemporaryDirectory(prefix="cast-eeg-smoke-") as temporary:
        root = Path(temporary)
        source = root / "synthetic.csv"
        frame.to_csv(source, index=False)
        config = AnalysisConfig(
            profile="smoke",
            filter_low_hz=1.0,
            filter_high_hz=40.0,
            notch_hz=(),
            bands=(Band("theta", 4.0, 7.9), Band("alpha", 8.0, 12.9)),
            rois=(ROI("frontal", ("Fp1", "Fp2", "F3")),),
            apply_ica=False,
            random_seed=42,
        )
        result = run_pipeline(source, root / "output", config)
        kinds = {
            artifact.kind
            for step in result.steps
            for artifact in step.artifacts
        }
        required = {
            "preprocessed-fif",
            "preprocessing-report",
            "power-json",
            "timeseries-index",
            "timeseries-tile",
        }
        missing = required - kinds
        if missing:
            raise AssertionError(f"missing scientific artifacts: {sorted(missing)}")
        manifest = json.loads(
            (root / "output" / "pipeline-result.json").read_text(encoding="utf-8")
        )
        if manifest["schema"] != "eeg-result-v1":
            raise AssertionError("unexpected result schema")
        print(
            json.dumps(
                {
                    "schema": manifest["schema"],
                    "steps": [step.kind for step in result.steps],
                    "artifact_kinds": sorted(kinds),
                },
                sort_keys=True,
            )
        )


if __name__ == "__main__":
    main()
