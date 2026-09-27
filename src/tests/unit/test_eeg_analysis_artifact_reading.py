from app.workers.tasks_eeg_analysis import TIMESERIES_CSV_COLUMNS, _read_csv_result


def test_zero_byte_scientific_csv_is_read_as_schema_only_frame(tmp_path):
    path = tmp_path / "timeseries.csv"
    path.write_bytes(b"")

    frame = _read_csv_result(path, TIMESERIES_CSV_COLUMNS)

    assert frame.empty
    assert tuple(frame.columns) == TIMESERIES_CSV_COLUMNS


def test_scientific_csv_adds_missing_optional_columns(tmp_path):
    path = tmp_path / "timeseries.csv"
    path.write_text("time_seconds,roi,band,value\n1.0,frontal,alpha,2.5\n")

    frame = _read_csv_result(path, TIMESERIES_CSV_COLUMNS)

    assert len(frame) == 1
    assert frame.iloc[0]["value"] == 2.5
    assert tuple(column for column in TIMESERIES_CSV_COLUMNS if column in frame) == (
        TIMESERIES_CSV_COLUMNS
    )
