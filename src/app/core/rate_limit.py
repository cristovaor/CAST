"""Fixed-window API rate limiting as a pure ASGI middleware.

Budgets are per minute and per identity: the signed-in user (JWT subject) or,
for anonymous calls and for the auth endpoints, the client IP. Counters live in
Redis so every API worker shares them; if Redis is unreachable the limiter
falls back to per-process memory instead of failing requests.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass

from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 60


@dataclass(frozen=True)
class Rule:
    name: str
    limit: int
    per_ip: bool = False


def select_rule(method: str, path: str) -> Rule | None:
    api = settings.API_V1_STR
    if method == "OPTIONS" or not path.startswith(api):
        return None
    if path.startswith(f"{api}/health"):
        return None
    if path.startswith(f"{api}/auth/") and method == "POST":
        return Rule("auth", settings.RATE_LIMIT_AUTH_PER_MINUTE, per_ip=True)
    if method == "DELETE":
        return Rule("delete", settings.RATE_LIMIT_DELETE_PER_MINUTE)
    if method in ("POST", "PUT", "PATCH"):
        return Rule("write", settings.RATE_LIMIT_WRITE_PER_MINUTE)
    return Rule("read", settings.RATE_LIMIT_READ_PER_MINUTE)


def header(scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or []:
        if key == name:
            return value.decode("latin-1")
    return None


def bearer_subject(scope) -> str | None:
    """JWT subject of the caller, verified; None for anonymous or bad tokens."""
    authorization = header(scope, b"authorization")
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(
            authorization[7:].strip(),
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        return None
    subject = payload.get("sub")
    return str(subject) if subject else None


def client_ip(scope) -> str:
    client = scope.get("client")
    return client[0] if client else "unknown"


class MemoryCounter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[tuple[str, int], int] = {}

    async def hit(self, key: str, slot: int) -> int:
        with self._lock:
            if len(self._hits) > 10_000:
                self._hits = {k: v for k, v in self._hits.items() if k[1] >= slot}
            count = self._hits.get((key, slot), 0) + 1
            self._hits[(key, slot)] = count
            return count


class RedisCounter:
    def __init__(self, url: str) -> None:
        import redis.asyncio as aioredis

        self._client = aioredis.from_url(
            url, socket_timeout=0.5, socket_connect_timeout=0.5
        )

    async def hit(self, key: str, slot: int) -> int:
        redis_key = f"cast:ratelimit:{key}:{slot}"
        async with self._client.pipeline(transaction=False) as pipe:
            pipe.incr(redis_key)
            pipe.expire(redis_key, WINDOW_SECONDS + 5)
            count, _ = await pipe.execute()
        return int(count)


class FallbackCounter:
    def __init__(self, primary: RedisCounter | None) -> None:
        self._primary = primary
        self._memory = MemoryCounter()
        self._last_warning = 0.0

    async def hit(self, key: str, slot: int) -> int:
        if self._primary is not None:
            try:
                return await self._primary.hit(key, slot)
            except Exception as error:
                now = time.monotonic()
                if now - self._last_warning > 60:
                    self._last_warning = now
                    logger.warning("Rate limiter using memory counters: %s", error)
        return await self._memory.hit(key, slot)


_counter: FallbackCounter | MemoryCounter | None = None


def get_counter():
    """Process-wide counter, created on first use."""
    global _counter
    if _counter is None:
        url = os.environ.get("REDIS_URL")
        _counter = FallbackCounter(RedisCounter(url) if url else None)
    return _counter


class RateLimitMiddleware:
    def __init__(self, app, counter=None) -> None:
        self.app = app
        self.counter = counter

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not settings.RATE_LIMIT_ENABLED:
            await self.app(scope, receive, send)
            return
        rule = select_rule(scope["method"], scope["path"])
        if rule is None or rule.limit <= 0:
            await self.app(scope, receive, send)
            return

        counter = self.counter or get_counter()
        subject = None if rule.per_ip else bearer_subject(scope)
        identity = f"user:{subject}" if subject else f"ip:{client_ip(scope)}"
        now = time.time()
        slot = int(now // WINDOW_SECONDS)
        count = await counter.hit(f"{rule.name}:{identity}", slot)
        remaining = max(0, rule.limit - count)
        limit_headers = [
            (b"x-ratelimit-limit", str(rule.limit).encode()),
            (b"x-ratelimit-remaining", str(remaining).encode()),
        ]

        if count > rule.limit:
            retry_after = max(1, int(WINDOW_SECONDS - now % WINDOW_SECONDS))
            body = json.dumps(
                {"detail": f"Too many requests; try again in {retry_after} s"}
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                        (b"retry-after", str(retry_after).encode()),
                        *limit_headers,
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                message = {
                    **message,
                    "headers": [*message.get("headers", []), *limit_headers],
                }
            await send(message)

        await self.app(scope, receive, send_with_headers)
