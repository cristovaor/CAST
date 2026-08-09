from pathlib import Path

from app.db.base import Base


SRC_ROOT = Path(__file__).resolve().parents[2]


def test_new_modalities_do_not_expand_legacy_models_module():
    legacy_models = (SRC_ROOT / "app" / "db" / "models.py").read_text(
        encoding="utf-8"
    )
    forbidden = {
        "VideoCaptureRun",
        "ResearchBookmark",
        "ExperimentalTrial",
        "LSLRecording",
        "GazeCalibration",
        "PupilArtifact",
    }
    assert not (forbidden & set(legacy_models.split()))


def test_acquisition_models_register_without_session_godnode():
    tables = Base.metadata.tables
    assert "video_capture_runs" in tables
    assert "video_capture_parts" in tables
    assert "research_bookmarks" in tables
    sessions = tables["sessions"]
    forbidden_columns = {"multimodal_series", "gaze_config", "pupil_config"}
    assert forbidden_columns.isdisjoint(sessions.columns.keys())


def test_modality_domains_do_not_import_other_implementations():
    domains_root = SRC_ROOT / "app" / "domains"
    for path in domains_root.glob("*/**/*.py"):
        source = path.read_text(encoding="utf-8")
        own_domain = path.relative_to(domains_root).parts[0]
        for other in {"acquisition", "face", "context", "lsl", "gaze", "pupil"}:
            if other != own_domain:
                assert f"app.domains.{other}" not in source, path

