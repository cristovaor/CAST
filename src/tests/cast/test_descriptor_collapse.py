import numpy as np
from cast.features.descriptors import collapse_consecutive_positives

def test_collapse_consecutive_positives():
    pred = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1])
    collapsed = collapse_consecutive_positives(pred)
    assert collapsed.tolist() == [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]
    assert collapsed.sum() == 2
