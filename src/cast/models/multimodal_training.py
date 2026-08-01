"""Training helpers for the optional-EEG CAST V8 model."""
from __future__ import annotations

from typing import Any, Mapping

import numpy as np

from cast.models.multimodal_classifier import build_multimodal_temporal_model


def train_multimodal_model(
    train_inputs: Mapping[str, np.ndarray],
    y_train: Mapping[str, np.ndarray],
    sample_weight_train: Mapping[str, np.ndarray],
    val_inputs: Mapping[str, np.ndarray],
    y_val: Mapping[str, np.ndarray],
    sample_weight_val: Mapping[str, np.ndarray],
    config: Mapping[str, Any],
):
    head = train_inputs["head_sequence"]
    eeg = train_inputs["eeg_sequence"]
    model = build_multimodal_temporal_model(
        n_head_features=head.shape[2],
        n_eeg_features=eeg.shape[2],
        sequence_length=head.shape[1],
        learning_rate=float(config.get("learning_rate", 1e-4)),
        dropout=float(config.get("dropout", 0.25)),
        seed=int(config.get("seed", 42)),
    )
    import tensorflow as tf

    has_validation = len(val_inputs.get("head_sequence", ())) > 0
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss" if has_validation else "loss",
            patience=int(config.get("early_stopping_patience", 5)),
            restore_best_weights=True,
        )
    ]
    validation_data = (
        (dict(val_inputs), dict(y_val), dict(sample_weight_val))
        if has_validation
        else None
    )
    history = model.fit(
        dict(train_inputs),
        dict(y_train),
        sample_weight=dict(sample_weight_train),
        validation_data=validation_data,
        epochs=int(config.get("epochs", 40)),
        batch_size=int(config.get("batch_size", 34)),
        callbacks=callbacks,
        shuffle=True,
        verbose=int(config.get("verbose", 1)),
    )
    return model, history
