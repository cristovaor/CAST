# CAST LSL Agent

Loopback-only bridge between the CAST web UI, LabRecorder and LSL. Configure a
unique `CAST_LSL_PAIR_TOKEN`, restrict `CAST_LSL_ALLOWED_ORIGINS`, and start
with `cast-lsl-agent`. The process binds only to `127.0.0.1`.

`CAST_LABRECORDER_COMMAND` must be an allowlisted LabRecorder command template
containing `{output}` and may use `{streams}` for the comma-separated discovery
IDs selected by CAST. Recording occurs locally; only after `/stop` is the
immutable XDF uploaded through the pre-signed URL supplied by CAST. Celery
never owns the long-running recording process.

## Marker contract

`POST /marker` requires `client_event_id`, `label`, `source_time_us` and accepts
`source_clock_id` (default `browser-performance`). The ID is idempotent. The LSL
sample is compact JSON rather than a colon-delimited string:

```json
{"schema_version":"cast-marker-v1","client_event_id":"uuid","label":"CAST marker","source_time_us":123456,"source_clock_id":"browser-performance"}
```

Consumers must interpret `source_time_us` in the declared source clock and use
the approved synchronization mapping before comparing it with video or EEG
time.

## XDF materialization

The backend preserves the uploaded XDF as a `source` member and records the
derived EEG CSV, with SHA-256, as the sole `primary` member of the resulting
`EEGAsset`. Bundles with multiple primary members are rejected. Legacy assets
without a declared primary member continue to fall back to their top-level
`storage_uri`.
