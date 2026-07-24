import numpy as np
from cast.features.windowing import make_windows

def test_sliding_window_generates_n_minus_6_samples():
    X = np.random.rand(10, 200)
    y = np.zeros((10, 2))
    Xw, yw, idx = make_windows(X, y, sequence_length=7)
    assert Xw.shape[0] == 4
    assert yw.shape[0] == 4

def test_window_target_is_last_frame_label():
    y = np.array([0, 0, 0, 0, 0, 0, 1])
    y_2d = np.zeros((7, 2))
    y_2d[:, 1] = y
    
    Xw, yw, idx = make_windows(np.random.rand(7, 200), y_2d, sequence_length=7)
    assert yw[0, 1] == 1
    assert idx[0] == 6
