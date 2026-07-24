from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Welcome to CAST Platform API"}

from app.api.v1 import routes_projects, routes_studies, routes_participants, routes_videos, routes_assessments, routes_reports, routes_jobs, routes_exports, routes_auth, routes_annotations, routes_dashboard, routes_settings, routes_users, routes_inference, routes_models_v2, routes_health, routes_eeg, routes_sessions, routes_audit
from app.api.v1 import routes_sync, routes_datasets, routes_variables, routes_governance
app.include_router(routes_auth.router, prefix=settings.API_V1_STR)
app.include_router(routes_sessions.router, prefix=settings.API_V1_STR)
app.include_router(routes_audit.router, prefix=settings.API_V1_STR)
app.include_router(routes_sync.router, prefix=settings.API_V1_STR)
app.include_router(routes_datasets.router, prefix=settings.API_V1_STR)
app.include_router(routes_variables.router, prefix=settings.API_V1_STR)
app.include_router(routes_governance.router, prefix=settings.API_V1_STR)
app.include_router(routes_projects.router, prefix=settings.API_V1_STR)
app.include_router(routes_studies.router, prefix=settings.API_V1_STR)
app.include_router(routes_participants.router, prefix=settings.API_V1_STR)
app.include_router(routes_videos.router, prefix=settings.API_V1_STR)
app.include_router(routes_eeg.router, prefix=settings.API_V1_STR)
app.include_router(routes_assessments.router, prefix=settings.API_V1_STR)
app.include_router(routes_reports.router, prefix=settings.API_V1_STR)
app.include_router(routes_jobs.router, prefix=settings.API_V1_STR)
app.include_router(routes_exports.router, prefix=settings.API_V1_STR)
app.include_router(routes_annotations.router, prefix=settings.API_V1_STR)
app.include_router(routes_annotations.annotation_events_router, prefix=settings.API_V1_STR)
app.include_router(routes_dashboard.router, prefix=settings.API_V1_STR)
app.include_router(routes_settings.router, prefix=settings.API_V1_STR)
app.include_router(routes_users.router, prefix=settings.API_V1_STR)
app.include_router(routes_inference.router, prefix=settings.API_V1_STR)
app.include_router(routes_models_v2.router, prefix=settings.API_V1_STR)
app.include_router(routes_health.router, prefix=settings.API_V1_STR)
