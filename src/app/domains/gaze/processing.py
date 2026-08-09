from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class GazeResult:
    proxy_rows: list[dict]
    calibrated_rows: list[dict]
    filtered_rows: list[dict]
    metrics: dict[str, float]
    verdict: str


def _features(row: dict) -> list[float]:
    x = float(row["iris_offset_x"])
    y = float(row["iris_offset_y"])
    yaw = float(row.get("head_yaw_deg") or 0.0) / 45.0
    pitch = float(row.get("head_pitch_deg") or 0.0) / 45.0
    return [1.0, x, y, yaw, pitch, x * x, y * y, x * y, x * yaw, y * pitch]


def _fit_ridge(x: np.ndarray, y: np.ndarray, alpha: float) -> np.ndarray:
    penalty = np.eye(x.shape[1]) * alpha
    penalty[0, 0] = 0.0
    return np.linalg.pinv(x.T @ x + penalty) @ x.T @ y


def _balanced_accuracy(targets: np.ndarray, predictions: np.ndarray) -> float:
    # Coarse 3x3 AOIs. Empty AOIs do not inflate the score.
    truth = np.clip((targets * 3).astype(int), 0, 2)
    pred = np.clip((predictions * 3).astype(int), 0, 2)
    truth_id = truth[:, 1] * 3 + truth[:, 0]
    pred_id = pred[:, 1] * 3 + pred[:, 0]
    recalls = [float(np.mean(pred_id[truth_id == label] == label)) for label in np.unique(truth_id)]
    return float(np.mean(recalls)) if recalls else 0.0


def process_gaze(rows: list[dict], *, screen_width_px: int, screen_height_px: int, pixels_per_degree: float, alpha: float = 1.0) -> GazeResult:
    ordered = sorted(rows, key=lambda row: row["source_time_us"])
    usable = [row for row in ordered if row.get("valid", True) and row.get("iris_offset_x") is not None and row.get("iris_offset_y") is not None]
    fit = [row for row in usable if row["phase"] == "fit"]
    validation = [row for row in usable if row["phase"] in {"validation", "drift"}]
    if len(fit) < 10 or len(validation) < 5:
        raise ValueError("gaze calibration requires at least 10 fit and 5 validation samples")
    x_fit = np.asarray([_features(row) for row in fit])
    targets_fit = np.asarray([[row["target_x"], row["target_y"]] for row in fit])
    coefficients = _fit_ridge(x_fit, targets_fit, alpha)
    x_all = np.asarray([_features(row) for row in usable])
    predictions = np.clip(x_all @ coefficients, 0.0, 1.0)
    by_id = {row["client_sample_id"]: prediction for row, prediction in zip(usable, predictions)}
    validation_predictions = np.asarray([by_id[row["client_sample_id"]] for row in validation])
    validation_targets = np.asarray([[row["target_x"], row["target_y"]] for row in validation])
    delta_px = (validation_predictions - validation_targets) * np.asarray([screen_width_px, screen_height_px])
    error_px = np.linalg.norm(delta_px, axis=1)
    error_deg = error_px / pixels_per_degree
    valid_ratio = len(usable) / max(1, len(ordered))
    median_deg = float(np.median(error_deg))
    p95_deg = float(np.percentile(error_deg, 95))
    balanced = _balanced_accuracy(validation_targets, validation_predictions)
    drift_rows = [row for row in validation if row["phase"] == "drift"]
    drift_error = []
    for row in drift_rows:
        prediction = by_id[row["client_sample_id"]]
        target = np.asarray([row["target_x"], row["target_y"]])
        drift_error.append(float(np.linalg.norm((prediction - target) * [screen_width_px, screen_height_px]) / pixels_per_degree))
    metrics = {
        "median_error_deg": median_deg,
        "p95_error_deg": p95_deg,
        "median_error_px": float(np.median(error_px)),
        "valid_ratio": float(valid_ratio),
        "balanced_accuracy_aoi": balanced,
        "drift_error_deg": float(np.median(drift_error)) if drift_error else 0.0,
    }
    if median_deg <= 3.0 and p95_deg <= 6.0 and valid_ratio >= 0.85 and balanced >= 0.80:
        verdict = "go"
    elif median_deg <= 5.0 and valid_ratio >= 0.70:
        verdict = "exploratory"
    else:
        verdict = "no_go"
    proxy_rows = [{**row, "iris_offset_proxy_x": row.get("iris_offset_x"), "iris_offset_proxy_y": row.get("iris_offset_y")} for row in ordered]
    calibrated_rows = []
    if verdict != "no_go":
        for row in usable:
            prediction = by_id[row["client_sample_id"]]
            calibrated_rows.append({**row, "gaze_x": float(prediction[0]), "gaze_y": float(prediction[1]), "layer": "MODEL_OUTPUT", "experimental": True})
    filtered_rows = []
    for index, row in enumerate(calibrated_rows):
        window = calibrated_rows[max(0, index - 2):index + 1]
        filtered_rows.append({**row, "gaze_x": float(np.median([item["gaze_x"] for item in window])), "gaze_y": float(np.median([item["gaze_y"] for item in window])), "layer": "FILTERED"})
    return GazeResult(proxy_rows, calibrated_rows, filtered_rows, metrics, verdict)
