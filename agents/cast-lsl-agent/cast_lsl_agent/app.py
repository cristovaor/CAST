from __future__ import annotations

import hashlib
import json
import os
import secrets
import shlex
import subprocess
import tempfile
import time
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

PAIR_TOKEN = os.environ.get("CAST_LSL_PAIR_TOKEN") or secrets.token_urlsafe(32)
ALLOWED_ORIGINS = [item.strip() for item in os.environ.get("CAST_LSL_ALLOWED_ORIGINS", "http://localhost,http://localhost:5173").split(",") if item.strip()]
LABRECORDER_COMMAND = os.environ.get("CAST_LABRECORDER_COMMAND", "LabRecorderCLI --filename {output}")
MARKER_SOURCE_ID = "cast-markers-v1"

app = FastAPI(title="CAST LSL Agent", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])


def authorize(authorization: str | None = Header(default=None)) -> None:
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not secrets.compare_digest(supplied, PAIR_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid pairing token")


class StartRequest(BaseModel):
    recording_id: str
    upload_url: str
    selected_stream_ids: list[str] = Field(default_factory=list)


class MarkerRequest(BaseModel):
    client_event_id: str
    label: str
    source_time_us: int
    source_clock_id: str = "browser-performance"


class AgentState:
    process: subprocess.Popen | None = None
    output_path: Path | None = None
    upload_url: str | None = None
    recording_id: str | None = None
    marker_ids: set[str] = set()
    marker_outlet = None
    discovered_stream_ids: set[str] = set()


state = AgentState()


def ensure_marker_outlet():
    if state.marker_outlet is None:
        from pylsl import StreamInfo, StreamOutlet
        state.marker_outlet = StreamOutlet(
            StreamInfo("CAST Markers", "Markers", 1, 0, "string", MARKER_SOURCE_ID)
        )
    return state.marker_outlet


@app.get("/health", dependencies=[Depends(authorize)])
def health():
    return {"ok": True, "recording": state.process is not None and state.process.poll() is None}


@app.get("/discovery", dependencies=[Depends(authorize)])
def discovery():
    from pylsl import resolve_streams
    ensure_marker_outlet()
    streams = [
        {
            "uid": stream.uid(), "name": stream.name(), "type": stream.type(),
            "source_id": stream.source_id(), "hostname": stream.hostname(),
            "channel_count": stream.channel_count(), "nominal_srate": stream.nominal_srate(),
            "channel_format": str(stream.channel_format()),
        }
        for stream in resolve_streams(wait_time=1.0)
    ]
    state.discovered_stream_ids = {
        identity for stream in streams for identity in (str(stream["uid"]), str(stream["source_id"])) if identity
    }
    return {"streams": streams}


@app.post("/start", dependencies=[Depends(authorize)])
def start(request: StartRequest):
    if state.process is not None and state.process.poll() is None:
        raise HTTPException(status_code=409, detail="Agent is already recording")
    unknown = set(request.selected_stream_ids) - state.discovered_stream_ids
    if unknown:
        raise HTTPException(status_code=422, detail=f"Streams were not discovered: {sorted(unknown)}")
    output = Path(tempfile.gettempdir()) / f"cast-lsl-{request.recording_id}.xdf"
    ensure_marker_outlet()
    selected_ids = list(request.selected_stream_ids)
    if MARKER_SOURCE_ID not in selected_ids:
        selected_ids.append(MARKER_SOURCE_ID)
    selected = ",".join(selected_ids)
    command = shlex.split(LABRECORDER_COMMAND.format(output=str(output), streams=shlex.quote(selected)))
    state.process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    state.output_path = output; state.upload_url = request.upload_url; state.recording_id = request.recording_id; state.marker_ids.clear()
    return {"recording_id": request.recording_id, "started_source_time_us": time.perf_counter_ns() // 1000}


@app.post("/marker", dependencies=[Depends(authorize)])
def marker(request: MarkerRequest):
    if request.client_event_id in state.marker_ids:
        return {"accepted": True, "reused": True}
    ensure_marker_outlet().push_sample([
        json.dumps(
            {
                "schema_version": "cast-marker-v1",
                "client_event_id": request.client_event_id,
                "label": request.label,
                "source_time_us": request.source_time_us,
                "source_clock_id": request.source_clock_id,
            },
            separators=(",", ":"),
        )
    ])
    state.marker_ids.add(request.client_event_id)
    return {"accepted": True, "reused": False}


@app.post("/stop", dependencies=[Depends(authorize)])
def stop():
    if state.process is None or state.output_path is None or state.upload_url is None:
        raise HTTPException(status_code=409, detail="Agent is not recording")
    state.process.terminate()
    try: state.process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        state.process.kill(); state.process.wait(timeout=5)
    if not state.output_path.exists() or state.output_path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="LabRecorder did not produce an XDF file")
    digest = hashlib.sha256()
    size_bytes = state.output_path.stat().st_size

    def chunks():
        with state.output_path.open("rb") as source:
            for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
                digest.update(chunk)
                yield chunk

    response = httpx.put(state.upload_url, content=chunks(), headers={"Content-Type": "application/x-xdf"}, timeout=120)
    response.raise_for_status()
    result = {
        "recording_id": state.recording_id,
        "checksum_sha256": digest.hexdigest(),
        "size_bytes": size_bytes,
        "ended_source_time_us": time.perf_counter_ns() // 1000,
    }
    state.output_path.unlink(missing_ok=True)
    state.process = None; state.output_path = None; state.upload_url = None; state.recording_id = None
    return result


def main():
    import uvicorn
    print(f"CAST LSL pairing token: {PAIR_TOKEN}")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("CAST_LSL_AGENT_PORT", "8765")))
