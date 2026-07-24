import numpy as np
from cast.vision.normalization import normalize_region

def test_region_normalization_maps_to_0_1():
    points = np.array([[10, 10], [20, 30], [15, 20]], dtype=float)
    normalized = normalize_region(points, mode="paper_formula")
    assert normalized.min() >= 0.0
    assert normalized.max() <= 1.0
