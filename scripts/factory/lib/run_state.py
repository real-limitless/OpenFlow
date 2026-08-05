#!/usr/bin/env python3
"""Read/write factory run-state + models checkpoint."""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
JOBS = ROOT / "scripts" / "factory" / ".jobs"
STATE = JOBS / "run-state.json"
STATE_LOCK = JOBS / "run-state.lock"
STATE_CORRUPT = JOBS / "run-state.corrupt.json"
MODELS = JOBS / "models.json"
CATALOG = ROOT / "docs" / "specs" / "catalog.json"


class StateCorruptError(RuntimeError):
    """run-state.json exists but is not parseable. Never recover silently."""


@contextlib.contextmanager
def _file_lock(path: Path, *, shared: bool = False):
    """flock a sidecar file. The factory runs several jobs at once, and every
    one of them read-modify-writes run-state.json."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_SH if shared else fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _atomic_write(path: Path, text: str) -> None:
    """Write via temp file + rename, so a failed write (ENOSPC/EDQUOT) leaves the
    previous contents intact instead of truncating them to garbage."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=f"{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


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


def _default_state() -> dict:
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


def _read_state_unlocked() -> dict:
    """Caller must already hold the state lock.

    A missing file is a fresh run and is fine. A file that exists but does not
    parse is NOT: swallowing that error and returning the default silently wipes
    pending/completed/partial for the whole run, which looks exactly like a run
    that legitimately finished with nothing done. Preserve a copy and refuse.
    """
    if not STATE.exists():
        return _default_state()
    raw = STATE.read_text(encoding="utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        # Copy, never move: leaving the damaged original in place keeps every
        # later call failing too, instead of resetting on the next invocation.
        with contextlib.suppress(OSError):
            if not STATE_CORRUPT.exists():
                _atomic_write(STATE_CORRUPT, raw)
        raise StateCorruptError(
            f"{STATE} exists but is not valid JSON ({exc}). "
            f"A copy of the damaged file is at {STATE_CORRUPT}. "
            "Refusing to continue: resetting to an empty state would silently "
            "discard pending/completed/partial for this run. Repair or delete "
            f"{STATE} to proceed."
        ) from exc


def _write_state_unlocked(state: dict) -> None:
    """Caller must already hold the state lock."""
    state["updatedAt"] = now()
    _atomic_write(STATE, json.dumps(state, indent=2) + "\n")


_state_lock_depth = 0


@contextlib.contextmanager
def _state_lock(*, shared: bool = False):
    """Reentrant flock on the state sidecar.

    flock attaches to the open file description, so a second open+flock from
    this same process would block against the first. build_pending() reads the
    state from inside init-run's transaction, so nesting must be a no-op.
    Assumes nesting only ever goes exclusive-outer -> shared-inner, which is the
    only direction that occurs here.
    """
    global _state_lock_depth
    if _state_lock_depth > 0:
        yield
        return
    with _file_lock(STATE_LOCK, shared=shared):
        _state_lock_depth += 1
        try:
            yield
        finally:
            _state_lock_depth -= 1


def load_state() -> dict:
    with _state_lock(shared=True):
        return _read_state_unlocked()


def save_state(state: dict) -> None:
    with _state_lock():
        _write_state_unlocked(state)


@contextlib.contextmanager
def state_transaction():
    """Hold the lock across a read-modify-write and yield the state to mutate.

    load_state() + save_state() as separate calls is a lost update whenever two
    jobs interleave -- the second writes back a snapshot taken before the first
    landed, silently dropping it. Every mutation below goes through here.
    """
    with _state_lock():
        state = _read_state_unlocked()
        yield state
        _write_state_unlocked(state)


def _dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for t in items:
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def load_queue_types() -> list[str]:
    """Return unique node types from catalog.queue (first occurrence wins)."""
    data = json.loads(CATALOG.read_text())
    q = data.get("queue") or []
    if q:
        types = [item["type"] if isinstance(item, dict) else str(item) for item in q]
        return _dedupe_preserve(types)
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
    seen: set[str] = set()
    for t in load_queue_types():
        if not t or t in seen or t in skipped:
            continue
        st = read_node_status(t)
        if st is None:
            seen.add(t)
            pending.append(t)
            continue
        stage = st.get("stage")
        verdict = st.get("verdict")
        if stage == "skipped":
            continue
        if verdict == "pass" or stage == "pass":
            continue
        # waitout: always re-queue (no live pipeline by design)
        # requeued: operator put it back deliberately after fixing something
        # outside the pipeline; skip the stale-failure filters below.
        if stage in ("implement-waitout", "requeued"):
            seen.add(t)
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
            seen.add(t)
            pending.append(t)
            continue
        if stage in ("partial", "fail", "interrupted") or verdict == "fail":
            # Do not auto-loop hard registration/auth failures (needs human / y after fix)
            if st.get("gateClass") == "hard_fail" and st.get("failReason") in (
                "impl_not_registered",
                "impl_not_in_runtime",
                "impl_no_executor",
                "impl_n8n_import",
                "auth_error",
                "bad_model",
                "opencode_missing",
            ):
                continue
            if int(st.get("failCount") or 0) >= 5 and st.get("failReason"):
                # stuck on same failure — wait for manual retry
                continue
            if include_partial:
                seen.add(t)
                pending.append(t)
            continue
        # queued / unknown
        seen.add(t)
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
        with state_transaction() as s:
            s["models"] = m
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

        # build_pending() reads the state itself; the lock is reentrant so this
        # whole read-decide-write stays a single atomic step.
        with state_transaction() as s:
            pending = build_pending(include_partial=True)
            completed = [
                t
                for t in load_queue_types()
                if (read_node_status(t) or {}).get("verdict") == "pass"
                or (read_node_status(t) or {}).get("stage") == "pass"
            ]
            resuming = (
                args.resume
                and s.get("runId")
                and s.get("status") in ("stopped", "running", "idle")
            )
            if resuming:
                run_id = s["runId"]
                s["pending"] = pending
                s["active"] = []
                s["completed"] = completed
                s["status"] = "running"
                s["models"] = models
                s["concurrency"] = conc
                s["maxCycles"] = max_c
                s["implLock"] = bool(settings.get("implLock", True))
            else:
                run_id = f"run-{time.strftime('%Y%m%d-%H%M%S')}"
                s.clear()
                s.update(
                    {
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
                )
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
        # Hottest concurrent path: every pipeline marks itself active on start and
        # completed/partial on exit, while the worker rewrites pending underneath.
        with state_transaction() as s:
            t = args.type
            for k in ("pending", "active", "completed", "partial", "failed", "skipped"):
                s[k] = _dedupe_preserve([x for x in (s.get(k) or []) if x != t])
            if args.bucket == "clear-active":
                pass
            else:
                bucket = s.setdefault(args.bucket, [])
                if t not in bucket:
                    bucket.append(t)
        print("ok")
    elif args.cmd == "set-status":
        with state_transaction() as s:
            s["status"] = args.status
            if args.pid is not None:
                s["pid"] = args.pid
            if args.pgid is not None:
                s["pgid"] = args.pgid
            if args.status in ("stopped", "idle"):
                s["pid"] = None if args.pid is None else args.pid
                s["pgid"] = None if args.pgid is None else args.pgid
                s["active"] = []
            out = {"status": s["status"], "runId": s.get("runId"), "pid": s.get("pid")}
        print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
