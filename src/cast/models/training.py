import numpy as np
import tensorflow as tf
from sklearn.utils.class_weight import compute_class_weight
import yaml
from pathlib import Path

from cast.models.lstm_classifier import build_micro_action_lstm

def get_class_weights(y_train: np.ndarray) -> dict:
    y_int = np.argmax(y_train, axis=1)
    classes = np.unique(y_int)
    
    if len(classes) < 2:
        return {0: 1.0, 1: 1.0}
        
    weights = compute_class_weight(
        class_weight="balanced",
        classes=classes,
        y=y_int,
    )
    return {c: w for c, w in zip(classes, weights)}

def train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    config: dict
):
    n_features = X_train.shape[2]
    sequence_length = X_train.shape[1]
    
    model = build_micro_action_lstm(
        n_features=n_features,
        sequence_length=sequence_length,
        learning_rate=config.get("learning_rate", 0.0001054)
    )
    
    callbacks = []
    if config.get("early_stopping", True):
        callbacks.append(
            tf.keras.callbacks.EarlyStopping(
                monitor=config.get("early_stopping_monitor", "val_loss"),
                patience=config.get("early_stopping_patience", 5),
                restore_best_weights=config.get("restore_best_weights", True)
            )
        )
        
    class_weight_dict = None
    if config.get("class_weight") == "inverse_frequency":
        class_weight_dict = get_class_weights(y_train)
        
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val) if X_val.size > 0 else None,
        epochs=config.get("epochs", 40),
        batch_size=config.get("batch_size", 34),
        callbacks=callbacks,
        class_weight=class_weight_dict,
        shuffle=config.get("shuffle_train_windows", True),
        verbose=1
    )
    
    return model, history

def save_manifest(manifest_data: dict, filepath: str):
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, 'w') as f:
        yaml.dump(manifest_data, f, sort_keys=False)
