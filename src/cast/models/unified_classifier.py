"""Single-artifact multi-task temporal model for CAST Unified V7."""
from __future__ import annotations

from typing import Any

from cast.config.taxonomy import (
    CONTINUOUS_SIGNALS,
    CORE_ACTIONS,
    EXPERIMENTAL_ACTIONS,
    HEAD_TILT_DIRECTIONS,
    HORIZONTAL_DIRECTIONS,
    VERTICAL_DIRECTIONS,
)


def unified_output_heads() -> dict[str, list[str]]:
    return {
        "actions": list(CORE_ACTIONS),
        "observable_movements": list(EXPERIMENTAL_ACTIONS),
        "eye_side": [
            "closed_left",
            "closed_right",
            "squint_left",
            "squint_right",
        ],
        "brow_side": ["movement_left", "movement_right"],
        "gaze_horizontal": list(HORIZONTAL_DIRECTIONS),
        "gaze_vertical": list(VERTICAL_DIRECTIONS),
        "head_horizontal": list(HORIZONTAL_DIRECTIONS),
        "head_vertical": list(VERTICAL_DIRECTIONS),
        "head_tilt": list(HEAD_TILT_DIRECTIONS),
        "signals": list(CONTINUOUS_SIGNALS),
    }


def build_unified_temporal_model(
    n_features: int,
    sequence_length: int = 31,
    *,
    dense_units: int = 128,
    recurrent_units: tuple[int, int] = (96, 48),
    dropout: float = 0.25,
    learning_rate: float = 1e-4,
    seed: int = 42,
    compile_model: bool = True,
) -> Any:
    """Build one shared BiLSTM with independent, simultaneous output heads."""
    import tensorflow as tf
    from tensorflow.keras import Model, layers

    tf.keras.utils.set_random_seed(seed)
    inputs = layers.Input(
        shape=(sequence_length, n_features),
        name="facial_sequence",
    )
    encoded = layers.Masking(mask_value=0.0, name="missing_frame_mask")(inputs)
    encoded = layers.TimeDistributed(
        layers.Dense(dense_units, activation="relu"),
        name="frame_projection",
    )(encoded)
    encoded = layers.LayerNormalization(name="frame_normalization")(encoded)
    encoded = layers.Bidirectional(
        layers.LSTM(recurrent_units[0], return_sequences=True),
        name="temporal_context_1",
    )(encoded)
    encoded = layers.Dropout(dropout, name="temporal_dropout_1")(encoded)
    encoded = layers.Bidirectional(
        layers.LSTM(recurrent_units[1], return_sequences=False),
        name="temporal_context_2",
    )(encoded)
    shared = layers.Dense(96, activation="relu", name="shared_embedding")(encoded)
    shared = layers.Dropout(dropout, name="shared_dropout")(shared)

    heads = unified_output_heads()
    outputs = {
        "actions": layers.Dense(
            len(heads["actions"]), activation="sigmoid", name="actions"
        )(shared),
        "observable_movements": layers.Dense(
            len(heads["observable_movements"]),
            activation="sigmoid",
            name="observable_movements",
        )(shared),
        "eye_side": layers.Dense(
            len(heads["eye_side"]), activation="sigmoid", name="eye_side"
        )(shared),
        "brow_side": layers.Dense(
            len(heads["brow_side"]), activation="sigmoid", name="brow_side"
        )(shared),
        "gaze_horizontal": layers.Dense(
            len(heads["gaze_horizontal"]),
            activation="softmax",
            name="gaze_horizontal",
        )(shared),
        "gaze_vertical": layers.Dense(
            len(heads["gaze_vertical"]),
            activation="softmax",
            name="gaze_vertical",
        )(shared),
        "head_horizontal": layers.Dense(
            len(heads["head_horizontal"]),
            activation="softmax",
            name="head_horizontal",
        )(shared),
        "head_vertical": layers.Dense(
            len(heads["head_vertical"]),
            activation="softmax",
            name="head_vertical",
        )(shared),
        "head_tilt": layers.Dense(
            len(heads["head_tilt"]), activation="softmax", name="head_tilt"
        )(shared),
        "signals": layers.Dense(
            len(heads["signals"]), activation="linear", name="signals"
        )(shared),
    }
    model = Model(inputs=inputs, outputs=outputs, name="cast_unified_v7")
    if compile_model:
        binary_heads = {
            "actions",
            "observable_movements",
            "eye_side",
            "brow_side",
        }
        categorical_heads = {
            "gaze_horizontal",
            "gaze_vertical",
            "head_horizontal",
            "head_vertical",
            "head_tilt",
        }
        losses: dict[str, Any] = {
            head: tf.keras.losses.BinaryCrossentropy()
            for head in binary_heads
        }
        losses.update(
            {
                head: tf.keras.losses.CategoricalCrossentropy()
                for head in categorical_heads
            }
        )
        losses["signals"] = tf.keras.losses.Huber()
        loss_weights = {head: 1.0 for head in losses}
        loss_weights["signals"] = 0.2
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
            loss=losses,
            loss_weights=loss_weights,
        )
    return model
