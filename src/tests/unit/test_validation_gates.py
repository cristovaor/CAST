import pytest

from app.domains.validation.gates import assert_participant_isolation, explorer_hci_gate, gaze_gate, pupil_gate, validate_ablation_comparability


def test_gaze_three_level_decision():
    assert gaze_gate({"median_error_deg": 2, "p95_error_deg": 5, "valid_ratio": .9, "balanced_accuracy_aoi": .85}).status == "GO"
    assert gaze_gate({"median_error_deg": 4, "p95_error_deg": 7, "valid_ratio": .8, "balanced_accuracy_aoi": .7}).status == "EXPLORATORY"
    assert gaze_gate({"median_error_deg": 6, "valid_ratio": .6}).status == "NO_GO"


def test_pupil_requires_every_stratum():
    metrics = {"mae_ratio": .02, "icc_2_1": .8, "valid_ratio": .9}
    assert pupil_gate(metrics, {"glasses": {"mae_ratio": .02, "valid_ratio": .85}}).status == "GO"
    assert pupil_gate(metrics, {"glasses": {"mae_ratio": .04, "valid_ratio": .85}}).status == "NO_GO"


def test_participant_leakage_and_ablation_drift_are_rejected():
    with pytest.raises(ValueError, match="leakage"): assert_participant_isolation({"p1"}, {"p2"}, {"p1"})
    base = {"task": "roi", "participant_splits": {"train": ["p1"]}, "hyperparameters": {"lr": .1}}
    with pytest.raises(ValueError, match="hyperparameters"): validate_ablation_comparability([base, base | {"hyperparameters": {"lr": .2}}])


def test_explorer_hci_gate():
    assert explorer_hci_gate({"minutes_saved_per_hour": 16, "error_rate_delta": 0, "sus": 72}).status == "GO"
