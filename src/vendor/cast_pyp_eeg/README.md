# cast-pyp-eeg

Internal, service-safe adaptation of
[palomavictoriaalves/pyp-eeg](https://github.com/palomavictoriaalves/pyp-eeg)
for the CAST backend.

The distribution intentionally uses a different name so it cannot be confused
with an official upstream release. It preserves the upstream scientific
workflow while replacing project-root globals and import-time execution with
explicit, typed functions.

```python
from cast_pyp_eeg import AnalysisConfig, run_pipeline

result = run_pipeline(
    recording_path="sub-01_task-rest_eeg.vhdr",
    output_dir="./derivatives",
    config=AnalysisConfig.pyp_eeg_v2(),
)
```

See `UPSTREAM.md` and `CHANGES.md` for provenance and adaptation details.

