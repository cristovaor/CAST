# CAST adaptations

- Replaced global `code/config.py` state with immutable dataclasses.
- Removed filesystem writes and pipeline execution from module imports.
- Added explicit input and output paths to every public analysis function.
- Added structured results, warnings, units, software provenance, and hashes.
- Made bands, ROIs, blocks, groups, conditions, and contrasts configurable.
- Added deterministic gzip JSON time-series tiles at full, 4× and 16×
  resolutions for API-friendly windowed reads.
- Added a thin command-line adapter over the public Python API.
- Preserved the original Pyp-EEG defaults as the named `pyp_eeg_v2` profile.
