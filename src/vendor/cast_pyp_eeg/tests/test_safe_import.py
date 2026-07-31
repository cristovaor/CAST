import json
import os
from pathlib import Path
import subprocess
import sys


def test_import_has_no_scientific_import_or_filesystem_side_effects(tmp_path):
    script = """
import json, os, sys
before = set(os.listdir('.'))
import cast_pyp_eeg
after = set(os.listdir('.'))
print(json.dumps({
    "new_files": sorted(after - before),
    "heavy": sorted(name for name in ("mne", "mne_icalabel", "mdmp") if name in sys.modules),
    "version": cast_pyp_eeg.__version__,
}))
"""
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
    completed = subprocess.run(
        [sys.executable, "-c", script],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    result = json.loads(completed.stdout)
    assert result["new_files"] == []
    assert result["heavy"] == []
    assert result["version"] == "2.0.0+cast.4074a2a"
