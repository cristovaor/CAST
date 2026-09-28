from app.db.base_class import Base

# Import every model so they register on Base.metadata (used by Alembic
# autogenerate and metadata.create_all). Keep this list complete.
from app.db.models import (
    Organization, User, Project, Study, StudyGroup, Participant, Session, VideoAsset,
    EEGAsset, EEGAssetFile, EEGAnalysisRun, EEGAnalysisArtifact,
    ProcessingJob, ModelVersion, MicroActionModel, Prediction,
    LandmarkArtifact, LearningAssessment, AnnotationTask, AnnotationEvent,
    PredictionReview, AnalysisReport,
    ConsentTerm, Synchronization, SyncEvidence, SyncRun, ResearchVariable, Dataset, AuditLog,
    ApiRequestLog,
)
from app.domains.acquisition.models import (
    ResearchBookmark,
    VideoCapturePart,
    VideoCaptureRun,
)
from app.domains.context.models import (
    EnvironmentArtifact,
    ExperimentalEvent,
    ExperimentalTrial,
    StimulusAsset,
)
from app.domains.lsl.models import LSLRecording, LSLRecordingStream
from app.domains.gaze.models import GazeArtifact, GazeCalibration, GazeCalibrationSample
from app.domains.pupil.models import PupilArtifact, PupilRun

__all__ = [
    "Base", "ApiRequestLog", "Organization", "User", "Project", "Study", "StudyGroup", "Participant",
    "Session", "VideoAsset", "EEGAsset", "EEGAssetFile", "EEGAnalysisRun",
    "EEGAnalysisArtifact", "ProcessingJob", "ModelVersion",
    "MicroActionModel", "Prediction", "LandmarkArtifact", "LearningAssessment",
    "AnnotationTask", "AnnotationEvent", "PredictionReview", "AnalysisReport",
    "Synchronization", "SyncEvidence", "SyncRun", "ResearchVariable", "Dataset", "AuditLog",
    "VideoCaptureRun", "VideoCapturePart", "ResearchBookmark",
    "ExperimentalTrial", "StimulusAsset", "ExperimentalEvent", "EnvironmentArtifact",
    "LSLRecording", "LSLRecordingStream",
    "GazeCalibration", "GazeCalibrationSample", "GazeArtifact",
    "PupilRun", "PupilArtifact",
]
