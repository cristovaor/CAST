import pytest

from app.api.v1.routes_eeg import (
    _paired_permutation_test,
    _paired_window_means,
)


def test_paired_windows_use_duration_matched_pre_event_baselines():
    rows = [
        {"timestamp_ms": float(index), "alpha": float(index)}
        for index in range(10)
    ]
    action_windows = [
        {"start_ms": 2.0, "end_ms": 3.0},
        {"start_ms": 6.0, "end_ms": 8.0},
    ]
    all_windows = [
        *action_windows,
        {"start_ms": 5.0, "end_ms": 5.0},
    ]

    during, baseline, during_count, baseline_count = _paired_window_means(
        rows,
        action_windows,
        all_windows,
        "alpha",
    )

    assert during == pytest.approx([2.5, 7.0])
    assert baseline == pytest.approx([1.0, 4.0])
    assert during_count == 5
    assert baseline_count == 2


def test_paired_permutation_reports_effect_and_confidence_interval():
    p_value, cohens_dz, interval = _paired_permutation_test(
        [3.0, 5.0, 7.0, 9.0],
        [1.0, 2.0, 3.0, 4.0],
        n_perm=1000,
        n_bootstrap=1000,
        seed=7,
    )

    assert 0.0 < p_value <= 1.0
    assert cohens_dz is not None and cohens_dz > 0
    assert interval is not None
    assert interval[0] > 0


def test_paired_permutation_rejects_unpaired_inputs():
    with pytest.raises(ValueError, match="same length"):
        _paired_permutation_test([1.0, 2.0], [1.0])
