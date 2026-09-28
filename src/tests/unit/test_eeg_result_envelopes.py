import hashlib
import json
from types import SimpleNamespace
from unittest.mock import Mock

from app.api.v1 import routes_eeg_analysis as routes


def test_nonfinite_statistical_estimates_are_returned_as_null(monkeypatch):
    run = SimpleNamespace(id="run", eeg_asset_id="asset", study_id=None)
    artifact = SimpleNamespace(storage_uri="s3://bucket/stats.json")
    db = Mock()
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = artifact
    monkeypatch.setattr(routes, "_enabled", lambda: None)
    monkeypatch.setattr(routes, "_get_run", lambda *args: run)
    monkeypatch.setattr(routes, "_record_eeg_access", Mock())
    monkeypatch.setattr(routes.storage_service, "key_from_uri", lambda uri: "stats.json")
    monkeypatch.setattr(routes.storage_service, "download_bytes", lambda key: json.dumps({
        "schema": "eeg-result-v1", "results": [{"n": 2, "p": 0.5, "normality_shapiro_p": float("nan"), "cohen_d_z": float("inf")}],
    }).encode())

    response = routes.get_eeg_analysis_result("run", "stats", db=db, current_user=None)
    payload = json.loads(response.body)
    assert payload["results"] == [{"n": 2, "p": 0.5, "normality_shapiro_p": None, "cohen_d_z": None}]


def test_new_workflow_cannot_reuse_a_run_with_only_basic_outputs():
    manifest = [{"filename": "recording.csv", "checksum_sha256": "input"}]
    old_canonical = json.dumps({
        "manifest": manifest, "profile": "custom", "pipeline": "individual", "parameters": {},
        "method": "cast-pyp-eeg:2.0.1+cast.4074a2a",
    }, sort_keys=True, separators=(",", ":")).encode()
    old_digest = hashlib.sha256(old_canonical).hexdigest()
    new_digest = routes._input_hash(manifest, "custom", "individual", {})
    assert new_digest != old_digest
    assert new_digest == routes._input_hash(manifest, "custom", "individual", {})
