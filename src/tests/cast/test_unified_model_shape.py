from cast.config.taxonomy import (
    CONTINUOUS_SIGNALS,
    CORE_ACTIONS,
    EXPERIMENTAL_ACTIONS,
)
from cast.models.unified_classifier import build_unified_temporal_model
from cast.models.unified_training import balanced_multilabel_sample_weights

import numpy as np


def test_unified_model_has_all_output_heads():
    model = build_unified_temporal_model(
        n_features=24,
        sequence_length=31,
        compile_model=False,
    )
    shapes = {
        name: tuple(output.shape)
        for name, output in zip(model.output_names, model.outputs)
    }

    assert model.input_shape == (None, 31, 24)
    assert shapes["actions"] == (None, len(CORE_ACTIONS))
    assert shapes["observable_movements"] == (
        None,
        len(EXPERIMENTAL_ACTIONS),
    )
    assert shapes["signals"] == (None, len(CONTINUOUS_SIGNALS))


def test_multilabel_weights_upweight_rare_positive_frames():
    targets = np.zeros((10, 2), dtype=np.float32)
    targets[:5, 0] = 1.0
    targets[0, 1] = 1.0

    frame_weights, class_weights = balanced_multilabel_sample_weights(targets)

    assert class_weights[1] > class_weights[0]
    assert frame_weights[0] > frame_weights[1]
    assert frame_weights[-1] == 1.0
