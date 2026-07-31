from __future__ import annotations

import hashlib
import gzip
import json
import logging
import mimetypes
import re
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any

from celery.exceptions import SoftTimeLimitExceeded

from app.db.models import (
    EEGAnalysisArtifact,
    EEGAnalysisRun,
    EEGAsset,
    JobStatus,
    Participant,
    ProcessingJob,
    Session as SessionModel,
)
from app.db.session import SessionLocal
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app


logger = logging.getLogger(__name__)
RECORDING_SUFFIXES = (".vhdr", ".edf", ".bdf", ".fif", ".set", ".csv")


class EEGAnalysisCanceled(Exception):
    pass


def _log(job: ProcessingJob, message: str, level: str = "info") -> None:
    job.logs = [
        *(job.logs or []),
        {"timestamp": datetime.utcnow().isoformat(), "level": level, "message": message},
    ]


def _stage(
    db: Any,
    run: EEGAnalysisRun,
    job: ProcessingJob,
    name: str,
    progress: float,
    status: str = "running",
) -> None:
    db.refresh(run)
    if run.status == "canceled":
        raise EEGAnalysisCanceled("EEG analysis canceled by user")
    run.step_status = {
        **(run.step_status or {}),
        name: {"status": status, "at": datetime.utcnow().isoformat()},
    }
    job.progress = progress
    _log(job, name)
    db.commit()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _filename_slug(value: Any) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value)).strip("._")
    return slug[:80] or "unnamed"


def _download_asset(asset: EEGAsset, root: Path) -> Path:
    source = root / str(asset.id) / "source"
    source.mkdir(parents=True, exist_ok=True)
    primary: Path | None = None
    files = list(asset.files)
    if not files and asset.storage_uri:
        target = source / (asset.filename or "recording.csv")
        target.write_bytes(
            storage_service.download_bytes(storage_service.key_from_uri(asset.storage_uri))
        )
        return target
    for member in files:
        relative = PurePosixPath(member.filename.replace("\\", "/"))
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or ":" in member.filename
            or len(relative.parts) != 1
        ):
            raise ValueError(f"unsafe EEG bundle filename {member.filename!r}")
        target = source / relative.name
        data = storage_service.download_bytes(
            storage_service.key_from_uri(member.storage_uri)
        )
        if member.size_bytes and len(data) != member.size_bytes:
            raise ValueError(f"size mismatch for EEG bundle file {member.filename!r}")
        if (
            member.checksum_sha256
            and member.checksum_sha256 != "legacy-unverified"
            and hashlib.sha256(data).hexdigest() != member.checksum_sha256.lower()
        ):
            raise ValueError(f"checksum mismatch for EEG bundle file {member.filename!r}")
        target.write_bytes(data)
        if member.is_primary:
            primary = target
    if primary is None:
        raise ValueError(f"EEG asset {asset.id} has no primary bundle file")
    if primary.suffix.lower() == ".zip":
        extracted = source / "bids"
        extracted.mkdir()
        with zipfile.ZipFile(primary) as archive:
            for member in archive.infolist():
                path = PurePosixPath(member.filename.replace("\\", "/"))
                if member.is_dir():
                    continue
                if path.is_absolute() or ".." in path.parts or ":" in member.filename:
                    raise ValueError(f"unsafe ZIP path {member.filename!r}")
                target = extracted.joinpath(*path.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as input_stream, target.open("wb") as output_stream:
                    shutil.copyfileobj(input_stream, output_stream)
        candidates = sorted(
            (
                path
                for path in extracted.rglob("*")
                if path.is_file() and path.suffix.lower() in RECORDING_SUFFIXES
            ),
            key=lambda path: RECORDING_SUFFIXES.index(path.suffix.lower()),
        )
        if not candidates:
            raise ValueError("BIDS ZIP contains no supported EEG recording")
        primary = candidates[0]
    return primary


def _analysis_config(profile: str, parameters: dict[str, Any]) -> Any:
    from cast_pyp_eeg import AnalysisConfig

    defaults = (
        AnalysisConfig.pyp_eeg_v2().to_dict()
        if profile == "pyp_eeg_v2"
        else AnalysisConfig().to_dict()
    )
    allowed = set(defaults)
    overrides = {
        key: value
        for key, value in parameters.items()
        if key in allowed and key not in {"profile"}
    }
    defaults.update(overrides)
    defaults["profile"] = profile
    return AnalysisConfig.from_dict(defaults)


def _store_artifact(
    db: Any,
    run: EEGAnalysisRun,
    *,
    kind: str,
    path: Path,
    content_type: str | None = None,
    units: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> EEGAnalysisArtifact:
    data = path.read_bytes()
    checksum = hashlib.sha256(data).hexdigest()
    key = (
        f"eeg/{run.eeg_asset_id or 'studies/' + str(run.study_id)}"
        f"/analyses/{run.id}/{kind}/{checksum[:12]}-{path.name}"
    )
    mime = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if not storage_service.upload_bytes(key, data, mime):
        raise RuntimeError(f"could not upload analysis artifact {path.name}")
    artifact = EEGAnalysisArtifact(
        run_id=run.id,
        kind=kind,
        storage_uri=f"s3://{storage_service.bucket_name}/{key}",
        content_type=mime,
        size_bytes=len(data),
        checksum_sha256=checksum,
        units=units,
        metadata_info=metadata or {},
    )
    db.add(artifact)
    db.commit()
    return artifact


def _store_result(db: Any, run: EEGAnalysisRun, result: Any) -> None:
    for artifact in result.artifacts:
        _store_artifact(
            db,
            run,
            kind=artifact.kind,
            path=Path(artifact.path),
            content_type=artifact.content_type,
            units=artifact.units,
            metadata=dict(artifact.metadata),
        )


def _write_study_results(
    db: Any,
    run: EEGAnalysisRun,
    root: Path,
    power_frame: Any,
    timeseries_frame: Any,
    config: Any,
) -> None:
    """Materialize public study envelopes and multiresolution time-series tiles."""
    power_records = json.loads(power_frame.to_json(orient="records"))
    power_json = root / "study-power.json"
    power_json.write_text(
        json.dumps(
            {
                "schema": "eeg-result-v1",
                "scope": "study",
                "units": {
                    "absolute_power": "uV^2",
                    "relative_power": "ratio",
                    "psd": "uV^2/Hz",
                },
                "power": power_records,
                "provenance": {
                    "profile": config.profile,
                    "configuration": config.to_dict(),
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    _store_artifact(
        db,
        run,
        kind="power-json",
        path=power_json,
        content_type="application/json",
        units="uV^2",
    )

    frame = timeseries_frame.copy()
    frame["scope"] = frame["roi"].where(frame["roi"].notna(), frame.get("channel"))
    frame["tile"] = (frame["time_seconds"] // config.tile_seconds).astype(int)
    tile_root = root / "study-timeseries-tiles"
    tile_root.mkdir()
    tiles: list[dict[str, Any]] = []
    for (tile_number, scope, band), subset in frame.groupby(
        ["tile", "scope", "band"], dropna=False
    ):
        records = json.loads(subset.drop(columns=["tile"]).to_json(orient="records"))
        for resolution, stride in (("full", 1), ("4x", 4), ("16x", 16)):
            selected = records[::stride]
            filename = (
                f"{int(tile_number):06d}-{_filename_slug(scope)}-"
                f"{_filename_slug(band)}-{resolution}.json.gz"
            )
            path = tile_root / filename
            content = json.dumps(
                {
                    "schema": "eeg-result-v1",
                    "resolution": resolution,
                    "tile": int(tile_number),
                    "scope": scope,
                    "band": band,
                    "points": selected,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
            with path.open("wb") as output:
                with gzip.GzipFile(
                    filename="", mode="wb", fileobj=output, mtime=0
                ) as stream:
                    stream.write(content)
            metadata = {
                "tile": int(tile_number),
                "scope": str(scope),
                "band": str(band),
                "resolution": resolution,
                "start_seconds": int(tile_number) * config.tile_seconds,
                "end_seconds": (int(tile_number) + 1) * config.tile_seconds,
                "point_count": len(selected),
                "content_encoding": "gzip",
            }
            _store_artifact(
                db,
                run,
                kind="timeseries-tile",
                path=path,
                content_type="application/gzip",
                units="uV^2",
                metadata=metadata,
            )
            tiles.append({**metadata, "path": filename})
    preview = json.loads(
        frame.drop(columns=["tile"]).iloc[:: max(1, len(frame) // 2000)].head(2000).to_json(
            orient="records"
        )
    )
    index_path = root / "study-timeseries-index.json"
    index_path.write_text(
        json.dumps(
            {
                "schema": "eeg-result-v1",
                "scope": "study",
                "units": {"time": "s", "value": "uV^2"},
                "tile_seconds": config.tile_seconds,
                "tiles": tiles,
                "preview": preview,
                "provenance": {
                    "profile": config.profile,
                    "configuration": config.to_dict(),
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    _store_artifact(
        db,
        run,
        kind="timeseries-index",
        path=index_path,
        content_type="application/json",
        units="uV^2",
    )


def _run_individual(db: Any, run: EEGAnalysisRun, job: ProcessingJob, root: Path) -> None:
    from cast_pyp_eeg import run_pipeline

    asset = run.eeg_asset
    _stage(db, run, job, "download_inputs", 8)
    primary = _download_asset(asset, root)
    config = _analysis_config(run.profile, run.parameters or {})
    stages = tuple(
        (run.parameters or {}).get("stages", ("preprocess", "power", "timeseries"))
    )
    _stage(db, run, job, "scientific_pipeline", 18)
    result = run_pipeline(primary, root / "output", config, stages=stages)
    total = max(1, sum(len(step.artifacts) for step in result.steps))
    stored = 0
    for step in result.steps:
        _stage(
            db,
            run,
            job,
            f"store_{step.kind}",
            min(90, 60 + (stored / total) * 30),
        )
        _store_result(db, run, step)
        stored += len(step.artifacts)
        run.warnings = [*(run.warnings or []), *step.warnings]
        db.commit()
    manifest = root / "output" / "pipeline-result.json"
    _store_artifact(
        db,
        run,
        kind="pipeline-manifest",
        path=manifest,
        content_type="application/json",
    )


def _study_design(parameters: dict[str, Any]) -> Any:
    from cast_pyp_eeg import Contrast, StudyDesign

    payload = parameters.get("study_design", {})
    contrasts = tuple(Contrast(**item) for item in payload.get("contrasts", ()))
    return StudyDesign(
        subject_column=payload.get("subject_column", "subject"),
        group_column=payload.get("group_column", "group"),
        condition_column=payload.get("condition_column", "condition"),
        groups={
            name: tuple(values) for name, values in payload.get("groups", {}).items()
        },
        session_pairs=tuple(tuple(item) for item in payload.get("session_pairs", ())),
        contrasts=contrasts,
    )


def _run_study(db: Any, run: EEGAnalysisRun, job: ProcessingJob, root: Path) -> None:
    import pandas as pd

    from cast_pyp_eeg import (
        compute_band_power,
        compute_mdmp,
        compute_paired_stats,
        compute_timeseries_power,
        compute_topomaps,
        preprocess_recording,
    )

    assets = (
        db.query(EEGAsset)
        .join(SessionModel, EEGAsset.session_id == SessionModel.id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .filter(Participant.study_id == run.study_id)
        .all()
    )
    if not assets:
        raise ValueError("study has no EEG assets")
    config = _analysis_config(run.profile, run.parameters or {})
    power_frames: list[Any] = []
    timeseries_frames: list[Any] = []
    for index, asset in enumerate(assets):
        _stage(
            db,
            run,
            job,
            f"participant_{index + 1}_of_{len(assets)}",
            5 + (index / len(assets)) * 55,
        )
        asset_root = root / str(asset.id)
        primary = _download_asset(asset, root)
        preprocessed = preprocess_recording(primary, asset_root / "preprocess", config)
        cleaned = next(
            Path(item.path)
            for item in preprocessed.artifacts
            if item.kind == "preprocessed-fif"
        )
        power = compute_band_power(cleaned, asset_root / "power", config)
        timeseries = compute_timeseries_power(cleaned, asset_root / "timeseries", config)
        metadata = {
            "subject": str(asset.session.participant_id),
            "condition": asset.session.condition or "unspecified",
            "group": (
                str(asset.session.participant.group_id)
                if asset.session.participant.group_id
                else "ungrouped"
            ),
            "session": str(asset.session_id),
            "eeg_asset_id": str(asset.id),
        }
        power_frame = pd.read_csv(
            next(item.path for item in power.artifacts if item.kind == "power-csv")
        )
        timeseries_frame = pd.read_csv(
            next(item.path for item in timeseries.artifacts if item.kind == "timeseries-csv")
        )
        for key, value in metadata.items():
            power_frame[key] = value
            timeseries_frame[key] = value
        power_frames.append(power_frame)
        timeseries_frames.append(timeseries_frame)
        run.warnings = [*(run.warnings or []), *preprocessed.warnings]
        db.commit()

    study_output = root / "study"
    study_output.mkdir()
    power_frame = pd.concat(power_frames, ignore_index=True)
    timeseries_frame = pd.concat(timeseries_frames, ignore_index=True)
    power_long = study_output / "study-power.csv"
    timeseries_long = study_output / "study-timeseries.csv"
    power_frame.to_csv(power_long, index=False)
    timeseries_frame.to_csv(timeseries_long, index=False)
    _store_artifact(db, run, kind="power-csv", path=power_long, content_type="text/csv")
    _store_artifact(
        db, run, kind="timeseries-csv", path=timeseries_long, content_type="text/csv"
    )
    _write_study_results(
        db,
        run,
        study_output,
        power_frame,
        timeseries_frame,
        config,
    )
    _stage(db, run, job, "study_statistics", 68)
    roi_frame = power_frame[power_frame["level"] == "roi"].copy()
    roi_frame["value"] = roi_frame[
        (run.parameters or {}).get("power_metric", "absolute_power")
    ]
    design = _study_design(run.parameters or {})
    if design.contrasts or design.session_pairs:
        stats_result = compute_paired_stats(
            roi_frame.to_dict("records"),
            study_output / "stats",
            design,
            dimensions=("band", "roi"),
            config=config,
        )
        _store_result(db, run, stats_result)
        run.warnings = [*(run.warnings or []), *stats_result.warnings]
    else:
        run.warnings = [
            *(run.warnings or []),
            "paired statistics omitted: no contrasts configured in study_design",
        ]
    _stage(db, run, job, "study_topomaps", 77)
    channel_frame = power_frame[power_frame["level"] == "channel"].copy()
    channel_frame["value"] = channel_frame[
        (run.parameters or {}).get("power_metric", "absolute_power")
    ]
    topomaps = compute_topomaps(
        channel_frame.to_dict("records"),
        study_output / "topomaps",
        group_columns=("band", "condition"),
        config=config,
    )
    _store_result(db, run, topomaps)
    run.warnings = [*(run.warnings or []), *topomaps.warnings]
    _stage(db, run, job, "mdmp_individual_networks", 84)
    timeseries_frame["node"] = (
        timeseries_frame["roi"]
        .where(timeseries_frame["roi"].notna(), timeseries_frame.get("channel"))
        .astype(str)
        + "::"
        + timeseries_frame["band"].astype(str)
    )
    mdmp_summaries = []
    for subject, subject_frame in timeseries_frame.groupby("subject"):
        try:
            result = compute_mdmp(
                subject_frame.to_dict("records"),
                study_output / "mdmp" / "subjects" / str(subject),
                node_column="node",
                config=config,
            )
        except Exception as exc:
            run.warnings = [
                *(run.warnings or []),
                f"MDMP omitted for subject {subject}: {exc}",
            ]
            continue
        for artifact in result.artifacts:
            _store_artifact(
                db,
                run,
                kind=artifact.kind,
                path=Path(artifact.path),
                content_type=artifact.content_type,
                units=artifact.units,
                metadata={"subject": str(subject), **dict(artifact.metadata)},
            )
        network_artifact = next(
            (item for item in result.artifacts if item.kind == "mdmp-json"), None
        )
        network = (
            json.loads(Path(network_artifact.path).read_text(encoding="utf-8"))
            if network_artifact
            else {}
        )
        mdmp_summaries.append(
            {
                "subject": str(subject),
                "scope": "individual",
                "metrics": dict(result.metrics),
                "warnings": list(result.warnings),
                **network,
            }
        )
        run.warnings = [*(run.warnings or []), *result.warnings]
    _stage(db, run, job, "mdmp_group_networks", 91)
    for group, group_frame in timeseries_frame.groupby("group"):
        virtual = (
            group_frame.groupby(["time_seconds", "node"], as_index=False)["value"]
            .mean()
        )
        try:
            result = compute_mdmp(
                virtual.to_dict("records"),
                study_output / "mdmp" / "groups" / str(group),
                node_column="node",
                config=config,
            )
        except Exception as exc:
            run.warnings = [
                *(run.warnings or []),
                f"MDMP virtual typical subject omitted for group {group}: {exc}",
            ]
            continue
        for artifact in result.artifacts:
            _store_artifact(
                db,
                run,
                kind=artifact.kind,
                path=Path(artifact.path),
                content_type=artifact.content_type,
                units=artifact.units,
                metadata={
                    "group": str(group),
                    "scope": "virtual-typical-subject",
                    **dict(artifact.metadata),
                },
            )
        network_artifact = next(
            (item for item in result.artifacts if item.kind == "mdmp-json"), None
        )
        network = (
            json.loads(Path(network_artifact.path).read_text(encoding="utf-8"))
            if network_artifact
            else {}
        )
        mdmp_summaries.append(
            {
                "group": str(group),
                "scope": "virtual-typical-subject",
                "metrics": dict(result.metrics),
                "warnings": list(result.warnings),
                **network,
            }
        )
        run.warnings = [*(run.warnings or []), *result.warnings]
    summary_path = study_output / "mdmp-summary.json"
    summary_path.write_text(
        json.dumps(
            {
                "schema": "eeg-result-v1",
                "networks": mdmp_summaries,
                "scope": "study",
                "method": "individual-and-virtual-typical-subject",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    _store_artifact(
        db, run, kind="mdmp-json", path=summary_path, content_type="application/json"
    )


def process_eeg_analysis(run_id: str) -> dict[str, Any]:
    db = SessionLocal()
    run: EEGAnalysisRun | None = None
    job: ProcessingJob | None = None
    try:
        run = db.query(EEGAnalysisRun).filter(EEGAnalysisRun.id == run_id).first()
        if run is None:
            return {"error": "EEG analysis run not found"}
        job = db.query(ProcessingJob).filter(ProcessingJob.id == run.job_id).first()
        if job is None:
            raise ValueError("processing job not found")
        run.status = "running"
        run.started_at = datetime.utcnow()
        run.package_version = "2.0.0+cast.4074a2a"
        run.upstream_commit = "4074a2a391aec435a1987c0f7ea0c1183bf7eb96"
        run.mdmp_version = "0.6.2"
        run.mdmp_commit = "420afe67cf89e0a656fd5346c3721063365c40e4"
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        job.worker_id = "eeg"
        _log(job, "EEG analysis started")
        db.commit()
        with tempfile.TemporaryDirectory(prefix=f"cast-eeg-{run.id}-") as temporary:
            root = Path(temporary)
            if run.scope_type == "study":
                _run_study(db, run, job, root)
            else:
                _run_individual(db, run, job, root)
        _stage(db, run, job, "finalize", 98, "succeeded")
        run.status = "partial" if run.warnings else "succeeded"
        run.finished_at = datetime.utcnow()
        job.status = JobStatus.succeeded
        job.progress = 100
        job.finished_at = run.finished_at
        job.result = {
            "eeg_analysis_run_id": str(run.id),
            "status": run.status,
            "artifact_count": len(run.artifacts),
            "warnings": run.warnings or [],
        }
        _log(job, f"EEG analysis completed with status {run.status}")
        db.commit()
        return job.result
    except (EEGAnalysisCanceled, SoftTimeLimitExceeded, KeyboardInterrupt) as exc:
        if run and job:
            run.status = "canceled"
            run.finished_at = datetime.utcnow()
            job.status = JobStatus.canceled
            job.progress = min(float(job.progress or 0), 99)
            job.finished_at = run.finished_at
            _log(job, "EEG analysis canceled")
            db.commit()
        # Soft time limits and process interruptions must retain Celery's
        # control-flow semantics; cooperative user cancellation is final.
        if isinstance(exc, EEGAnalysisCanceled):
            return {"eeg_analysis_run_id": str(run.id), "status": "canceled"}
        raise
    except Exception as exc:
        logger.exception("EEG analysis %s failed", run_id)
        db.rollback()
        if run and job:
            db.add(run)
            db.add(job)
            artifact_count = (
                db.query(EEGAnalysisArtifact)
                .filter(EEGAnalysisArtifact.run_id == run.id)
                .count()
            )
            run.status = "partial" if artifact_count else "failed"
            run.error_message = str(exc)
            run.finished_at = datetime.utcnow()
            run.step_status = {
                **(run.step_status or {}),
                "failed": {
                    "status": "failed",
                    "at": run.finished_at.isoformat(),
                    "message": str(exc),
                },
            }
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.finished_at = run.finished_at
            _log(job, str(exc), "error")
            db.commit()
        raise
    finally:
        db.close()


@celery_app.task(bind=True, name="app.workers.tasks_eeg_analysis.process")
def process_eeg_analysis_task(self, run_id: str):
    return process_eeg_analysis(run_id)
