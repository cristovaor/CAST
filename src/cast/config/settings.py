from pathlib import Path

# ---------------------------------------------------------------------------
# Directory layout
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"
REPORTS_DIR = ROOT_DIR / "reports"

# ---------------------------------------------------------------------------
# Feature extraction modes
# ---------------------------------------------------------------------------
FEATURE_MODE_STRICT = "strict_fig49"   # All 100 points (paper)
FEATURE_MODE_ROI = "roi_features"      # Action-specific regions (v6 canonical)

# ---------------------------------------------------------------------------
# Normalization modes
# ---------------------------------------------------------------------------
NORMALIZATION_MODE_PAPER = "paper_formula"
NORMALIZATION_MODE_CENTERED = "centered"

# ---------------------------------------------------------------------------
# Pipeline constants
# ---------------------------------------------------------------------------
MIN_FACE_DETECTION_RATE: float = 0.95
SEQUENCE_LENGTH: int = 7

# ---------------------------------------------------------------------------
# Model architecture defaults (v6 canonical)
# ---------------------------------------------------------------------------
DEFAULT_LSTM_DENSE_UNITS: int = 64
DEFAULT_LSTM_UNITS = (64, 32, 16)   # Fixed from (32, 16, 16) per specs v6
DEFAULT_LEARNING_RATE: float = 0.00010548643264689491

# ---------------------------------------------------------------------------
# Training configuration
# ---------------------------------------------------------------------------
TRAINING_CONFIG = {
    "epochs": 40,
    "batch_size": 34,
    "learning_rate": DEFAULT_LEARNING_RATE,
    "optimizer": "adam",
    "early_stopping": True,
    "early_stopping_monitor": "val_loss",
    "early_stopping_patience": 5,
    "restore_best_weights": True,
    "class_weight": "inverse_frequency",
    "shuffle_train_windows": True,
    "seed": 42,
    "label_policy": "last_frame_in_window",  # corrected from next_frame_after_window
}
