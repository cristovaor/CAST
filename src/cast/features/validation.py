"""Pre-training and pre-inference data validation."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

import numpy as np
import pandas as pd

@dataclass
class ValidationReport:
    """Collects all validation results."""
    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def fail(self, msg: str) -> None:
        self.valid = False
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def __str__(self) -> str:
        lines = [f"Valid: {self.valid}"]
        if self.errors:
            lines.append("Errors:")
            lines.extend(f"  - {e}" for e in self.errors)
        if self.warnings:
            lines.append("Warnings:")
            lines.extend(f"  - {w}" for w in self.warnings)
        return "\n".join(lines)


def validate_landmark_dataframe(
    df: pd.DataFrame,
    required_columns: List[str] | None = None,
    sequence_length: int = 7,
) -> ValidationReport:
    """Validate a normalized landmarks DataFrame before feature extraction."""
    report = ValidationReport()

    base_required = ["frame_idx", "landmark_idx", "x_norm", "y_norm"]
    all_required = base_required + (required_columns or [])

    # 1. Required columns
    missing_cols = [c for c in all_required if c not in df.columns]
    if missing_cols:
        report.fail(f"Missing required columns: {missing_cols}")
        return report  

    # 2. NaN / Inf
    for col in ["x_norm", "y_norm"]:
        if df[col].isna().any():
            report.fail(f"Column '{col}' contains NaN values")
        if np.isinf(df[col].values).any():
            report.fail(f"Column '{col}' contains Inf values")

    # 3. Minimum frames
    n_frames = df["frame_idx"].nunique()
    if n_frames <= sequence_length:
        report.fail(f"Too few frames ({n_frames}) — need > {sequence_length} for windowing")

    # 4. Monotonicity of frame_idx
    frame_series = df["frame_idx"].drop_duplicates().sort_values().reset_index(drop=True)
    if not frame_series.is_monotonic_increasing:
        report.fail("frame_idx is not monotonically increasing")

    # 5. Duplicate (frame, landmark) pairs
    dup_count = df.duplicated(subset=["frame_idx", "landmark_idx"]).sum()
    if dup_count > 0:
        report.warn(f"Found {dup_count} duplicate (frame_idx, landmark_idx) rows")

    return report


def validate_feature_matrix(
    X: np.ndarray,
    expected_features: int,
    action: str,
    sequence_length: int = 7,
) -> ValidationReport:
    """Validate a feature matrix before windowing/inference."""
    report = ValidationReport()

    if X.ndim != 2:
        report.fail(f"Expected 2D matrix, got shape {X.shape}")
        return report

    n_frames, n_feats = X.shape

    if n_feats != expected_features:
        report.fail(
            f"Feature count mismatch for {action}: "
            f"expected {expected_features}, got {n_feats}"
        )

    if n_frames <= sequence_length:
        report.fail(f"Too few frames ({n_frames}) — need > {sequence_length}")

    if np.isnan(X).any():
        report.fail("Feature matrix contains NaN values")

    if np.isinf(X).any():
        report.fail("Feature matrix contains Inf values")

    return report
