import json
import sys
import importlib
from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

try:
    import cast_pyp_eeg as scientific
except ModuleNotFoundError:
    # API environments omit the scientific wheel; its lightweight source is
    # sufficient for orchestration tests with mocked heavy computations.
    from vendor.cast_pyp_eeg import cast_pyp_eeg as scientific

AnalysisResult, Artifact, PipelineResult = scientific.AnalysisResult, scientific.Artifact, scientific.PipelineResult

from app.core.eeg_analysis import individual_stages
from app.schemas.eeg_analysis import EEGAnalysisRunCreate
from app.workers import tasks_eeg_analysis as worker


@pytest.fixture
def individual(monkeypatch, tmp_path):
    monkeypatch.setitem(sys.modules, "cast_pyp_eeg", scientific)
    run = SimpleNamespace(
        id="run", eeg_asset=SimpleNamespace(id="asset"), profile="custom",
        parameters={}, warnings=[], step_status={}, scope_type="session", status="running",
    )
    job = SimpleNamespace(logs=[], progress=0)
    db = Mock()
    source = tmp_path / "source.csv"
    source.write_text("fixture", encoding="utf-8")
    monkeypatch.setattr(worker, "_download_asset", lambda *args: source)
    stored = {}

    def store(db, run, *, kind, path, **kwargs):
        stored.setdefault(kind, []).append(path.read_bytes())

    monkeypatch.setattr(worker, "_store_artifact", store)

    def base_pipeline(source, output, config, *, stages):
        output.mkdir()
        results = []
        if "power" in stages:
            path = output / "power.csv"
            pd.DataFrame([
                {"state": "recording", "level": "channel", "channel": channel,
                 "roi": None, "band": band, "absolute_power": 10, "relative_power": 0.2}
                for channel in ("Fp1", "Fp2", "F3") for band in ("alpha", "theta")
            ] + [{"state": "recording", "level": "roi", "channel": None,
                  "roi": "frontal", "band": "alpha", "absolute_power": 15}]).to_csv(path, index=False)
            results.append(AnalysisResult("power", (Artifact.from_path("power-csv", path, "text/csv"),)))
        if "timeseries" in stages:
            path = output / "timeseries.csv"
            pd.DataFrame([
                {"time_seconds": time, "roi": None, "channel": channel,
                 "band": band, "value": time + 1}
                for time in range(30) for channel in ("Fp1", "Fp2") for band in ("alpha", "theta")
            ]).to_csv(path, index=False)
            results.append(AnalysisResult("timeseries", (Artifact.from_path("timeseries-csv", path, "text/csv"),)))
        result = PipelineResult.create(results)
        (output / "pipeline-result.json").write_text(json.dumps(result.to_dict()), encoding="utf-8")
        return result

    pipeline = Mock(side_effect=base_pipeline)
    monkeypatch.setattr(scientific, "run_pipeline", pipeline)

    def derived(name, kind, field, count_key, count):
        def compute(records, output, **kwargs):
            output.mkdir(parents=True)
            path = output / f"{name}.json"
            path.write_text(json.dumps({"schema": "eeg-result-v1", field: [{"id": "test"}]}))
            return AnalysisResult(name, (Artifact.from_path(kind, path, "application/json"),), {count_key: count})
        return Mock(side_effect=compute)

    topomaps = derived("topomaps", "topomaps-json", "topomaps", "topomap_count", 2)
    mdmp = derived("mdmp", "mdmp-json", "nodes", "node_count", 4)
    monkeypatch.setattr(scientific, "compute_topomaps", topomaps)
    monkeypatch.setattr(scientific, "compute_mdmp", mdmp)
    return run, job, db, stored, pipeline, topomaps, mdmp


def test_default_individual_generates_derived_artifacts_from_full_data(individual, tmp_path):
    run, job, db, stored, pipeline, topomaps, mdmp = individual
    run.parameters["power_metric"] = "relative_power"
    worker._run_individual(db, run, job, tmp_path)

    assert pipeline.call_args.kwargs["stages"] == ("preprocess", "power", "timeseries")
    maps = topomaps.call_args.args[0]
    assert len(maps) == 6  # channel rows only, never ROI aggregates
    assert {row["value"] for row in maps} == {0.2}
    assert topomaps.call_args.kwargs["group_columns"] == ("band", "state")
    observations = mdmp.call_args.args[0]
    assert len(observations) == 120  # all samples from the CSV, no preview
    assert {row["node"] for row in observations} == {"Fp1::alpha", "Fp1::theta", "Fp2::alpha", "Fp2::theta"}
    assert mdmp.call_args.kwargs["node_column"] == "node"
    assert {"topomaps-json", "mdmp-json", "stats-json", "pipeline-manifest"} <= stored.keys()
    assert run.step_status["topomaps"]["status"] == "succeeded"
    assert run.step_status["mdmp"]["status"] == "succeeded"
    stats = json.loads(stored["stats-json"][0])
    assert stats["status"] == "skipped"
    assert "estudo" in stats["reason"]
    assert not run.warnings  # expected non-applicability does not make a run partial
    manifest = json.loads(stored["pipeline-manifest"][0])
    assert [step["kind"] for step in manifest["steps"]] == ["power", "timeseries", "topomaps", "mdmp"]
    assert manifest["provenance"]["workflow_version"]


def test_topomap_failure_preserves_power_and_still_runs_mdmp(individual, tmp_path):
    run, job, db, stored, _, topomaps, mdmp = individual
    topomaps.side_effect = RuntimeError("missing positions")
    worker._run_individual(db, run, job, tmp_path)

    assert "power-csv" in stored
    assert mdmp.call_count == 1
    assert run.step_status["topomaps"]["status"] == "failed"
    assert "missing positions" in json.loads(stored["topomaps-json"][0])["reason"]
    assert run.warnings


def test_disabled_derived_steps_have_explicit_reasons(individual, tmp_path):
    run, job, db, stored, _, topomaps, mdmp = individual
    run.parameters["stages"] = ["power"]
    worker._run_individual(db, run, job, tmp_path)

    topomaps.assert_not_called()
    mdmp.assert_not_called()
    assert "desativada" in json.loads(stored["mdmp-json"][0])["reason"]
    assert not run.warnings


def test_roi_series_keep_regions_and_bands_as_distinct_nodes(individual, monkeypatch, tmp_path):
    run, job, db, _, _, _, mdmp = individual
    original = worker._read_csv_result

    def with_regions(path, columns):
        frame = original(path, columns)
        if columns == worker.TIMESERIES_CSV_COLUMNS:
            frame["roi"] = frame["channel"].map({"Fp1": "left", "Fp2": "right"})
            frame["channel"] = None
        return frame

    monkeypatch.setattr(worker, "_read_csv_result", with_regions)
    worker._run_individual(db, run, job, tmp_path)
    assert {row["node"] for row in mdmp.call_args.args[0]} == {"left::alpha", "left::theta", "right::alpha", "right::theta"}


def test_empty_timeseries_skips_mdmp_without_failing_other_results(individual, monkeypatch, tmp_path):
    run, job, db, stored, _, _, mdmp = individual
    original = worker._read_csv_result
    monkeypatch.setattr(worker, "_read_csv_result", lambda path, columns: pd.DataFrame(columns=columns) if columns == worker.TIMESERIES_CSV_COLUMNS else original(path, columns))
    worker._run_individual(db, run, job, tmp_path)

    mdmp.assert_not_called()
    assert "topomaps-json" in stored
    assert "nenhuma série" in json.loads(stored["mdmp-json"][0])["reason"]
    assert run.step_status["mdmp"]["status"] == "skipped"


def test_cancellation_during_derived_stage_propagates(individual, tmp_path):
    run, job, db, _, _, topomaps, mdmp = individual
    topomaps.side_effect = worker.EEGAnalysisCanceled()
    with pytest.raises(worker.EEGAnalysisCanceled):
        worker._run_individual(db, run, job, tmp_path)
    mdmp.assert_not_called()


def test_requested_derived_stages_enable_their_dependencies():
    assert individual_stages({"stages": ["topomaps", "mdmp"]}) == ("power", "timeseries", "topomaps", "mdmp")


@pytest.mark.parametrize("stages", ["mdmp", [], ["unknown"], [None]])
def test_api_rejects_invalid_stage_selection(stages):
    with pytest.raises(ValueError):
        EEGAnalysisRunCreate(parameters={"stages": stages})


@pytest.mark.parametrize("model_runtime", ["stub", "installed"])
def test_real_individual_pipeline_produces_topomap_images_and_mdmp_envelope(individual, monkeypatch, tmp_path, model_runtime):
    pytest.importorskip("mne")
    if model_runtime == "installed":
        pytest.importorskip("mdmp")
    import numpy as np

    run, job, db, stored, _, _, _ = individual
    core = importlib.import_module(scientific.__name__ + ".pipeline")
    for name in ("run_pipeline", "compute_topomaps", "compute_mdmp"):
        monkeypatch.setattr(scientific, name, getattr(core, name))
    time = np.arange(0, 24, 1 / 128)
    channels = ("Fp1", "Fp2", "C3", "C4", "O1", "O2")
    rng = np.random.default_rng(42)
    frame = pd.DataFrame({"time_seconds": time, **{
        channel: (10 + index) * np.sin(2 * np.pi * 10 * time + index * 0.3) + rng.normal(size=len(time))
        for index, channel in enumerate(channels)
    }})
    frame.to_csv(tmp_path / "source.csv", index=False)
    run.parameters = {"apply_ica": False, "filter_high_hz": 40, "notch_hz": [], "bands": [{"name": "alpha", "low_hz": 8, "high_hz": 12.9}]}
    matrices = []

    class MDM:
        def __init__(self, matrix, **kwargs):
            matrices.append(matrix)
            self.adj_mat = np.zeros((len(matrix.columns), len(matrix.columns)))
            self.adj_mat[0, 1] = 1

    # The model algorithm is unchanged; verify real matrix preparation and
    # serialization without requiring the optional MDMP/PyTorch runtime.
    if model_runtime == "stub":
        monkeypatch.setitem(sys.modules, "mdmp", SimpleNamespace(MDM=MDM))
    worker._run_individual(db, run, job, tmp_path)

    assert stored["topomap-png"][0].startswith(b"\x89PNG")
    assert run.step_status["topomaps"]["status"] == "succeeded"
    network = json.loads(stored["mdmp-json"][0])
    assert network["sample_count"] >= 10
    assert len(network["nodes"]) == len(channels)
    assert run.step_status["mdmp"]["status"] == "succeeded"
    assert {node["id"] for node in network["nodes"]} == {f"{channel}::alpha" for channel in channels}
    if model_runtime == "stub":
        assert len(network["edges"]) == 1
        assert set(matrices[0].columns) == {f"{channel}::alpha" for channel in channels}


def test_repeated_sessions_do_not_inflate_paired_study_sample_size(tmp_path):
    design = scientific.StudyDesign(contrasts=(scientific.Contrast("A_vs_B", "condition", "A", "B"),))
    frame = pd.DataFrame([
        {"subject": subject, "condition": condition, "band": "alpha", "roi": "frontal", "value": value}
        for subject, condition, value in [("s1", "A", 1), ("s1", "A", 3), ("s1", "B", 5), ("s2", "A", 2), ("s2", "B", 8)]
    ])
    records = worker._paired_study_rows(frame, design)
    result = scientific.compute_paired_stats(records, tmp_path, design)
    payload = json.loads((tmp_path / "stats.json").read_text())
    assert payload["results"][0]["n"] == 2
    assert payload["results"][0]["mean_a"] == 2
    assert payload["results"][0]["difference"] == 4.5


def test_single_subject_is_not_promoted_to_multiple_pairs_by_repeated_sessions(tmp_path):
    design = scientific.StudyDesign(session_pairs=(("A", "B"),))
    frame = pd.DataFrame([
        {"subject": "s1", "condition": condition, "band": "alpha", "roi": "frontal", "value": value}
        for condition, value in [("A", 1), ("A", 2), ("B", 3), ("B", 4)]
    ])
    result = scientific.compute_paired_stats(worker._paired_study_rows(frame, design), tmp_path, design)
    assert result.metrics["comparison_count"] == 0
    assert "fewer than two pairs" in result.warnings[0]


@pytest.mark.parametrize("with_design", [False, True])
def test_study_publishes_an_actionable_stats_envelope_without_rois_or_design(individual, monkeypatch, tmp_path, with_design):
    run, job, db, stored, _, topomaps, _ = individual
    run.scope_type = "study"
    run.study_id = "study"
    run.parameters = {"study_design": {"session_pairs": [["A", "B"]]}} if with_design else {}
    asset = SimpleNamespace(id="asset", session_id="session", session=SimpleNamespace(
        participant_id="subject", condition="A", participant=SimpleNamespace(group_id=None),
    ))
    db.query.return_value.join.return_value.join.return_value.filter.return_value.all.return_value = [asset]

    def preprocess(primary, output, config):
        output.mkdir(parents=True)
        path = output / "cleaned.fif"
        path.write_bytes(b"fixture")
        return AnalysisResult("preprocessing", (Artifact.from_path("preprocessed-fif", path, "application/octet-stream"),))

    def power(cleaned, output, config):
        output.mkdir(parents=True)
        path = output / "power.csv"
        pd.DataFrame([{"level": "channel", "channel": "Fp1", "band": "alpha", "absolute_power": 10}]).to_csv(path, index=False)
        return AnalysisResult("power", (Artifact.from_path("power-csv", path, "text/csv"),))

    def timeseries(cleaned, output, config):
        output.mkdir(parents=True)
        path = output / "timeseries.csv"
        pd.DataFrame(columns=worker.TIMESERIES_CSV_COLUMNS).to_csv(path, index=False)
        return AnalysisResult("timeseries", (Artifact.from_path("timeseries-csv", path, "text/csv"),))

    monkeypatch.setattr(scientific, "preprocess_recording", preprocess)
    monkeypatch.setattr(scientific, "compute_band_power", power)
    monkeypatch.setattr(scientific, "compute_timeseries_power", timeseries)
    monkeypatch.setattr(worker, "_write_study_results", Mock())
    worker._run_study(db, run, job, tmp_path)

    stats = json.loads(stored["stats-json"][0])
    assert stats["results"] == []
    assert stats["status"] == "skipped"
    assert ("ROI" if with_design else "study_design") in stats["reason"]
    assert run.step_status["stats"]["status"] == "skipped"
    assert topomaps.call_count == 1  # missing statistics does not stop topography
    assert run.step_status["mdmp"]["status"] == "skipped"


def test_unpaired_contrast_is_rejected_instead_of_silently_using_a_paired_test():
    with pytest.raises(ValueError, match="Only paired contrasts"):
        EEGAnalysisRunCreate(parameters={"study_design": {"contrasts": [{"paired": False}]}})
