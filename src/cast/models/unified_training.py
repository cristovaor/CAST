"""Training and high-recall calibration helpers for CAST Unified V7."""
from __future__ import annotations

from typing import Any, Mapping

import numpy as np

from cast.config.taxonomy import (
    CORE_ACTIONS,
    EXPERIMENTAL_ACTIONS,
    default_postprocessing,
)
from cast.models.unified_classifier import build_unified_temporal_model


def balanced_multilabel_sample_weights(
    targets: np.ndarray,
    *,
    maximum_positive_weight: float = 20.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Convert per-class imbalance into one Keras-compatible weight per frame."""
    if targets.ndim != 2:
        raise ValueError("multilabel targets must have shape (frames, labels)")
    positives = targets.sum(axis=0)
    negatives = len(targets) - positives
    positive_weights = np.clip(
        negatives / np.maximum(positives, 1.0),
        1.0,
        maximum_positive_weight,
    ).astype(np.float32)
    weighted_positives = targets * positive_weights.reshape(1, -1)
    per_frame = np.maximum(
        1.0,
        weighted_positives.max(axis=1, initial=1.0),
    ).astype(np.float32)
    return per_frame, positive_weights


def train_unified_model(
    X_train: np.ndarray,
    y_train: Mapping[str, np.ndarray],
    sample_weight_train: Mapping[str, np.ndarray],
    X_val: np.ndarray,
    y_val: Mapping[str, np.ndarray],
    sample_weight_val: Mapping[str, np.ndarray],
    config: Mapping[str, Any],
):
    effective_train_weights = dict(sample_weight_train)
    for head_name in ("actions", "observable_movements"):
        class_balanced, _ = balanced_multilabel_sample_weights(
            np.asarray(y_train[head_name])
        )
        existing = np.asarray(
            sample_weight_train.get(
                head_name,
                np.ones(len(class_balanced), dtype=np.float32),
            )
        )
        effective_train_weights[head_name] = existing * class_balanced

    model = build_unified_temporal_model(
        n_features=X_train.shape[2],
        sequence_length=X_train.shape[1],
        learning_rate=float(config.get("learning_rate", 1e-4)),
        dropout=float(config.get("dropout", 0.25)),
        seed=int(config.get("seed", 42)),
    )
    import tensorflow as tf

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss" if len(X_val) else "loss",
            patience=int(config.get("early_stopping_patience", 5)),
            restore_best_weights=True,
        )
    ]
    validation_data = (
        (X_val, dict(y_val), dict(sample_weight_val))
        if len(X_val)
        else None
    )
    history = model.fit(
        X_train,
        dict(y_train),
        sample_weight=effective_train_weights,
        validation_data=validation_data,
        epochs=int(config.get("epochs", 40)),
        batch_size=int(config.get("batch_size", 34)),
        callbacks=callbacks,
        shuffle=True,
        verbose=int(config.get("verbose", 1)),
    )
    return model, history


def calibrate_high_recall_thresholds(
    y_true: np.ndarray,
    y_probability: np.ndarray,
    labels: tuple[str, ...],
    *,
    target_recall: float = 0.90,
) -> tuple[dict[str, dict[str, float]], dict[str, dict[str, float]]]:
    """Choose the highest-precision threshold that still meets recall target."""
    if y_true.shape != y_probability.shape:
        raise ValueError("y_true and y_probability must have the same shape")
    if y_true.shape[1] != len(labels):
        raise ValueError("Label count does not match target matrix")
    postprocessing = default_postprocessing()
    metrics: dict[str, dict[str, float]] = {}
    candidates = np.linspace(0.05, 0.95, 91)
    for column, label in enumerate(labels):
        truth = y_true[:, column] >= 0.5
        support = int(truth.sum())
        best: tuple[float, float, float] | None = None
        for threshold in candidates:
            predicted = y_probability[:, column] >= threshold
            true_positive = int((predicted & truth).sum())
            false_positive = int((predicted & ~truth).sum())
            recall = true_positive / max(support, 1)
            precision = true_positive / max(true_positive + false_positive, 1)
            if recall >= target_recall:
                candidate = (precision, float(threshold), recall)
                if best is None or candidate > best:
                    best = candidate
        if best is None:
            # No threshold met the target; prefer maximum recall and mark the
            # resulting label as not meeting the promotion gate.
            threshold = 0.05
            predicted = y_probability[:, column] >= threshold
            true_positive = int((predicted & truth).sum())
            false_positive = int((predicted & ~truth).sum())
            recall = true_positive / max(support, 1)
            precision = true_positive / max(true_positive + false_positive, 1)
        else:
            precision, threshold, recall = best
        postprocessing[label]["enter_threshold"] = round(float(threshold), 4)
        postprocessing[label]["exit_threshold"] = round(
            max(0.01, float(threshold) * 0.8), 4
        )
        metrics[label] = {
            "support": float(support),
            "recall": round(float(recall), 4),
            "precision": round(float(precision), 4),
            "target_recall_met": float(recall >= target_recall),
            "experimental": float(
                label in EXPERIMENTAL_ACTIONS or support < 20
            ),
        }
    return postprocessing, metrics


UNIFIED_LABELS = (*CORE_ACTIONS, *EXPERIMENTAL_ACTIONS)
