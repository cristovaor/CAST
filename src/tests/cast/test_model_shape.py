import pytest
from cast.models.lstm_classifier import build_micro_action_lstm

def test_model_output_shape():
    model = build_micro_action_lstm(n_features=200)
    assert model.input_shape == (None, 7, 200)
    assert model.output_shape == (None, 2)
