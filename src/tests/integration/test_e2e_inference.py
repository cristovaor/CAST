"""Integration tests for the End-to-End Inference pipeline."""
import pytest
import pandas as pd
import numpy as np

from app.ml.inference_engine import run_full_inference
from cast.models.manifest import ModelManifest

class DummyModel:
    """Mock Keras model that always predicts class 1 (action) with high confidence."""
    def predict(self, x, **kwargs):
        # x is (batch, seq_len, features)
        batch_size = x.shape[0]
        # return (batch_size, 2) softmax probabilities
        return np.array([[0.1, 0.9]] * batch_size)

@pytest.fixture
def dummy_manifest():
    return ModelManifest(
        model_id="test-model",
        version="1.0",
        action="OF",
        feature_names=["x_norm_1", "y_norm_1", "x_norm_2", "y_norm_2"],
        feature_count=4,
        sequence_length=7,
        threshold=0.5,
        training_config={
            "epochs": 1,
            "batch_size": 1,
            "learning_rate": 0.001
        }
    )

@pytest.fixture
def dummy_landmarks():
    """Generates a dummy 10-frame normalized landmarks dataframe."""
    records = []
    # simulate 2 landmarks for "OF" action 
    # to match feature_count = 4 
    # Actually OF needs 32 landmarks. We'll bypass strict validation for mock
    for frame in range(10):
        for lm in range(32): # Need 32 to get 64 features
            records.append({
                "frame_idx": frame,
                "landmark_idx": lm,
                "x_norm": 0.5,
                "y_norm": 0.5
            })
    return pd.DataFrame(records)

def test_inference_engine_success(dummy_manifest, dummy_landmarks):
    # Adjust manifest to expect 64 features for OF
    dummy_manifest.feature_count = 64
    
    # Needs to match regions.py exact names
    from cast.features.regions import get_feature_names_for_action
    dummy_manifest.feature_names = get_feature_names_for_action("OF", "roi_features")

    models = {"OF": DummyModel()}
    manifests = {"OF": dummy_manifest}

    result = run_full_inference(
        df_norm=dummy_landmarks,
        models_by_action=models,
        manifests_by_action=manifests,
        video_id="test-vid",
        model_version="1.0",
        fps=30.0,
        actions=["OF"]
    )

    assert result.status == "success"
    assert len(result.actions) == 1
    action_res = result.actions[0]
    
    assert action_res.error is None
    # 10 frames -> with seq_len 7 -> 4 windows
    assert action_res.n_windows == 4
    
    # Since DummyModel predicts 1 always, there should be an event detected
    assert action_res.event_count == 1
    event = action_res.events[0]
    assert event.duration_ms > 0
    assert event.avg_confidence == 0.9
