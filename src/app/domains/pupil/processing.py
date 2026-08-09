from __future__ import annotations

from dataclasses import dataclass

import numpy as np


INVALID_FLAGS = {"blink", "occlusion", "reflection", "blur", "extreme_pose"}


@dataclass(frozen=True)
class PupilResult:
    raw: list[dict]
    normalized: list[dict]
    corrected: list[dict]
    metrics: dict[str, float | bool]
    verdict: str


def segment_pupil_roi(gray_roi) -> dict | None:
    """Fit an ellipse to the darkest stable contour in an already stabilized eye ROI."""
    import cv2
    image = np.asarray(gray_roi)
    if image.ndim == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    image = cv2.GaussianBlur(image, (5, 5), 0)
    threshold = float(np.percentile(image, 25))
    _, mask = cv2.threshold(image, threshold, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    candidates = [contour for contour in contours if len(contour) >= 5 and cv2.contourArea(contour) >= 8]
    if not candidates:
        return None
    contour = max(candidates, key=cv2.contourArea)
    (cx, cy), (major, minor), angle = cv2.fitEllipse(contour)
    return {"center_x": float(cx), "center_y": float(cy), "major_px": float(max(major, minor)), "minor_px": float(min(major, minor)), "diameter_px": float((major + minor) / 2), "angle_deg": float(angle)}


def _icc21(measured: np.ndarray, reference: np.ndarray) -> float:
    data = np.column_stack([measured, reference])
    n, k = data.shape
    if n < 2:
        return 0.0
    row_means = data.mean(axis=1)
    col_means = data.mean(axis=0)
    grand = data.mean()
    ms_rows = k * np.sum((row_means - grand) ** 2) / (n - 1)
    ms_cols = n * np.sum((col_means - grand) ** 2) / (k - 1)
    residual = np.sum((data - row_means[:, None] - col_means[None, :] + grand) ** 2)
    ms_error = residual / ((n - 1) * (k - 1))
    denominator = ms_rows + (k - 1) * ms_error + k * (ms_cols - ms_error) / n
    return float((ms_rows - ms_error) / denominator) if denominator else 0.0


def process_pupil(rows: list[dict], *, baseline_fraction: float = 0.2) -> PupilResult:
    raw = []
    for row in rows:
        flags = set(row.get("quality_flags") or [])
        diameter = row.get("pupil_diameter_px")
        iris = row.get("iris_diameter_px")
        valid = bool(row.get("valid", True) and diameter and iris and not (flags & INVALID_FLAGS))
        ratio = float(diameter / iris) if valid else None
        raw.append({**row, "valid": valid, "pupil_ratio": ratio, "layer": "RAW"})
    valid_rows = [row for row in raw if row["valid"]]
    if not valid_rows:
        raise ValueError("no valid pupil observations")
    baseline_count = max(1, round(len(valid_rows) * baseline_fraction))
    baseline = float(np.median([row["pupil_ratio"] for row in valid_rows[:baseline_count]]))
    normalized = []
    previous = None
    for row in raw:
        normalized_ratio = row["pupil_ratio"] / baseline if row["valid"] else None
        velocity = None
        if previous and normalized_ratio is not None:
            dt = (row["source_time_us"] - previous["source_time_us"]) / 1_000_000
            if dt > 0: velocity = (normalized_ratio - previous["pupil_normalized"]) / dt
        item = {**row, "pupil_normalized": normalized_ratio, "velocity_per_s": velocity, "baseline_ratio": baseline, "layer": "DERIVED"}
        normalized.append(item)
        if normalized_ratio is not None: previous = item
    luminance_rows = [row for row in normalized if row["valid"] and row.get("luminance") is not None]
    corrected = []
    if len(luminance_rows) == len(valid_rows):
        luminance = np.asarray([float(row["luminance"]) for row in luminance_rows])
        values = np.asarray([float(row["pupil_normalized"]) for row in luminance_rows])
        design = np.column_stack([np.ones(len(luminance)), luminance])
        coefficients = np.linalg.pinv(design) @ values
        for row in normalized:
            if row["valid"]:
                correction = coefficients[1] * (float(row["luminance"]) - float(np.mean(luminance)))
                corrected.append({**row, "pupil_luminance_corrected": float(row["pupil_normalized"] - correction), "layer": "FILTERED"})
    valid_ratio = len(valid_rows) / len(raw)
    references = [row for row in valid_rows if row.get("reference_ratio") is not None]
    mae = float(np.mean([abs(row["pupil_ratio"] - row["reference_ratio"]) for row in references])) if references else float("nan")
    icc = _icc21(np.asarray([row["pupil_ratio"] for row in references]), np.asarray([row["reference_ratio"] for row in references])) if len(references) >= 2 else float("nan")
    values = [row["pupil_normalized"] for row in normalized if row["pupil_normalized"] is not None]
    peak_index = int(np.argmax(values))
    metrics = {"valid_ratio": float(valid_ratio), "baseline_ratio": baseline, "peak": float(values[peak_index]), "time_to_peak_us": int(valid_rows[peak_index]["source_time_us"] - valid_rows[0]["source_time_us"]), "auc": float(np.trapezoid(values)), "luminance_corrected_available": bool(corrected), "mae_ratio": mae, "icc_2_1": icc}
    verdict = "go" if references and mae <= 0.03 and icc >= 0.75 and valid_ratio >= 0.80 else "audit_only"
    return PupilResult(raw, normalized, corrected, metrics, verdict)
