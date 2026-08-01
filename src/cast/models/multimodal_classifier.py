"""Quality-aware head-video + EEG temporal model for CAST V8."""
from __future__ import annotations

from typing import Any

from cast.models.unified_classifier import unified_output_heads


def _attention_block(layers: Any, values: Any, *, heads: int, key_dim: int, name: str):
    attended = layers.MultiHeadAttention(
        num_heads=heads,
        key_dim=key_dim,
        dropout=0.1,
        name=f"{name}_attention",
    )(values, values)
    values = layers.LayerNormalization(name=f"{name}_attention_norm")(
        values + attended
    )
    feed_forward = layers.Dense(
        int(values.shape[-1]) * 2,
        activation="gelu",
        name=f"{name}_ffn_expand",
    )(values)
    feed_forward = layers.Dense(
        int(values.shape[-1]),
        name=f"{name}_ffn_project",
    )(feed_forward)
    return layers.LayerNormalization(name=f"{name}_ffn_norm")(
        values + feed_forward
    )


def build_multimodal_temporal_model(
    n_head_features: int,
    n_eeg_features: int,
    sequence_length: int = 31,
    *,
    hidden_units: int = 96,
    dropout: float = 0.25,
    learning_rate: float = 1e-4,
    seed: int = 42,
    compile_model: bool = True,
) -> Any:
    """Build a shared multi-task model that remains valid without EEG."""
    import tensorflow as tf
    from tensorflow.keras import Model, layers

    tf.keras.utils.set_random_seed(seed)
    head_input = layers.Input(
        shape=(sequence_length, n_head_features),
        name="head_sequence",
    )
    eeg_input = layers.Input(
        shape=(sequence_length, n_eeg_features),
        name="eeg_sequence",
    )
    eeg_present = layers.Input(shape=(1,), name="eeg_present")

    head = layers.Conv1D(
        hidden_units,
        3,
        padding="same",
        activation="gelu",
        name="head_local_motion",
    )(head_input)
    head = _attention_block(
        layers,
        head,
        heads=4,
        key_dim=max(8, hidden_units // 4),
        name="head_temporal",
    )
    head = layers.GlobalAveragePooling1D(name="head_pool")(head)
    head = layers.Dense(hidden_units, activation="gelu", name="head_embedding")(head)

    eeg = layers.Conv1D(
        hidden_units // 2,
        3,
        padding="same",
        activation="gelu",
        name="eeg_local_context",
    )(eeg_input)
    eeg = _attention_block(
        layers,
        eeg,
        heads=2,
        key_dim=max(8, hidden_units // 4),
        name="eeg_temporal",
    )
    eeg = layers.GlobalAveragePooling1D(name="eeg_pool")(eeg)
    eeg = layers.Dense(hidden_units, activation="gelu", name="eeg_embedding")(eeg)
    eeg = layers.Multiply(name="eeg_presence_mask")([eeg, eeg_present])

    gate_input = layers.Concatenate(name="fusion_gate_input")(
        [head, eeg, eeg_present]
    )
    gate = layers.Dense(1, activation="sigmoid", name="eeg_fusion_gate")(gate_input)
    gated_eeg = layers.Multiply(name="gated_eeg")([eeg, gate])
    fused = layers.Concatenate(name="multimodal_embedding")([head, gated_eeg])
    fused = layers.Dense(hidden_units, activation="gelu", name="shared_embedding")(
        fused
    )
    fused = layers.Dropout(dropout, name="shared_dropout")(fused)

    heads = unified_output_heads()
    outputs = {
        "actions": layers.Dense(
            len(heads["actions"]), activation="sigmoid", name="actions"
        )(fused),
        "observable_movements": layers.Dense(
            len(heads["observable_movements"]),
            activation="sigmoid",
            name="observable_movements",
        )(fused),
        "eye_side": layers.Dense(
            len(heads["eye_side"]), activation="sigmoid", name="eye_side"
        )(fused),
        "brow_side": layers.Dense(
            len(heads["brow_side"]), activation="sigmoid", name="brow_side"
        )(fused),
        "gaze_horizontal": layers.Dense(
            len(heads["gaze_horizontal"]),
            activation="softmax",
            name="gaze_horizontal",
        )(fused),
        "gaze_vertical": layers.Dense(
            len(heads["gaze_vertical"]),
            activation="softmax",
            name="gaze_vertical",
        )(fused),
        "head_horizontal": layers.Dense(
            len(heads["head_horizontal"]),
            activation="softmax",
            name="head_horizontal",
        )(fused),
        "head_vertical": layers.Dense(
            len(heads["head_vertical"]),
            activation="softmax",
            name="head_vertical",
        )(fused),
        "head_tilt": layers.Dense(
            len(heads["head_tilt"]), activation="softmax", name="head_tilt"
        )(fused),
        "signals": layers.Dense(
            len(heads["signals"]), activation="linear", name="signals"
        )(fused),
    }
    model = Model(
        inputs={
            "head_sequence": head_input,
            "eeg_sequence": eeg_input,
            "eeg_present": eeg_present,
        },
        outputs=outputs,
        name="cast_multimodal_v8",
    )
    if compile_model:
        binary = {"actions", "observable_movements", "eye_side", "brow_side"}
        categorical = {
            "gaze_horizontal",
            "gaze_vertical",
            "head_horizontal",
            "head_vertical",
            "head_tilt",
        }
        losses: dict[str, Any] = {
            name: tf.keras.losses.BinaryCrossentropy() for name in binary
        }
        losses.update(
            {
                name: tf.keras.losses.CategoricalCrossentropy()
                for name in categorical
            }
        )
        losses["signals"] = tf.keras.losses.Huber()
        loss_weights = {name: 1.0 for name in losses}
        loss_weights["signals"] = 0.2
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
            loss=losses,
            loss_weights=loss_weights,
        )
    return model
