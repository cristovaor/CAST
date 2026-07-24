from cast.config.landmarks import get_points, DEFAULT_100_POINT_REGIONS

def test_default_100_points_has_expected_size():
    points = get_points(DEFAULT_100_POINT_REGIONS)
    assert len(points) == 100
    assert len(set(points)) == 100
