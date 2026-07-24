import pandas as pd
from sqlalchemy.orm import Session
from app.db.models import Study, AssessmentType, Prediction
from app.services.storage_service import storage_service
from uuid import UUID

def calculate_learning_gain(pre_score, post_score):
    if pre_score is None or post_score is None:
        return None
    return abs(float(post_score) - float(pre_score))

def build_study_dataframe(study_id: UUID, db: Session) -> pd.DataFrame:
    study = db.query(Study).filter(Study.id == study_id).first()
    if not study:
        raise ValueError("Study not found")
        
    rows = []
    for participant in study.participants:
        for session in participant.sessions:
            pre_test = next((a for a in session.assessments if a.type == AssessmentType.pre_test), None)
            post_test = next((a for a in session.assessments if a.type == AssessmentType.post_test), None)
            
            pre_score = float(pre_test.score) if pre_test else None
            post_score = float(post_test.score) if post_test else None
            
            gain = calculate_learning_gain(pre_score, post_score)
            
            row = {
                "participant_id": str(participant.id),
                "external_code": participant.external_code,
                "session_id": str(session.id),
                "pre_score": pre_score,
                "post_score": post_score,
                "learning_gain": gain
            }
            
            video = session.video_asset
            if video:
                predictions = db.query(Prediction).filter(Prediction.video_asset_id == video.id).all()
                for pred in predictions:
                    if pred.summary:
                        for model_name, metrics in pred.summary.items():
                            row[f"freq_{model_name}"] = metrics.get("per_minute", 0.0)
                            row[f"count_{model_name}"] = metrics.get("count", 0)
                            
            rows.append(row)
            
    return pd.DataFrame(rows)

def generate_export_url(study_id: UUID, format_type: str, db: Session) -> str:
    df = build_study_dataframe(study_id, db)
    
    if df.empty:
        raise ValueError("No data for export")
        
    object_name = f"exports/{study_id}/report.{format_type}"
    
    if format_type == "csv":
        data_bytes = df.to_csv(index=False).encode('utf-8')
        content_type = "text/csv"
    elif format_type == "parquet":
        data_bytes = df.to_parquet(index=False)
        content_type = "application/octet-stream"
    else:
        raise ValueError("Unsupported format")
        
    success = storage_service.upload_bytes(object_name, data_bytes, content_type)
    if not success:
        raise Exception("Upload failed")
        
    return storage_service.generate_presigned_download_url(object_name)

def get_dashboard_metrics(study_id: UUID, db: Session) -> dict:
    df = build_study_dataframe(study_id, db)
    
    if df.empty:
        return {
            "total_participants": 0,
            "total_videos_processed": 0,
            "average_learning_gain": 0.0,
            "microactions_summary": {}
        }
        
    avg_gain = df["learning_gain"].mean() if "learning_gain" in df else 0.0
    
    microactions_summary = {}
    count_cols = [c for c in df.columns if c.startswith("count_")]
    for col in count_cols:
        action = col.split("count_")[1]
        freq_col = f"freq_{action}"
        microactions_summary[action] = {
            "total_count": int(df[col].sum()),
            "average_per_minute": float(df[freq_col].mean()) if freq_col in df else 0.0
        }
        
    return {
        "total_participants": len(df["participant_id"].unique()),
        "total_videos_processed": len(df),
        "average_learning_gain": float(avg_gain) if not pd.isna(avg_gain) else 0.0,
        "microactions_summary": microactions_summary
    }

import json
from datetime import datetime
from app.db.models import AnalysisReport, ReportType

def generate_json_report(study_id: UUID, user_id: UUID, db: Session) -> AnalysisReport:
    metrics = get_dashboard_metrics(study_id, db)
    metrics["study_id"] = str(study_id)
    metrics["generated_at"] = datetime.utcnow().isoformat()
    
    report_bytes = json.dumps(metrics, indent=2).encode("utf-8")
    object_key = f"reports/{study_id}/{datetime.utcnow().timestamp()}.json"
    
    storage_service.upload_bytes(object_key, report_bytes, "application/json")
    
    report_uri = f"s3://{storage_service.bucket_name}/{object_key}"
    
    report = AnalysisReport(
        study_id=study_id,
        report_type=ReportType.json,
        storage_uri=report_uri,
        generated_by=user_id
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report

def generate_pdf_report(study_id: UUID, user_id: UUID, db: Session) -> AnalysisReport:
    metrics = get_dashboard_metrics(study_id, db)
    metrics["study_id"] = str(study_id)
    metrics["generated_at"] = datetime.utcnow().isoformat()
    
    # Stub PDF content
    report_bytes = f"PDF Report Stub for Study {study_id}\n\n{json.dumps(metrics, indent=2)}".encode("utf-8")
    object_key = f"reports/{study_id}/{datetime.utcnow().timestamp()}.pdf"
    
    storage_service.upload_bytes(object_key, report_bytes, "application/pdf")
    
    report_uri = f"s3://{storage_service.bucket_name}/{object_key}"
    
    report = AnalysisReport(
        study_id=study_id,
        report_type=ReportType.pdf,
        storage_uri=report_uri,
        generated_by=user_id
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
