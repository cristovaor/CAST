from cast_pyp_eeg import AnalysisConfig
from cast_pyp_eeg.pipeline import _filename_slug


def test_profile_is_explicit_and_round_trips():
    config = AnalysisConfig.pyp_eeg_v2()
    restored = AnalysisConfig.from_dict(config.to_dict())
    assert restored.profile == "pyp_eeg_v2"
    assert restored.bands == config.bands
    assert restored.rois == config.rois
    assert restored.blocks == config.blocks


def test_configurable_labels_cannot_escape_artifact_directories():
    slug = _filename_slug("../../outside/roi:name")
    assert "/" not in slug
    assert "\\" not in slug
    assert ".." not in slug
