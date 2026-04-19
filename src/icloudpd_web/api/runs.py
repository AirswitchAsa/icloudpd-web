from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse

from icloudpd_web.auth import require_auth
from icloudpd_web.errors import ApiError


router = APIRouter(tags=["runs"], dependencies=[Depends(require_auth)])


@router.post("/policies/{name}/runs")
async def start_run(name: str, request: Request) -> dict:
    store = request.app.state.policy_store
    policy = store.get(name)
    if policy is None:
        raise ApiError("Policy not found", status_code=404)
    runner = request.app.state.runner
    if runner.is_running(name):
        raise ApiError("Policy already running", status_code=409)
    password = request.app.state.secret_store.get(name)
    try:
        run = await runner.start(policy, password=password, trigger="manual")
    except RuntimeError as e:
        raise ApiError(str(e), status_code=409) from None
    return {"run_id": run.run_id}


@router.delete("/runs/{run_id}")
async def stop_run(run_id: str, request: Request) -> dict:
    runner = request.app.state.runner
    ok = await runner.stop(run_id)
    if not ok:
        raise ApiError("Run not active", status_code=404)
    return {"ok": True}


@router.get("/policies/{name}/runs")
def list_runs(name: str, request: Request) -> list[dict]:
    runs_dir: Path = request.app.state.data_dir / "runs" / name
    if not runs_dir.is_dir():
        return []
    return [
        {
            "run_id": p.stem,
            "log_size": p.stat().st_size,
            "mtime": p.stat().st_mtime,
        }
        for p in sorted(runs_dir.glob("*.log"), key=lambda x: x.stat().st_mtime, reverse=True)
    ]


@router.get("/runs/{run_id}/log")
def get_log(run_id: str, request: Request) -> FileResponse:
    policy_name = run_id.rsplit("-", 1)[0]
    path: Path = request.app.state.data_dir / "runs" / policy_name / f"{run_id}.log"
    if not path.is_file():
        raise ApiError("Log not found", status_code=404)
    return FileResponse(path, media_type="text/plain")
