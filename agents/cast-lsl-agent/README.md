# CAST LSL Agent

Loopback-only bridge between the CAST web UI, LabRecorder and LSL. Configure a unique `CAST_LSL_PAIR_TOKEN`, restrict `CAST_LSL_ALLOWED_ORIGINS`, and start with `cast-lsl-agent`. The process binds only to `127.0.0.1`.

`CAST_LABRECORDER_COMMAND` must be an allowlisted LabRecorder command template containing `{output}` and may use `{streams}` for the comma-separated discovery IDs selected by CAST. Recording occurs locally; only after `/stop` is the immutable XDF uploaded through the pre-signed URL supplied by CAST. Celery never owns the long-running recording process.
