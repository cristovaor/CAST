from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.deps import get_current_user

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

from app.api.v1 import routes_projects, routes_studies, routes_participants, routes_videos, routes_assessments, routes_reports, routes_jobs, routes_exports, routes_auth, routes_annotations, routes_dashboard, routes_settings, routes_users, routes_inference, routes_models_v2, routes_model_testing, routes_health, routes_eeg, routes_sessions, routes_audit
from app.api.v1 import routes_sync, routes_datasets, routes_variables, routes_governance, routes_study_groups
# Authentication and health checks are the only public API surfaces. Applying
# the dependency at router registration makes new endpoints secure by default;
# route-level dependencies still provide the user object where ownership or
# role checks are required.
app.include_router(routes_auth.router, prefix=settings.API_V1_STR)

protected_routers = (
    routes_sessions.router,
    routes_audit.router,
    routes_sync.router,
    routes_datasets.router,
    routes_variables.router,
    routes_governance.router,
    routes_study_groups.router,
    routes_projects.router,
    routes_studies.router,
    routes_participants.router,
    routes_videos.router,
    routes_eeg.router,
    routes_assessments.router,
    routes_reports.router,
    routes_jobs.router,
    routes_exports.router,
    routes_annotations.router,
    routes_annotations.annotation_events_router,
    routes_dashboard.router,
    routes_settings.router,
    routes_users.router,
    routes_inference.router,
    routes_models_v2.router,
    routes_model_testing.router,
)
for protected_router in protected_routers:
    app.include_router(
        protected_router,
        prefix=settings.API_V1_STR,
        dependencies=[Depends(get_current_user)],
    )

app.include_router(routes_health.router, prefix=settings.API_V1_STR)
