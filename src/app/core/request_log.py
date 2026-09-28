"""Operational API log as a pure ASGI middleware.

Records every write (POST/PUT/PATCH/DELETE) and every denied request
(401/403/429) under the API prefix. Only metadata is stored: never request or
response bodies, and never the query string (it can carry tokens).
"""
from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timedelta
from uuid import UUID

from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.rate_limit import bearer_subject, client_ip, header

logger = logging.getLogger(__name__)

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
DENIED_STATUSES = {401, 403, 429}
_ACTOR_TTL_SECONDS = 300
_actor_cache: dict[UUID, tuple[float, UUID | None, str | None]] = {}


def _actor(db, user_id: UUID) -> tuple[UUID | None, str | None]:
    from app.db.models import User

    cached = _actor_cache.get(user_id)
    if cached and time.monotonic() - cached[0] < _ACTOR_TTL_SECONDS:
        return cached[1], cached[2]
    user = db.query(User).filter(User.id == user_id).first()
    org_id, email = (user.organization_id, user.email) if user else (None, None)
    if len(_actor_cache) > 1000:
        _actor_cache.clear()
    _actor_cache[user_id] = (time.monotonic(), org_id, email)
    return org_id, email


def write_request_log(session_factory, entry: dict) -> None:
    from app.db.models import ApiRequestLog

    db = session_factory()
    try:
        subject = entry.pop("subject", None)
        actor_id = org_id = email = None
        if subject:
            try:
                actor_id = UUID(subject)
                org_id, email = _actor(db, actor_id)
                if org_id is None and email is None:
                    actor_id = None
            except ValueError:
                actor_id = None
        db.add(
            ApiRequestLog(
                organization_id=org_id,
                actor_id=actor_id,
                actor_label=email,
                **entry,
            )
        )
        if random.random() < 0.002:
            cutoff = datetime.utcnow() - timedelta(days=settings.REQUEST_LOG_RETENTION_DAYS)
            db.query(ApiRequestLog).filter(ApiRequestLog.created_at < cutoff).delete(
                synchronize_session=False
            )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not write API request log")
    finally:
        db.close()


class RequestLogMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not settings.REQUEST_LOG_ENABLED:
            await self.app(scope, receive, send)
            return
        method = scope["method"]
        path = scope["path"]
        if method == "OPTIONS" or not path.startswith(settings.API_V1_STR):
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        status = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            code = status["code"]
            if method in WRITE_METHODS or code in DENIED_STATUSES:
                route = scope.get("route")
                entry = {
                    "subject": bearer_subject(scope),
                    "method": method,
                    "path": path[:512],
                    "route": (getattr(route, "path", None) or None),
                    "status_code": code,
                    "duration_ms": int((time.perf_counter() - started) * 1000),
                    "ip_address": client_ip(scope)[:64],
                    "user_agent": (header(scope, b"user-agent") or "")[:256] or None,
                }
                app = scope.get("app")
                factory = getattr(getattr(app, "state", None), "request_log_session_factory", None)
                if factory is None:
                    from app.db.session import SessionLocal

                    factory = SessionLocal
                await run_in_threadpool(write_request_log, factory, entry)
