from app.db.base_class import Base

# Import every model so they register on Base.metadata (used by Alembic
# autogenerate and metadata.create_all). Keep this list complete.
from app.db.models import (
    Organization, User, Project, Study, Participant, Session, VideoAsset,
    EEGAsset, ProcessingJob, ModelVersion, MicroActionModel, Prediction,
    LandmarkArtifact, LearningAssessment, AnnotationTask, AnnotationEvent,
    PredictionReview, AnalysisReport,
    ConsentTerm, Synchronization, ResearchVariable, Dataset, AuditLog,
)

__all__ = [
    "Base", "Organization", "User", "Project", "Study", "Participant",
    "Session", "VideoAsset", "EEGAsset", "ProcessingJob", "ModelVersion",
    "MicroActionModel", "Prediction", "LandmarkArtifact", "LearningAssessment",
    "AnnotationTask", "AnnotationEvent", "PredictionReview", "AnalysisReport",
    "ResearchVariable", "Dataset", "AuditLog",
]
