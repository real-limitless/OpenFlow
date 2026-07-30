#!/usr/bin/env python3
"""Read/write factory run-state + models checkpoint."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
JOBS = ROOT / "scripts" / "factory" / ".jobs"
STATE = JOBS / "run-state.json"
MODELS = JOBS / "models.json"
CATALOG = ROOT / "docs" / "specs" / "catalog.json"

DEFAULT_MODELS = {
    "spec": "xai/grok-4.5",
    "implement": "featherless/zai-org/GLM-5.2",
    "validate": "xai/grok-4.5",
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_models() -> dict:
    # Priority: models.json (user/TUI) > env > catalog > defaults
    m = dict(DEFAULT_MODELS)
    if CATALOG.exists():
        try:
            m.update((json.loads(CATALOG.read_text()).get("factory") or {}).get("models") or {})
        except Exception:
            pass
    for ek, k in (
        ("FACTORY_MODEL_SPEC", "spec"),
        ("FACTORY_MODEL_IMPL", "implement"),
        ("FACTORY_MODEL_VAL", "validate"),
    ):
        if os.environ.get(ek):
            m[k] = os.environ[ek]
    if MODELS.exists():
        try:
            m.update(json.loads(MODELS.read_text()))
        except Exception:
            pass
    return m


def save_models(models: dict) -> None:
    JOBS.mkdir(parents=True, exist_ok=True)
    MODELS.write_text(json.dumps({**DEFAULT_MODELS, **models}, indent=2) + "\n")


def load_state() -> dict:
    if STATE.exists():
        try:
            return json.loads(STATE.read_text())
        except Exception:
            pass
    return {
        "runId": None,
        "status": "idle",
        "pid": None,
        "pgid": None,
        "models": load_models(),
        "concurrency": int(os.environ.get("FACTORY_CONCURRENCY", "2")),
        "maxCycles": int(os.environ.get("FACTORY_MAX_CYCLES", "3")),
        "pending": [],
        "active": [],
        "completed": [],
        "partial": [],
        "failed": [],
        "updatedAt": now(),
    }


def save_state(state: dict) -> None:
    JOBS.mkdir(parents=True, exist_ok=True)
    state["updatedAt"] = now()
    STATE.write_text(json.dumps(state, indent=2) + "\n")


def load_queue_types() -> list[str]:
    data = json.loads(CATALOG.read_text())
    q = data.get("queue") or []
    if q:
        return [item["type"] if isinstance(item, dict) else str(item) for item in q]
    # fallback batches
    types: list[str] = []
    seen: set[str] = set()
    for b in (data.get("batches") or {}).values():
        for t in b.get("types") or []:
            if t not in seen:
                seen.add(t)
                types.append(t)
    return types


def node_status_path(type_name: str) -> Path:
    safe = type_name.replace("/", "_")
    return JOBS / "nodes" / safe / "status.json"


def read_node_status(type_name: str) -> dict | None:
    p = node_status_path(type_name)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _pipeline_alive(st: dict) -> bool:
    """True if node still has a live pipeline/opencode process."""
    for key in ("pipelinePid", "pid", "opencodePid"):
        pid = st.get(key)
        if not isinstance(pid, int) or pid <= 0:
            continue
        try:
            os.kill(pid, 0)
            return True
        except Exception:
            pass
    # fallback pid files
    safe = str(st.get("type") or "").replace("/", "_")
    if not safe:
        return False
    for name in ("pipeline.pid", "opencode.pid"):
        p = JOBS / "nodes" / safe / name
        if p.exists():
            try:
                pid = int(p.read_text().strip())
                os.kill(pid, 0)
                return True
            except Exception:
                pass
    return False


def build_pending(include_partial: bool = True) -> list[str]:
    pending: list[str] = []
    s = load_state()
    skipped = set(s.get("skipped") or [])
    for t in load_queue_types():
        if t in skipped:
            continue
        st = read_node_status(t)
        if st is None:
            pending.append(t)
            continue
        stage = st.get("stage")
        verdict = st.get("verdict")
        if stage == "skipped":
            continue
        if verdict == "pass" or stage == "pass":
            continue
        # waitout: always re-queue (no live pipeline by design)
        if stage == "implement-waitout":
            pending.append(t)
            continue
        # actively running with live process — do not double-queue
        if stage in (
            "spec",
            "spec-corpus",
            "implement",
            "implement-wait",
            "validate-gates",
            "validate-llm",
        ):
            if _pipeline_alive(st):
                continue
            # stale mid-flight → re-queue
            pending.append(t)
            continue
        if stage in ("partial", "fail", "interrupted") or verdict == "fail":
            if include_partial:
                pending.append(t)
            continue
        # queued / unknown
        pending.append(t)
    return pending


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("show")
    sub.add_parser("models-get")
    mg = sub.add_parser("models-set")
    mg.add_argument("--spec")
    mg.add_argument("--implement")
    mg.add_argument("--validate")

    init = sub.add_parser("init-run")
    init.add_argument("--concurrency", type=int, default=None)
    init.add_argument("--resume", action="store_true")

    sub.add_parser("pending")
    mk = sub.add_parser("mark")
    mk.add_argument("type")
    mk.add_argument(
        "--bucket",
        choices=["completed", "partial", "failed", "active", "pending", "skipped", "clear-active"],
        required=True,
    )

    st = sub.add_parser("set-status")
    st.add_argument("status", choices=["idle", "running", "stopped"])
    st.add_argument("--pid", type=int)
    st.add_argument("--pgid", type=int)

    args = p.parse_args()

    if args.cmd == "show":
        print(json.dumps(load_state(), indent=2))
    elif args.cmd == "models-get":
        print(json.dumps(load_models(), indent=2))
    elif args.cmd == "models-set":
        m = load_models()
        if args.spec:
            m["spec"] = args.spec
        if args.implement:
            m["implement"] = args.implement
        if args.validate:
            m["validate"] = args.validate
        save_models(m)
        s = load_state()
        s["models"] = m
        save_state(s)
        print(json.dumps(m, indent=2))
    elif args.cmd == "init-run":
        # settings.json for concurrency / maxCycles when CLI omits them
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            from resolve_models import load_settings, load_global_models

            settings = load_settings()
            models = load_global_models()
        except Exception:
            settings = {"concurrency": 2, "maxCycles": 3, "implLock": True}
            models = load_models()
        conc = args.concurrency if args.concurrency is not None else int(settings.get("concurrency") or 2)
        max_c = int(os.environ.get("FACTORY_MAX_CYCLES") or settings.get("maxCycles") or 3)

        s = load_state()
        pending = build_pending(include_partial=True)
        completed = [
            t
            for t in load_queue_types()
            if (read_node_status(t) or {}).get("verdict") == "pass"
            or (read_node_status(t) or {}).get("stage") == "pass"
        ]
        if args.resume and s.get("runId") and s.get("status") in ("stopped", "running", "idle"):
            s["pending"] = pending
            s["active"] = []
            s["completed"] = completed
            s["status"] = "running"
            s["models"] = models
            s["concurrency"] = conc
            s["maxCycles"] = max_c
            s["implLock"] = bool(settings.get("implLock", True))
            save_state(s)
            print(
                json.dumps(
                    {
                        "runId": s["runId"],
                        "status": s["status"],
                        "pending": len(pending),
                        "completed": len(completed),
                        "concurrency": conc,
                        "maxCycles": max_c,
                        "models": models,
                    },
                    indent=2,
                )
            )
            return
        run_id = f"run-{time.strftime('%Y%m%d-%H%M%S')}"
        s = {
            "runId": run_id,
            "status": "running",
            "pid": None,
            "pgid": None,
            "models": models,
            "concurrency": conc,
            "maxCycles": max_c,
            "implLock": bool(settings.get("implLock", True)),
            "pending": pending,
            "active": [],
            "completed": completed,
            "partial": [],
            "failed": [],
            "updatedAt": now(),
        }
        save_state(s)
        print(
            json.dumps(
                {
                    "runId": run_id,
                    "status": "running",
                    "pending": len(pending),
                    "completed": len(completed),
                    "concurrency": conc,
                    "maxCycles": max_c,
                    "models": models,
                },
                indent=2,
            )
        )
    elif args.cmd == "pending":
        s = load_state()
        print("\n".join(s.get("pending") or build_pending()))
    elif args.cmd == "mark":
        s = load_state()
        t = args.type
        for k in ("pending", "active", "completed", "partial", "failed", "skipped"):
            s[k] = [x for x in (s.get(k) or []) if x != t]
        if args.bucket == "clear-active":
            pass
        else:
            s.setdefault(args.bucket, []).append(t)
        save_state(s)
        print("ok")
    elif args.cmd == "set-status":
        s = load_state()
        s["status"] = args.status
        if args.pid is not None:
            s["pid"] = args.pid
        if args.pgid is not None:
            s["pgid"] = args.pgid
        if args.status in ("stopped", "idle"):
            s["pid"] = None if args.pid is None else args.pid
            s["pgid"] = None if args.pgid is None else args.pgid
            s["active"] = []
        save_state(s)
        print(json.dumps({"status": s["status"], "runId": s.get("runId"), "pid": s.get("pid")}, indent=2))


if __name__ == "__main__":
    main()
