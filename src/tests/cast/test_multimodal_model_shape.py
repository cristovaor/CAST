from cast.config.taxonomy import CONTINUOUS_SIGNALS, CORE_ACTIONS
from cast.models.multimodal_classifier import build_multimodal_temporal_model


def test_multimodal_model_accepts_masked_optional_eeg():
    model = build_multimodal_temporal_model(
        n_head_features=32,
        n_eeg_features=20,
        sequence_length=31,
        compile_model=False,
    )
    input_shapes = {
        tensor.name.split(":")[0]: tuple(tensor.shape)
        for tensor in model.inputs
    }
    output_shapes = {
        name: tuple(output.shape)
        for name, output in zip(model.output_names, model.outputs)
    }

    assert input_shapes["head_sequence"] == (None, 31, 32)
    assert input_shapes["eeg_sequence"] == (None, 31, 20)
    assert input_shapes["eeg_present"] == (None, 1)
    assert output_shapes["actions"] == (None, len(CORE_ACTIONS))
    assert output_shapes["signals"] == (None, len(CONTINUOUS_SIGNALS))
