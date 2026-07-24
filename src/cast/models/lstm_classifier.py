import tensorflow as tf
from tensorflow.keras import layers, models
from typing import Tuple

def build_micro_action_lstm(
    n_features: int,
    sequence_length: int = 7,
    dense_units: int = 64,
    lstm_units: Tuple[int, int, int] = (64, 32, 16),
    n_classes: int = 2,
    learning_rate: float = 0.00010548643264689491,
    seed: int = 42,
) -> tf.keras.Model:
    """Build the canonical cast-lstm-v6 architecture.

    Architecture (v6 canonical):
        TimeDistributed(Dense(64, relu))
        → LSTM(64, return_sequences=True)
        → LSTM(32, return_sequences=True)
        → LSTM(16, return_sequences=False)
        → Dense(2, softmax)

    Args:
        n_features: Number of input features per frame.
        sequence_length: Window length (default 7 frames).
        dense_units: Units in the TimeDistributed Dense layer.
        lstm_units: Tuple with units for each of the 3 LSTM layers.
        n_classes: Output classes (2 for binary: NEUTRAL vs ACTION).
        learning_rate: Adam optimizer learning rate.
        seed: Random seed for reproducibility.

    Returns:
        Compiled Keras Sequential model.
    """
    tf.keras.utils.set_random_seed(seed)

    model = models.Sequential(name="cast_lstm_v6")
    model.add(layers.Input(shape=(sequence_length, n_features)))

    # TimeDistributed dense projects each frame to dense_units dimensions
    model.add(layers.TimeDistributed(
        layers.Dense(dense_units, activation="relu"),
        name="time_distributed_dense",
    ))

    # 3 stacked LSTM layers
    model.add(layers.LSTM(
        lstm_units[0],
        activation="relu",
        return_sequences=True,
        name="lstm_1",
    ))
    model.add(layers.LSTM(
        lstm_units[1],
        activation="relu",
        return_sequences=True,
        name="lstm_2",
    ))
    model.add(layers.LSTM(
        lstm_units[2],
        activation="relu",
        return_sequences=False,
        name="lstm_3",
    ))

    # Softmax output (NOT sigmoid — see specs v6 known issues P0)
    model.add(layers.Dense(n_classes, activation="softmax", name="output"))

    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
    model.compile(
        optimizer=optimizer,
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    return model
