from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GateDecision:
    status: str
    failed: tuple[str, ...]


def assert_participant_isolation(train_ids: set[str], validation_ids: set[str], test_ids: set[str]) -> None:
    overlaps = (train_ids & validation_ids) | (train_ids & test_ids) | (validation_ids & test_ids)
    if overlaps:
        raise ValueError(f"participant leakage: {sorted(overlaps)}")


def gaze_gate(metrics: dict[str, float]) -> GateDecision:
    failed = []
    if metrics.get("median_error_deg", float("inf")) > 3: failed.append("median_error_deg")
    if metrics.get("p95_error_deg", float("inf")) > 6: failed.append("p95_error_deg")
    if metrics.get("valid_ratio", 0) < 0.85: failed.append("valid_ratio")
    if metrics.get("balanced_accuracy_aoi", 0) < 0.80: failed.append("balanced_accuracy_aoi")
    if not failed: return GateDecision("GO", ())
    if metrics.get("median_error_deg", float("inf")) <= 5 and metrics.get("valid_ratio", 0) >= 0.70:
        return GateDecision("EXPLORATORY", tuple(failed))
    return GateDecision("NO_GO", tuple(failed))


def pupil_gate(metrics: dict[str, float], strata: dict[str, dict[str, float]]) -> GateDecision:
    failed = []
    if metrics.get("mae_ratio", float("inf")) > 0.03: failed.append("mae_ratio")
    if metrics.get("icc_2_1", 0) < 0.75: failed.append("icc_2_1")
    if metrics.get("valid_ratio", 0) < 0.80: failed.append("valid_ratio")
    for name, values in strata.items():
        if values.get("valid_ratio", 0) < 0.80 or values.get("mae_ratio", float("inf")) > 0.03:
            failed.append(f"stratum:{name}")
    return GateDecision("GO" if not failed else "NO_GO", tuple(failed))


def explorer_hci_gate(metrics: dict[str, float]) -> GateDecision:
    failed = []
    if metrics.get("minutes_saved_per_hour", float("-inf")) < 15: failed.append("minutes_saved_per_hour")
    if metrics.get("error_rate_delta", float("inf")) > 0: failed.append("error_rate_delta")
    if metrics.get("sus", 0) < 70: failed.append("sus")
    return GateDecision("GO" if not failed else "NO_GO", tuple(failed))


def validate_ablation_comparability(runs: list[dict]) -> None:
    if not runs: raise ValueError("at least one ablation run is required")
    reference = {key: runs[0].get(key) for key in ("task", "participant_splits", "hyperparameters")}
    for run in runs[1:]:
        for key, expected in reference.items():
            if run.get(key) != expected: raise ValueError(f"ablation changed {key}")
