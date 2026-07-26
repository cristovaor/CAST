from __future__ import annotations

from datetime import datetime
import json
from uuid import UUID

from celery.utils.log import get_task_logger

from app.db.models import (
    AnalysisReport,
    JobStatus,
    ProcessingJob,
    ReportType,
)
from app.db.session import SessionLocal
from app.services.pdf_generator import generate_scientific_report_pdf
from app.services.scientific_report_service import build_scientific_report
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app


logger = get_task_logger(__name__)


class ReportGenerationCanceled(RuntimeError):
    pass


def _progress(job: ProcessingJob, db, percent: int, message: str) -> None:
    db.refresh(job)
    if job.status == JobStatus.canceled:
        raise ReportGenerationCanceled("Report generation canceled")
    logs = list(job.logs or [])
    logs.append(
        {
            "timestamp": datetime.utcnow().isoformat(),
            "level": "info",
            "message": message,
        }
    )
    job.progress = percent
    job.logs = logs
    db.commit()


def run_scientific_report_job(job_id: str) -> dict:
    db = SessionLocal()
    job = None
    try:
        resolved_job_id = UUID(str(job_id))
        job = (
            db.query(ProcessingJob)
            .filter(ProcessingJob.id == resolved_job_id)
            .first()
        )
        if not job or not job.study_id:
            raise ValueError("Report job or study not found")
        if job.status == JobStatus.canceled:
            return {"job_id": str(job.id), "status": "canceled"}
        request = dict((job.result or {}).get("request") or {})
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        db.commit()
        _progress(job, db, 8, "Congelando snapshot elegível do estudo")

        report_payload = build_scientific_report(
            job.study_id,
            request,
            db,
            full=True,
        )
        _progress(job, db, 52, "Executando análises e diagnósticos")

        json_bytes = json.dumps(
            report_payload,
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        ).encode("utf-8")
        pdf_bytes = generate_scientific_report_pdf(report_payload).getvalue()
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
        base_key = (
            f"reports/{job.study_id}/{request.get('template_key', 'study_overview')}/"
            f"{timestamp}-{job.id}"
        )
        json_key = f"{base_key}.json"
        pdf_key = f"{base_key}.pdf"
        if not storage_service.upload_bytes(
            json_key, json_bytes, "application/json"
        ):
            raise RuntimeError("JSON artifact upload failed")
        if not storage_service.upload_bytes(pdf_key, pdf_bytes, "application/pdf"):
            storage_service.delete_object(json_key)
            raise RuntimeError("PDF artifact upload failed")
        _progress(job, db, 86, "Persistindo artefatos e proveniência")

        participant_id = request.get("participant_id")
        report = AnalysisReport(
            study_id=job.study_id,
            report_type=ReportType.pdf,
            storage_uri=f"s3://{storage_service.bucket_name}/{pdf_key}",
            template_key=report_payload["template_key"],
            scope_type=report_payload["scope_type"],
            participant_id=UUID(participant_id) if participant_id else None,
            analysis_spec=request,
            result_summary={
                "flow": report_payload["flow"],
                "summary": report_payload["summary"],
                "outcomes": report_payload["outcomes"],
                "analyses": report_payload["analyses"],
                "limitations": report_payload["limitations"],
            },
            artifact_manifest={"pdf": pdf_key, "json": json_key},
            methodology_version=report_payload["methodology_version"],
            data_snapshot_hash=report_payload["data_snapshot_hash"],
            generated_by=(
                UUID((job.result or {})["generated_by"])
                if (job.result or {}).get("generated_by")
                else None
            ),
        )
        db.add(report)
        db.flush()
        job.status = JobStatus.succeeded
        job.progress = 100
        job.finished_at = datetime.utcnow()
        job.result = {
            "request": request,
            "report_id": str(report.id),
            "artifact_manifest": report.artifact_manifest,
        }
        db.commit()
        _progress(job, db, 100, "Relatório científico concluído")
        return {
            "job_id": str(job.id),
            "report_id": str(report.id),
            "artifact_manifest": report.artifact_manifest,
        }
    except ReportGenerationCanceled:
        db.rollback()
        canceled = (
            db.query(ProcessingJob)
            .filter(ProcessingJob.id == UUID(str(job_id)))
            .first()
        )
        if canceled:
            canceled.status = JobStatus.canceled
            canceled.finished_at = canceled.finished_at or datetime.utcnow()
            db.commit()
        return {"job_id": str(job_id), "status": "canceled"}
    except Exception as exc:
        logger.error("Scientific report job failed: %s", exc, exc_info=True)
        db.rollback()
        if job is None:
            job = (
                db.query(ProcessingJob)
                .filter(ProcessingJob.id == UUID(str(job_id)))
                .first()
            )
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.finished_at = datetime.utcnow()
            logs = list(job.logs or [])
            logs.append(
                {
                    "timestamp": datetime.utcnow().isoformat(),
                    "level": "error",
                    "message": str(exc),
                }
            )
            job.logs = logs
            db.commit()
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def generate_scientific_report_task(self, job_id: str):
    return run_scientific_report_job(job_id)
