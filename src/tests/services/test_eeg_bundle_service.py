import hashlib
import io
import zipfile

import pytest

from app.services.eeg_bundle_service import (
    safe_bundle_name,
    validate_bids_zip,
    validate_brainvision_references,
)


def _zip(entries: dict[str, bytes]) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return stream.getvalue()


def test_rejects_bundle_and_zip_path_traversal():
    with pytest.raises(ValueError):
        safe_bundle_name("../recording.edf")
    malicious = _zip(
        {
            "dataset_description.json": b"{}",
            "../outside.edf": b"not-an-edf",
        }
    )
    with pytest.raises(ValueError, match="unsafe ZIP"):
        validate_bids_zip(malicious)


def test_brainvision_bundle_requires_referenced_files():
    header = b"Brain Vision Data Exchange Header File Version 1.0\nDataFile=subject.eeg\nMarkerFile=subject.vmrk\n"
    with pytest.raises(ValueError, match="missing bundle file"):
        validate_brainvision_references({"subject.vhdr": header})
    validate_brainvision_references(
        {
            "subject.vhdr": header,
            "subject.eeg": b"\x00\x00",
            "subject.vmrk": b"Brain Vision Data Exchange Marker File",
        }
    )


def test_minimal_bids_zip_is_accepted():
    payload = _zip(
        {
            "dataset_description.json": b'{"Name":"fixture","BIDSVersion":"1.9.0"}',
            "sub-01/eeg/sub-01_task-rest_eeg.edf": b"fixture",
        }
    )
    result = validate_bids_zip(payload)
    assert result["member_count"] == 2
    assert result["uncompressed_bytes"] > 0


def test_bids_zip_validates_brainvision_references_in_same_directory():
    header = (
        b"Brain Vision Data Exchange Header File Version 1.0\n"
        b"DataFile=recording.eeg\nMarkerFile=recording.vmrk\n"
    )
    incomplete = _zip(
        {
            "dataset_description.json": b"{}",
            "sub-01/eeg/recording.vhdr": header,
            "sub-01/eeg/recording.vmrk": b"Brain Vision Data Exchange Marker File",
        }
    )
    with pytest.raises(ValueError, match="missing ZIP member"):
        validate_bids_zip(incomplete)

    complete = _zip(
        {
            "dataset_description.json": b"{}",
            "sub-01/eeg/recording.vhdr": header,
            "sub-01/eeg/recording.eeg": b"\x00\x00",
            "sub-01/eeg/recording.vmrk": b"Brain Vision Data Exchange Marker File",
        }
    )
    assert validate_bids_zip(complete)["member_count"] == 4
