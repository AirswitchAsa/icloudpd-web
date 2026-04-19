from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError


router = APIRouter(tags=["streams"], dependencies=[Depends(require_auth)])


def _sse(event: str, seq: int | None, data: object) -> bytes:
    lines = []
    if seq is not None:
        lines.append(f"id: {seq}")
    lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data)}")
    lines.append("")
    lines.append("")
    return "\n".join(lines).encode("utf-8")


@router.get("/policies/stream")
async def policies_stream(request: Request) -> StreamingResponse:
    store = request.app.state.policy_store
    last_id = request.headers.get("last-event-id")
    start_gen = int(last_id) if last_id and last_id.isdigit() else store.generation

    async def gen() -> AsyncIterator[bytes]:
        gen_seen = start_gen
        while True:
            if await request.is_disconnected():
                return
            if store.generation != gen_seen:
                gen_seen = store.generation
                names = [p.name for p in store.all()]
                yield _sse(
                    "generation",
                    gen_seen,
                    {"generation": gen_seen, "names": names},
                )
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str, request: Request) -> StreamingResponse:
    runner = request.app.state.runner
    run = runner.get_run(run_id)
    if run is None:
        raise ApiError("Run not found", status_code=404)
    last_id = request.headers.get("last-event-id")
    since = int(last_id) if last_id and last_id.isdigit() else None

    async def gen() -> AsyncIterator[bytes]:
        async for ev in run.subscribe(since=since):
            if await request.is_disconnected():
                return
            yield _sse(ev.kind, ev.seq, ev.data)
            if ev.kind == "status":
                return

    return StreamingResponse(gen(), media_type="text/event-stream")
