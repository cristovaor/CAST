"""Container smoke test for the complete scientific runtime."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from cast_pyp_eeg import (
    AnalysisConfig, Band, ROI, compute_mdmp, compute_topomaps, run_pipeline,
)


def main() -> None:
    sampling_frequency = 128.0
    time = np.arange(0, 24, 1 / sampling_frequency)
    rng = np.random.default_rng(42)
    frame = pd.DataFrame(
        {
            "time_seconds": time,
            "Fp1": 12 * np.sin(2 * np.pi * 10 * time) + rng.normal(size=len(time)),
            "Fp2": 10 * np.sin(2 * np.pi * 10 * time + 0.2) + rng.normal(size=len(time)),
            "F3": 4 * np.sin(2 * np.pi * 6 * time) + rng.normal(size=len(time)),
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
        artifacts = {item.kind: item for step in result.steps for item in step.artifacts}
        power = pd.read_csv(artifacts["power-csv"].path)
        channels = power[power["level"] == "channel"].copy()
        channels["value"] = channels["absolute_power"]
        topomaps = compute_topomaps(
            channels.to_dict("records"), root / "topomaps",
            group_columns=("band", "state"), config=config,
        )
        if not topomaps.metrics.get("topomap_count"):
            raise AssertionError(f"no topomap generated: {topomaps.warnings}")
        temporal = pd.read_csv(artifacts["timeseries-csv"].path)
        temporal["node"] = temporal["roi"].astype(str) + "::" + temporal["band"]
        mdmp = compute_mdmp(
            temporal.to_dict("records"), root / "mdmp", node_column="node", config=config,
        )
        if mdmp.metrics.get("node_count", 0) < 2:
            raise AssertionError(f"no MDMP network generated: {mdmp.warnings}")
        kinds = {
            artifact.kind
            for step in result.steps
            for artifact in step.artifacts
        }
        kinds.update(item.kind for step in (topomaps, mdmp) for item in step.artifacts)
        required = {
            "preprocessed-fif",
            "preprocessing-report",
            "power-json",
            "timeseries-index",
            "timeseries-tile",
            "topomap-png",
            "mdmp-json",
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
                    "steps": [step.kind for step in (*result.steps, topomaps, mdmp)],
                    "artifact_kinds": sorted(kinds),
                },
                sort_keys=True,
            )
        )


if __name__ == "__main__":
    main()
