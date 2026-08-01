#!/usr/bin/env python3
"""
OpenFlow Factory Management TUI

Factory-wide + per-node control, live LLM activity tails.

  npm run factory:tui
  python3 scripts/factory/tui.py
"""
from __future__ import annotations

import curses
import json
import os
import re
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FACTORY = ROOT / "scripts" / "factory"
JOBS = FACTORY / ".jobs"
NODES_JOBS = JOBS / "nodes"
CATALOG = ROOT / "docs" / "specs" / "catalog.json"
STATE_PATH = JOBS / "run-state.json"
MODELS_PATH = JOBS / "models.json"
SETTINGS_PATH = JOBS / "settings.json"
MODELS_CACHE = JOBS / "opencode-models.cache.txt"
PIDFILE = JOBS / "factory.pid"
NODE_CTL = FACTORY / "lib" / "node_ctl.sh"

DEFAULT_MODELS = {
    "spec": "xai/grok-4.5",
    "implement": "featherless/zai-org/GLM-5.2",
    "validate": "xai/grok-4.5",
}

sys.path.insert(0, str(FACTORY / "lib"))
try:
    from resolve_models import (  # type: ignore
        clear_job_overrides,
        load_job_overrides,
        load_settings,
        resolve_models,
        save_job_overrides,
        save_settings,
    )
except Exception:  # pragma: no cover

    def load_settings() -> dict:
        return {"concurrency": 2, "maxCycles": 3, "implLock": True}

    def save_settings(s: dict) -> None:
        JOBS.mkdir(parents=True, exist_ok=True)
        SETTINGS_PATH.write_text(json.dumps(s, indent=2) + "\n")

    def load_job_overrides(_t: str) -> dict:
        return {}

    def save_job_overrides(_t: str, o: dict) -> Path:
        return Path(".")

    def clear_job_overrides(_t: str) -> None:
        return None

    def resolve_models(t: str | None = None, **_k: Any) -> dict:
        return dict(DEFAULT_MODELS)
ROLE_KEYS = ("spec", "implement", "validate")
ROLE_LABELS = {"spec": "SPEC", "implement": "IMPLEMENT", "validate": "VALIDATE"}
FALLBACK_MODELS = [
    "xai/grok-4.5",
    "opencode-go/grok-4.5",
    "opencode-go/glm-5.2",
    "featherless/zai-org/GLM-5.2",
    "opencode-go/kimi-k2.7-code",
    "opencode/big-pickle",
]
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
RUNNING_STAGES = {
    "spec",
    "spec-corpus",
    "implement",
    "implement-wait",
    "validate-gates",
    "validate-llm",
}
WAITOUT_STAGES = {"implement-waitout"}


@dataclass
class PipeStatus:
    type: str
    stage: str = "queued"
    cycle: int = 0
    verdict: str | None = None
    detail: str = ""
    updated_at: str = ""
    path: Path | None = None
    has_logs: bool = False
    last_log_tail: str = ""
    last_activity: str = ""
    priority: int = 0
    heartbeat: str = ""
    model: str = ""
    stage_log: str = ""
    pipeline_pid: int | None = None
    opencode_pid: int | None = None
    stale: bool = False
    job_models: dict[str, str] = field(default_factory=dict)  # overrides only
    resolved_models: dict[str, str] = field(default_factory=dict)
    interrupt_reason: str = ""
    interrupt_message: str = ""
    activity: dict[str, Any] = field(default_factory=dict)
    waitout_rounds: int = 0
    lock_holder: str = ""
    fail_reason: str = ""
    failed_stage: str = ""
    fail_count: int = 0
    attempt: int = 1


@dataclass
class AppState:
    pipes: list[PipeStatus] = field(default_factory=list)
    filtered: list[int] = field(default_factory=list)
    selected: int = 0
    scroll: int = 0
    message: str = ""
    last_refresh: float = 0
    auto_refresh: bool = True
    show_help: bool = False
    # live log focus
    log_mode: bool = False
    log_lines: list[str] = field(default_factory=list)
    log_scroll: int = 0
    log_follow: bool = True
    log_stage_pin: str = "auto"  # auto|spec|implement|validate|gate
    log_path: Path | None = None
    log_mtime: float = 0
    log_size: int = 0
    confirm: str = ""  # pending confirm action
    filter_mode: str = "pending"
    search: str = ""
    search_mode: bool = False
    models: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_MODELS))
    settings: dict[str, Any] = field(
        default_factory=lambda: {
            "concurrency": 2,
            "maxCycles": 3,
            "implLock": True,
            "implLockWaitSec": 300,
        }
    )
    run_state: dict[str, Any] = field(default_factory=dict)
    model_menu: bool = False
    model_menu_scope: str = "global"  # global | job
    model_job_type: str = ""
    model_job_draft: dict[str, str] = field(default_factory=dict)
    model_role_idx: int = 0
    all_models: list[str] = field(default_factory=list)
    model_filter: str = ""
    model_filter_mode: bool = False
    model_list_idx: int = 0
    model_list_scroll: int = 0
    model_filtered: list[str] = field(default_factory=list)
    models_dirty: bool = False
    settings_menu: bool = False
    settings_dirty: bool = False
    settings_idx: int = 0  # 0 conc 1 cycles 2 lock


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


def load_models() -> dict[str, str]:
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
    if MODELS_PATH.exists():
        try:
            m.update(json.loads(MODELS_PATH.read_text()))
        except Exception:
            pass
    return m


def save_models(models: dict[str, str]) -> None:
    JOBS.mkdir(parents=True, exist_ok=True)
    payload = {k: models[k] for k in ROLE_KEYS if k in models}
    MODELS_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    try:
        subprocess.run(
            [
                "python3",
                str(FACTORY / "lib" / "run_state.py"),
                "models-set",
                "--spec",
                payload.get("spec", DEFAULT_MODELS["spec"]),
                "--implement",
                payload.get("implement", DEFAULT_MODELS["implement"]),
                "--validate",
                payload.get("validate", DEFAULT_MODELS["validate"]),
            ],
            cwd=str(ROOT),
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass


def fetch_opencode_models(force: bool = False) -> list[str]:
    JOBS.mkdir(parents=True, exist_ok=True)
    if MODELS_CACHE.exists() and not force:
        try:
            if time.time() - MODELS_CACHE.stat().st_mtime < 3600:
                lines = [
                    ln.strip()
                    for ln in MODELS_CACHE.read_text(encoding="utf-8").splitlines()
                    if ln.strip() and "/" in ln and " " not in ln.strip()
                ]
                if lines:
                    return lines
        except Exception:
            pass
    models: list[str] = []
    try:
        proc = subprocess.run(
            ["opencode", "models"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=45,
        )
        for line in (proc.stdout or "").splitlines():
            s = line.strip()
            if s and "/" in s and " " not in s and len(s) < 120:
                models.append(s)
    except Exception:
        pass
    seen: set[str] = set()
    uniq = []
    for m in models:
        if m not in seen:
            seen.add(m)
            uniq.append(m)
    if not uniq:
        uniq = list(FALLBACK_MODELS)
    try:
        MODELS_CACHE.write_text("\n".join(uniq) + "\n", encoding="utf-8")
    except Exception:
        pass
    return uniq


def rebuild_model_filtered(state: AppState) -> None:
    q = state.model_filter.lower().strip()
    tokens = q.split() if q else []
    if not tokens:
        state.model_filtered = list(state.all_models)
    else:
        state.model_filtered = [
            m for m in state.all_models if all(t in m.lower() for t in tokens)
        ]
    role = ROLE_KEYS[state.model_role_idx]
    em = effective_models_for_menu(state)
    cur = em.get(role, "")
    if cur and cur in state.model_filtered:
        state.model_list_idx = state.model_filtered.index(cur)
    else:
        state.model_list_idx = 0
    state.model_list_scroll = 0


def open_model_menu(state: AppState, *, scope: str = "global") -> None:
    if not state.all_models:
        state.all_models = fetch_opencode_models(force=False)
    state.model_menu = True
    state.model_menu_scope = scope
    state.model_role_idx = 0
    state.model_filter = ""
    state.model_filter_mode = False
    state.models_dirty = False
    if scope == "job":
        sel = selected_pipe(state)
        if not sel:
            state.model_menu = False
            state.message = "No job selected"
            return
        state.model_job_type = sel.type
        # draft = resolved values so user sees effective models; overrides tracked on save
        state.model_job_draft = resolve_models(sel.type, apply_env=False)
        state.message = (
            f"JOB models · {sel.type} · Tab role · Enter set · s save · c clear · Esc"
        )
    else:
        state.model_job_type = ""
        state.model_job_draft = {}
        state.message = (
            f"GLOBAL models · {len(state.all_models)} · Tab role · Enter · s save · / filter"
        )
    rebuild_model_filtered(state)


def open_settings_menu(state: AppState) -> None:
    state.settings = load_settings()
    state.settings_menu = True
    state.settings_idx = 0
    state.settings_dirty = False
    state.message = "Factory settings · ←/→ adjust · s save · Esc"


def effective_models_for_menu(state: AppState) -> dict[str, str]:
    if state.model_menu_scope == "job" and state.model_job_draft:
        return state.model_job_draft
    return state.models


def load_run_state() -> dict[str, Any]:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception:
            pass
    return {"status": "idle", "pending": [], "completed": [], "partial": [], "active": []}


def load_queue_types() -> list[tuple[str, int]]:
    """Unique types from catalog.queue (first occurrence wins)."""
    if not CATALOG.exists():
        return []
    data = json.loads(CATALOG.read_text())
    q = data.get("queue") or []
    if q:
        out: list[tuple[str, int]] = []
        seen: set[str] = set()
        for i, item in enumerate(q):
            if isinstance(item, dict):
                t = str(item.get("type") or "")
                pri = int(item.get("priority") or i + 1)
            else:
                t = str(item)
                pri = i + 1
            if not t or t in seen:
                continue
            seen.add(t)
            out.append((t, pri))
        return out
    types: list[tuple[str, int]] = []
    seen: set[str] = set()
    n = 0
    for b in (data.get("batches") or {}).values():
        for t in b.get("types") or []:
            if t not in seen:
                seen.add(t)
                n += 1
                types.append((t, n))
    return types


def interesting_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    markers = ("→", "✱", "✓", "✗", "ERROR", "TIMEOUT", "RESULT", "verdict", "Read ", "Write ", "Edit ", "Grep ", "Skill ")
    return any(m in s for m in markers) or s.startswith(">") or s.startswith("#")


def tail_activity(path: Path | None, n: int = 12) -> tuple[str, str]:
    """Return (tail_block, last_interesting)."""
    if not path or not path.is_file():
        return "", ""
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return "", ""
    lines = [strip_ansi(x) for x in raw.splitlines() if strip_ansi(x).strip()]
    tail = "\n".join(lines[-n:])
    last = ""
    for ln in reversed(lines):
        if interesting_line(ln):
            last = ln.strip()[:80]
            break
    if not last and lines:
        last = lines[-1].strip()[:80]
    return tail, last


def resolve_stage_log(st: PipeStatus, pin: str = "auto") -> Path | None:
    if not st.path:
        return None
    if pin == "auto" and st.stage_log:
        p = Path(st.stage_log)
        if p.is_file():
            return p
    cycles = sorted(st.path.glob("cycle-*"), reverse=True)
    c = cycles[0] if cycles else None
    if st.cycle and st.path.joinpath(f"cycle-{st.cycle}").is_dir():
        c = st.path / f"cycle-{st.cycle}"
    if not c:
        gl = st.path / "gate-latest.log"
        return gl if gl.is_file() else None

    stage = pin if pin != "auto" else st.stage
    mapping = {
        "spec": c / "01-spec.out.log",
        "spec-corpus": c / "corpus.fetch.log",
        "implement": c / "02-implement.out.log",
        "implement-wait": c / "02-implement.out.log",
        "validate-gates": c / "gate.log",
        "gate": c / "gate.log",
        "validate-llm": c / "03-validate.out.log",
        "validate": c / "03-validate.out.log",
    }
    if stage in mapping and mapping[stage].is_file():
        return mapping[stage]
    # fallback newest non-empty log
    for f in (
        c / "03-validate.out.log",
        c / "02-implement.out.log",
        c / "01-spec.out.log",
        c / "gate.log",
        st.path / "gate-latest.log",
    ):
        if f.is_file() and f.stat().st_size > 0:
            return f
    return None


def heartbeat_stale(hb: str, stage: str) -> bool:
    if stage not in RUNNING_STAGES or not hb:
        return False
    try:
        # accept Z or +00:00
        ts = hb.replace("Z", "+00:00")
        if "T" in ts and "+" not in ts[10:] and not ts.endswith("Z"):
            ts = ts + "+00:00"
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - dt).total_seconds()
        return age > 90
    except Exception:
        return False


def discover_pipes() -> list[PipeStatus]:
    queue = load_queue_types()
    by_type: dict[str, PipeStatus] = {}
    for t, pri in queue:
        by_type[t] = PipeStatus(type=t, priority=pri, stage="queued")

    if NODES_JOBS.is_dir():
        for d in NODES_JOBS.iterdir():
            if not d.is_dir():
                continue
            st_path = d / "status.json"
            st = PipeStatus(type=d.name, path=d)
            if st_path.exists():
                try:
                    data = json.loads(st_path.read_text(encoding="utf-8"))
                    st.type = data.get("type") or d.name
                    st.stage = str(data.get("stage") or "queued")
                    st.cycle = int(data.get("cycle") or 0)
                    st.verdict = data.get("verdict")
                    st.detail = str(data.get("detail") or "")
                    st.updated_at = data.get("updatedAt") or ""
                    st.model = str(data.get("model") or "")
                    st.stage_log = str(data.get("stageLog") or "")
                    st.interrupt_reason = str(data.get("interruptReason") or "")
                    st.interrupt_message = str(
                        data.get("interruptMessage") or data.get("detail") or ""
                    )
                    st.activity = (
                        data.get("activity") if isinstance(data.get("activity"), dict) else {}
                    )
                    st.waitout_rounds = int(data.get("waitoutRounds") or 0)
                    st.lock_holder = str(data.get("lockHolder") or "")
                    st.fail_reason = str(data.get("failReason") or data.get("interruptReason") or "")
                    st.failed_stage = str(data.get("failedStage") or "")
                    st.fail_count = int(data.get("failCount") or 0)
                    st.attempt = int(data.get("attempt") or 1)
                    lf = data.get("lastFailure") if isinstance(data.get("lastFailure"), dict) else {}
                    if lf and not st.fail_reason:
                        st.fail_reason = str(lf.get("primary") or "")
                    if lf and not st.failed_stage:
                        st.failed_stage = str(lf.get("stage") or "")
                    if not st.fail_count and lf:
                        st.fail_count = int(lf.get("failCount") or 0)
                    for key, attr in (
                        ("pipelinePid", "pipeline_pid"),
                        ("pid", "pipeline_pid"),
                        ("opencodePid", "opencode_pid"),
                    ):
                        v = data.get(key)
                        if isinstance(v, int):
                            setattr(st, attr, v)
                except Exception:
                    st.stage = "unknown"
            # fail_count from ledger if status missing it
            if st.fail_count <= 0 and st.path:
                ledger = st.path / "failures.jsonl"
                if ledger.is_file():
                    try:
                        st.fail_count = sum(1 for ln in ledger.read_text(encoding="utf-8").splitlines() if ln.strip())
                    except Exception:
                        pass
            hb = d / "heartbeat"
            if hb.is_file():
                try:
                    st.heartbeat = hb.read_text(encoding="utf-8").strip()
                except Exception:
                    pass
            st.stale = heartbeat_stale(st.heartbeat, st.stage)
            st.job_models = load_job_overrides(st.type)
            st.resolved_models = resolve_models(st.type, apply_env=False)
            logp = resolve_stage_log(st, "auto")
            if logp:
                st.has_logs = True
                tail, act = tail_activity(logp, 8)
                st.last_log_tail = tail
                st.last_activity = act
            if st.type in by_type:
                st.priority = by_type[st.type].priority
            by_type[st.type] = st

    ordered: list[PipeStatus] = []
    seen: set[str] = set()
    for t, _ in queue:
        if t in by_type:
            st = by_type[t]
            if not st.job_models and not st.resolved_models:
                st.job_models = load_job_overrides(t)
                st.resolved_models = resolve_models(t, apply_env=False)
            ordered.append(st)
            seen.add(t)
    for t, st in by_type.items():
        if t not in seen:
            if not st.resolved_models:
                st.job_models = load_job_overrides(t)
                st.resolved_models = resolve_models(t, apply_env=False)
            ordered.append(st)
    return ordered


def pipe_bucket(st: PipeStatus) -> str:
    if st.verdict == "pass" or st.stage == "pass":
        return "pass"
    if st.stage == "skipped":
        return "skipped"
    if st.stage == "implement-waitout":
        return "waitout"  # still queued — show as pending-ish
    if st.stage in ("partial", "interrupted") or st.verdict == "fail" or st.stage == "fail":
        return "failed"
    if st.stage in RUNNING_STAGES:
        return "running"
    return "pending"


def lock_holder() -> str:
    p = JOBS / "impl.lock.holder"
    if p.exists():
        try:
            return p.read_text(encoding="utf-8").strip().split()[0]
        except Exception:
            return "?"
    return ""


def apply_filter(state: AppState) -> None:
    state.filtered = []
    q = state.search.lower().strip()
    for i, p in enumerate(state.pipes):
        b = pipe_bucket(p)
        fm = state.filter_mode
        if fm == "pending" and b not in ("pending", "waitout"):
            continue
        if fm == "waitout" and b != "waitout":
            continue
        if fm == "running" and b != "running":
            continue
        if fm == "failed" and b != "failed":
            continue
        if fm == "pass" and b != "pass":
            continue
        if fm == "skipped" and b != "skipped":
            continue
        if q and q not in p.type.lower() and q not in (p.stage or "").lower() and q not in (
            p.interrupt_reason or ""
        ).lower() and q not in (p.detail or "").lower():
            continue
        state.filtered.append(i)
    if state.selected >= len(state.filtered):
        state.selected = max(0, len(state.filtered) - 1)


def stage_color(st: PipeStatus) -> int:
    if st.stale:
        return 1
    b = pipe_bucket(st)
    if b == "pass":
        return 2
    if b == "failed":
        return 1
    if b == "running":
        return 3
    if b == "waitout":
        return 3  # yellow-ish wait
    if b == "skipped":
        return 5
    return 0


def stage_label(st: PipeStatus) -> str:
    if st.verdict == "pass" or st.stage == "pass":
        return "PASS"
    if st.stage == "partial":
        fc = f" ×{st.fail_count}" if st.fail_count else ""
        return f"PARTIAL{fc}"
    if st.stage == "implement-waitout":
        r = st.waitout_rounds or 0
        return f"WAITOUT r{r}"
    if st.stage == "interrupted":
        reason = st.interrupt_reason or ""
        if reason == "impl_lock_timeout":
            return "INT lock-wait"
        if reason == "killed_by_operator":
            return "INT killed"
        if reason:
            return f"INT {reason[:10]}"
        return "INTERRUPTED"
    if st.stage == "skipped":
        return "SKIPPED"
    if st.verdict == "fail" or st.stage == "fail":
        fr = st.fail_reason or ""
        fs = st.failed_stage or ""
        fc = f"×{st.fail_count}" if st.fail_count else ""
        if fr and fs:
            return f"FAIL {fs[:4]}/{fr[:8]}{fc}"
        if fr:
            return f"FAIL {fr[:10]}{fc}"
        return f"FAIL c{st.cycle}{fc}"
    if st.stage == "queued":
        if st.fail_count:
            return f"queued ×{st.fail_count}"
        return "queued"
    if st.stage == "implement-wait":
        return f"impl-WAIT c{st.cycle}"
    if st.stale:
        return f"STALE {st.stage}"
    return f"{st.stage} c{st.cycle}"


def short_time(iso: str) -> str:
    if not iso:
        return "-"
    try:
        return iso[11:19] if "T" in iso else iso[:19]
    except Exception:
        return "-"


def factory_alive() -> tuple[bool, str]:
    if PIDFILE.exists():
        try:
            pid = int(PIDFILE.read_text().strip())
            os.kill(pid, 0)
            return True, str(pid)
        except Exception:
            return False, ""
    st = load_run_state()
    if st.get("status") == "running" and st.get("pid"):
        try:
            os.kill(int(st["pid"]), 0)
            return True, str(st["pid"])
        except Exception:
            pass
    return False, ""


def selected_pipe(state: AppState) -> PipeStatus | None:
    if not state.filtered:
        return None
    return state.pipes[state.filtered[state.selected]]


def node_ctl(args: list[str], timeout: float = 20) -> str:
    """Blocking ctl (prefer node_ctl_bg for TUI keys)."""
    try:
        r = subprocess.run(
            ["bash", str(NODE_CTL), *args],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        out = (r.stdout or "").strip() or (r.stderr or "").strip()
        return out[:200] or f"rc={r.returncode}"
    except Exception as e:
        return f"error: {e}"


def node_ctl_bg(args: list[str]) -> None:
    """Fire-and-forget — keeps TUI responsive (n/y/r/k/L)."""
    log = JOBS / "factory.log"
    JOBS.mkdir(parents=True, exist_ok=True)
    try:
        with open(log, "a", encoding="utf-8") as lf:
            lf.write(f"\n=== TUI ctl {' '.join(args)} {datetime.now().isoformat()} ===\n")
        subprocess.Popen(
            ["bash", str(NODE_CTL), *args],
            cwd=str(ROOT),
            stdout=open(log, "a", encoding="utf-8"),
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except Exception as e:
        raise RuntimeError(str(e)) from e


def load_log_lines(path: Path | None, max_lines: int = 4000) -> list[str]:
    if not path or not path.is_file():
        return ["(no log file yet — waiting for LLM output)"]
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return [f"(read error: {e})"]
    lines = [strip_ansi(x) for x in raw.splitlines()]
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    return lines or ["(empty log)"]


def open_live_log(state: AppState) -> None:
    sel = selected_pipe(state)
    if not sel:
        state.message = "No pipe selected"
        return
    path = resolve_stage_log(sel, state.log_stage_pin)
    state.log_path = path
    state.log_lines = load_log_lines(path)
    state.log_follow = True
    state.log_mode = True
    # jump bottom
    state.log_scroll = max(0, len(state.log_lines) - 1)
    try:
        if path and path.is_file():
            stt = path.stat()
            state.log_mtime = stt.st_mtime
            state.log_size = stt.st_size
    except Exception:
        pass
    state.message = f"LIVE · {sel.type} · {path.name if path else '?'} · G=bottom End · Space=follow"


def refresh_live_log(state: AppState) -> None:
    sel = selected_pipe(state)
    if not sel:
        return
    path = resolve_stage_log(sel, state.log_stage_pin)
    state.log_path = path
    if not path or not path.is_file():
        return
    try:
        stt = path.stat()
        if stt.st_mtime == state.log_mtime and stt.st_size == state.log_size:
            return
        state.log_mtime = stt.st_mtime
        state.log_size = stt.st_size
    except Exception:
        return
    prev_len = len(state.log_lines)
    state.log_lines = load_log_lines(path)
    if state.log_follow:
        state.log_scroll = max(0, len(state.log_lines) - 1)
    elif len(state.log_lines) < prev_len:
        state.log_scroll = min(state.log_scroll, max(0, len(state.log_lines) - 1))


def refresh_app(state: AppState, *, reload_models: bool = True) -> None:
    if reload_models and not state.model_menu and not state.models_dirty and not state.settings_menu:
        state.models = load_models()
        state.settings = load_settings()
    state.run_state = load_run_state()
    state.pipes = discover_pipes()
    apply_filter(state)
    state.last_refresh = time.time()
    if state.log_mode:
        refresh_live_log(state)


def start_factory(state: AppState, resume: bool = False, dry: bool = False) -> None:
    save_models(state.models)
    save_settings(state.settings)
    state.models_dirty = False
    state.settings_dirty = False
    JOBS.mkdir(parents=True, exist_ok=True)
    log = JOBS / "factory.log"
    conc = int(state.settings.get("concurrency") or 2)
    env = {
        **os.environ,
        "FACTORY_MODEL_SPEC": state.models["spec"],
        "FACTORY_MODEL_IMPL": state.models["implement"],
        "FACTORY_MODEL_VAL": state.models["validate"],
        "FACTORY_CONCURRENCY": str(conc),
        "FACTORY_MAX_CYCLES": str(int(state.settings.get("maxCycles") or 3)),
        "FACTORY_IMPL_LOCK": "1" if state.settings.get("implLock", True) else "0",
        "FACTORY_IMPL_LOCK_WAIT": str(int(state.settings.get("implLockWaitSec") or 300)),
    }
    if dry:
        env["FACTORY_DRY_RUN"] = "1"
    cmd = [
        "bash",
        str(FACTORY / "run_queue.sh"),
        "resume" if resume else "start",
        "--concurrency",
        str(conc),
    ]
    if dry:
        cmd.append("--dry-run")
    with open(log, "a", encoding="utf-8") as lf:
        lf.write(
            f"\n=== TUI {'dry-' if dry else ''}{('resume' if resume else 'start')} "
            f"{datetime.now().isoformat()} ===\n"
            f"models={json.dumps(state.models)} settings={json.dumps(state.settings)}\n"
        )
    subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        stdout=open(log, "a", encoding="utf-8"),
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    time.sleep(0.4)
    alive, pid = factory_alive()
    state.message = (
        f"{'Dry-run' if dry else ('Resume' if resume else 'Start')} "
        f"pid={pid or '…'} conc={conc} SPEC={state.models['spec']}"
    )
    refresh_app(state, reload_models=False)


def stop_factory(state: AppState) -> None:
    """Blocking stop: kill worker + every node agent (incl. TUI orphans)."""
    state.message = "FACTORY STOP — killing worker + all agents…"
    log = JOBS / "factory.log"
    JOBS.mkdir(parents=True, exist_ok=True)
    try:
        with open(log, "a", encoding="utf-8") as lf:
            lf.write(f"\n=== TUI FACTORY STOP {datetime.now().isoformat()} ===\n")
        r = subprocess.run(
            ["bash", str(FACTORY / "run_queue.sh"), "stop"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=90,
        )
        out = ((r.stdout or "") + "\n" + (r.stderr or "")).strip()
        try:
            with open(log, "a", encoding="utf-8") as lf:
                lf.write(out + "\n")
        except Exception:
            pass
        # parse leftover
        leftover = "?"
        for line in out.splitlines():
            if "leftover_agents=" in line:
                leftover = line.split("leftover_agents=")[-1].split()[0]
        if r.returncode == 0 and leftover in ("0", "0\n"):
            state.message = "FACTORY STOPPED — all agents killed"
        elif leftover not in ("?", ""):
            state.message = f"FACTORY STOPPED — leftover_agents={leftover} (check factory.log)"
        else:
            state.message = f"FACTORY STOP rc={r.returncode} — see factory.log"
    except subprocess.TimeoutExpired:
        state.message = "FACTORY STOP timed out (90s) — try: npm run factory:stop"
    except Exception as e:
        state.message = f"FACTORY STOP error: {e}"
    time.sleep(0.2)
    refresh_app(state, reload_models=False)


def counts(state: AppState) -> dict[str, int]:
    c = {
        "all": 0,
        "pending": 0,
        "running": 0,
        "pass": 0,
        "failed": 0,
        "skipped": 0,
        "waitout": 0,
    }
    for p in state.pipes:
        c["all"] += 1
        b = pipe_bucket(p)
        c[b] = c.get(b, 0) + 1
    return c


def activity_line(st: PipeStatus) -> str:
    act = st.activity or {}
    if not act and st.stage not in RUNNING_STAGES:
        if st.interrupt_message:
            return st.interrupt_message[:70]
        return st.detail[:70] if st.detail else ""
    state = act.get("state") or "?"
    tps = act.get("estTokensPerSec") or 0
    bps = act.get("logBytesPerSec") or 0
    silent = act.get("silentSec") or 0
    return f"{state} ~{tps} tok/s log {bps}B/s silent {silent}s"


def draw_footer(stdscr: Any, h: int, w: int, state: AppState) -> None:
    if state.confirm:
        keys = f"Confirm {state.confirm}? [y]es [n]o"
    elif state.settings_menu:
        keys = "[↑↓]field [←/→]adjust [s]ave [Esc]  (incl. lock-wait sec)"
    elif state.model_menu:
        if state.model_menu_scope == "job":
            keys = "[Tab]role [↑↓] [Enter]set [s]ave [c]lear-job [/]filter [Esc]"
        else:
            keys = "[Tab]role [↑↓]model [Enter]assign [/]filter [s]ave [Esc]back"
    elif state.log_mode:
        fl = "LIVE" if state.log_follow else "PAUSED"
        keys = (
            f"[{fl}] [G/End]bottom [g/Home]top [Space]follow [1/2/3/0]stage "
            f"[r]etry [k]ill [Esc]back"
        )
    else:
        keys = (
            "[S/C/X] [m/M]models [b]atch [y]continue [L]bypass-lock "
            "[r]retry [H]hist [n]ow [k]ill [Enter]LIVE [q]"
        )
    try:
        stdscr.attron(curses.A_DIM)
        stdscr.addnstr(h - 2, 0, keys[: w - 1], w - 1)
        stdscr.attroff(curses.A_DIM)
        stdscr.addnstr(h - 1, 0, (state.message or "")[: w - 1].ljust(max(0, w - 1)), max(0, w - 1))
    except curses.error:
        pass


def draw_logs(stdscr: Any, state: AppState, h: int, w: int) -> None:
    sel = selected_pipe(state)
    path = state.log_path
    fl = "● LIVE" if state.log_follow else "⏸ PAUSED"
    pin = state.log_stage_pin
    try:
        stdscr.attron(curses.A_BOLD)
        hdr = (
            f" {fl}  {sel.type if sel else '?'}  stage={sel.stage if sel else '?'}  "
            f"pin={pin}  model={sel.model if sel else '-'}  "
            f"pid={sel.opencode_pid or sel.pipeline_pid or '-'}  "
            f"{path.name if path else 'no-log'}  bytes={state.log_size}  "
            f"[G]bottom [g]top [Space]follow Esc"
        )
        stdscr.addnstr(2, 0, hdr[: w - 1], w - 1)
        stdscr.attroff(curses.A_BOLD)
    except curses.error:
        pass

    view_h = max(1, h - 5)
    n = len(state.log_lines)
    if state.log_follow:
        start = max(0, n - view_h)
        state.log_scroll = start
    else:
        start = max(0, min(state.log_scroll, max(0, n - view_h)))
        state.log_scroll = start

    for i in range(view_h):
        idx = start + i
        if idx >= n:
            break
        line = state.log_lines[idx]
        try:
            attr = curses.A_NORMAL
            if interesting_line(line):
                attr |= curses.color_pair(4)
            stdscr.attron(attr)
            stdscr.addnstr(3 + i, 0, line[: w - 1], w - 1)
            stdscr.attroff(attr)
        except curses.error:
            pass


def draw_models(stdscr: Any, state: AppState, h: int, w: int) -> None:
    role = ROLE_KEYS[state.model_role_idx]
    em = effective_models_for_menu(state)
    scope = f"JOB {state.model_job_type}" if state.model_menu_scope == "job" else "GLOBAL"
    try:
        stdscr.attron(curses.A_BOLD)
        extra = " c=clear-job" if state.model_menu_scope == "job" else ""
        stdscr.addnstr(
            3,
            2,
            f"{scope} ({len(state.model_filtered)}/{len(state.all_models)})  Tab role Enter set s save{extra} / filter Esc"[
                : w - 3
            ],
            w - 3,
        )
        stdscr.attroff(curses.A_BOLD)
    except curses.error:
        pass
    x = 2
    for i, rk in enumerate(ROLE_KEYS):
        label = f" {ROLE_LABELS[rk]} "
        try:
            if i == state.model_role_idx:
                stdscr.attron(curses.A_REVERSE | curses.color_pair(4))
            else:
                stdscr.attron(curses.A_DIM)
            stdscr.addnstr(5, x, label[: max(0, w - x - 1)], max(0, w - x - 1))
            if i == state.model_role_idx:
                stdscr.attroff(curses.A_REVERSE | curses.color_pair(4))
            else:
                stdscr.attroff(curses.A_DIM)
            x += len(label) + 2
        except curses.error:
            pass
    try:
        tag = ""
        if state.model_menu_scope == "job":
            ov = load_job_overrides(state.model_job_type)
            tag = " [override]" if role in ov else " [global unless set]"
        stdscr.addnstr(
            6, 2,
            f"current {ROLE_LABELS[role]} = {em.get(role, '')}{tag}"[: w - 3],
            w - 3,
        )
        filt = (
            f" Filter: {state.model_filter}_"
            if state.model_filter_mode
            else (f" Filter: {state.model_filter}" if state.model_filter else " Filter: (/ to type)")
        )
        stdscr.addnstr(7, 2, filt[: w - 3], w - 3)
    except curses.error:
        pass
    list_top = 9
    view_h = max(1, h - list_top - 3)
    n = len(state.model_filtered)
    if state.model_list_idx < state.model_list_scroll:
        state.model_list_scroll = state.model_list_idx
    if state.model_list_idx >= state.model_list_scroll + view_h:
        state.model_list_scroll = state.model_list_idx - view_h + 1
    for row in range(view_h):
        idx = state.model_list_scroll + row
        if idx >= n:
            break
        name = state.model_filtered[idx]
        mark = "▶" if idx == state.model_list_idx else " "
        assigned = "".join(f"[{ROLE_LABELS[rk][:1]}]" for rk in ROLE_KEYS if em.get(rk) == name)
        line = f"{mark} {name}  {assigned}"
        try:
            attr = curses.A_REVERSE if idx == state.model_list_idx else curses.A_NORMAL
            if em.get(role) == name:
                attr |= curses.color_pair(2)
            stdscr.attron(attr)
            stdscr.addnstr(list_top + row, 2, line[: w - 3], w - 3)
            stdscr.attroff(attr)
        except curses.error:
            pass


def draw_settings(stdscr: Any, state: AppState, h: int, w: int) -> None:
    s = state.settings
    try:
        stdscr.attron(curses.A_BOLD)
        stdscr.addnstr(3, 2, "Factory parallel / batch settings"[: w - 3], w - 3)
        stdscr.attroff(curses.A_BOLD)
        stdscr.addnstr(
            4, 2,
            "Jobs at once = concurrency. IMPL serial if lock ON. L bypasses per job."[: w - 3],
            w - 3,
        )
    except curses.error:
        pass
    rows = [
        ("concurrency (jobs at once)", str(s.get("concurrency", 2)), "1-8"),
        ("max cycles per job", str(s.get("maxCycles", 3)), "1-5"),
        ("impl lock (serialize IMPLEMENT)", "ON" if s.get("implLock", True) else "OFF", "space"),
        ("impl lock wait (seconds)", str(s.get("implLockWaitSec", 300)), "30-3600"),
        (
            "lock wait policy",
            str(s.get("lockWaitPolicy", "waitout")),
            "waitout|interrupt",
        ),
        ("waitout backoff (sec)", str(s.get("waitoutBackoffSec", 10)), "0-600"),
    ]
    n = len(rows)
    for i, (label, val, hint) in enumerate(rows):
        y = 6 + i * 2
        mark = "▶" if i == state.settings_idx else " "
        try:
            attr = curses.A_REVERSE if i == state.settings_idx else curses.A_NORMAL
            stdscr.attron(attr)
            stdscr.addnstr(y, 2, f"{mark} {label}: [{val}]  ({hint})"[: w - 3], w - 3)
            stdscr.attroff(attr)
        except curses.error:
            pass
    try:
        d = " *" if state.settings_dirty else ""
        stdscr.addnstr(
            6 + n * 2, 2,
            f"s = save .jobs/settings.json{d} · next Start applies wait/conc"[: w - 3],
            w - 3,
        )
        if not s.get("implLock", True):
            stdscr.attron(curses.color_pair(1))
            stdscr.addnstr(
                7 + n * 2, 2,
                "WARN: global lock OFF — parallel IMPL may race registry"[: w - 3],
                w - 3,
            )
            stdscr.attroff(curses.color_pair(1))
    except curses.error:
        pass


def draw(stdscr: Any, state: AppState) -> None:
    stdscr.erase()
    h, w = stdscr.getmaxyx()
    alive, pid = factory_alive()
    rs = state.run_state.get("status") or "idle"
    c = counts(state)

    title = f" OpenFlow Factory  ·  {rs.upper()}  ·  pid={pid or '-'}  "
    try:
        stdscr.attron(curses.A_BOLD | curses.color_pair(4))
        stdscr.addnstr(0, 0, title.ljust(max(0, w - 1)), max(0, w - 1))
        stdscr.attroff(curses.A_BOLD | curses.color_pair(4))
    except curses.error:
        pass

    dirty = "*" if state.models_dirty else ""
    holder = lock_holder()
    lock_s = f"  hold={holder}" if holder else ""
    st = state.settings
    lock_flag = "on" if st.get("implLock", True) else "off"
    meta = (
        f" pipes={c['all']} pend={c['pending']} waitout={c.get('waitout', 0)} "
        f"run={c['running']} pass={c['pass']} fail={c['failed']}  "
        f"conc={st.get('concurrency', 2)} lock={lock_flag}/{st.get('lockWaitPolicy', 'waitout')}"
        f" wait={st.get('implLockWaitSec', 300)}s{lock_s}  "
        f"IMPL={state.models['implement']}{dirty}"
    )
    try:
        stdscr.addnstr(1, 0, meta[: max(0, w - 1)], max(0, w - 1))
    except curses.error:
        pass

    if state.search_mode:
        try:
            stdscr.addnstr(2, 0, f" Search: {state.search}_"[: w - 1], w - 1)
        except curses.error:
            pass
    elif state.search:
        try:
            stdscr.addnstr(2, 0, f" Search: {state.search}"[: w - 1], w - 1)
        except curses.error:
            pass

    if state.show_help:
        help_lines = [
            "FACTORY:  S start  C resume-queue  X stop-all  m GLOBAL  b batch",
            "JOB:      y continue-last-stage  L bypass-impl-lock+continue",
            "          Shift+L steal lock (kill holder) + continue",
            "          r full-retry (keeps failure history)  n run-now  k kill",
            "          M job-models  H failure-history",
            "LOGS:     Enter LIVE  G bottom  g top  Space follow",
            "",
            "n/y/L/k run in background — TUI must not freeze.",
            "impl-WAIT: L skips queue; b sets lock-wait seconds (default 300).",
            "Isolation: n8n pack only under /tmp for SPEC.",
        ]
        for i, line in enumerate(help_lines):
            if 4 + i >= h - 2:
                break
            try:
                stdscr.addnstr(4 + i, 2, line[: w - 3], w - 3)
            except curses.error:
                pass
        draw_footer(stdscr, h, w, state)
        stdscr.refresh()
        return

    if state.settings_menu:
        draw_settings(stdscr, state, h, w)
        draw_footer(stdscr, h, w, state)
        stdscr.refresh()
        return

    if state.model_menu:
        draw_models(stdscr, state, h, w)
        draw_footer(stdscr, h, w, state)
        stdscr.refresh()
        return

    if state.log_mode:
        draw_logs(stdscr, state, h, w)
        draw_footer(stdscr, h, w, state)
        stdscr.refresh()
        return

    # ── list + live strip ─────────────────────────────────────────
    hdr = f"{'#':>4}  {'TYPE':<38}  {'STAGE':<14}  {'C':>2}  {'UPD':<8}  ACTIVITY"
    try:
        stdscr.attron(curses.A_DIM)
        stdscr.addnstr(3, 0, hdr[: w - 1], w - 1)
        stdscr.attroff(curses.A_DIM)
    except curses.error:
        pass

    # reserve bottom strip for live activity
    strip_h = min(10, max(5, h // 3))
    view_h = max(1, h - 6 - strip_h)
    if state.selected < state.scroll:
        state.scroll = state.selected
    if state.selected >= state.scroll + view_h:
        state.scroll = state.selected - view_h + 1

    for row_i in range(view_h):
        fi = state.scroll + row_i
        if fi >= len(state.filtered):
            break
        pi = state.filtered[fi]
        pipe = state.pipes[pi]
        y = 4 + row_i
        mark = "▶" if fi == state.selected else " "
        star = "★" if pipe.job_models else " "
        act = (
            activity_line(pipe)
            or pipe.last_activity
            or pipe.detail
            or ""
        )[: max(8, w - 74)]
        row = (
            f"{mark}{fi + 1:>3}{star} {pipe.type:<36}  {stage_label(pipe):<14}  "
            f"{pipe.cycle:>2}  {short_time(pipe.updated_at):<8}  {act}"
        )
        color = stage_color(pipe)
        try:
            attr = curses.A_REVERSE if fi == state.selected else curses.A_NORMAL
            if color:
                attr |= curses.color_pair(color)
            stdscr.attron(attr)
            stdscr.addnstr(y, 0, row[: w - 1], w - 1)
            stdscr.attroff(attr)
        except curses.error:
            pass

    # live strip for selection
    dy = 4 + view_h
    sel = selected_pipe(state)
    try:
        stdscr.attron(curses.A_DIM)
        stdscr.addnstr(dy, 0, ("─" * (w - 1))[: w - 1], w - 1)
        stdscr.attroff(curses.A_DIM)
        if sel:
            fl = "LIVE" if sel.stage in RUNNING_STAGES else "LOG"
            stale = " STALE?" if sel.stale else ""
            stdscr.attron(curses.A_BOLD | curses.color_pair(3 if not sel.stale else 1))
            jm = sel.resolved_models or {}
            jtag = ""
            if sel.job_models:
                parts = [
                    f"{k[0].upper()}={sel.job_models[k].split('/')[-1][:12]}"
                    for k in ROLE_KEYS
                    if k in sel.job_models
                ]
                jtag = " ★" + ",".join(parts)
            wait_hint = ""
            if sel.stage in ("implement-wait", "implement-waitout"):
                wait_hint = "  L=bypass-lock"
            reason = ""
            if sel.stage == "interrupted" and sel.interrupt_message:
                reason = f"  WHY: {sel.interrupt_message[:40]}"
            elif (sel.stage in ("fail", "partial") or sel.fail_count) and (
                sel.fail_reason or sel.detail
            ):
                reason = (
                    f"  WHY: [{sel.failed_stage or '?'}] {sel.fail_reason or sel.detail[:28]}"
                    f"{' ×' + str(sel.fail_count) if sel.fail_count else ''} [h=history]"
                )
            elif sel.stage == "implement-waitout":
                reason = f"  WHY: {sel.detail[:40]}" if sel.detail else "  WHY: lock busy, still queued"
            act = activity_line(sel)
            att = f" a{sel.attempt}" if sel.attempt and sel.attempt > 1 else ""
            stdscr.addnstr(
                dy + 1,
                0,
                (
                    f" [{fl}{stale}] {sel.type}  {stage_label(sel)}{att}  "
                    f"{act or ('run=' + (sel.model or jm.get('implement') or '-'))}{jtag}  "
                    f"oc={sel.opencode_pid or '-'}{reason}{wait_hint}"
                )[: w - 1],
                w - 1,
            )
            stdscr.attroff(curses.A_BOLD | curses.color_pair(3 if not sel.stale else 1))
            # second line: full interrupt / waitout reason
            if sel.interrupt_message or (sel.stage == "implement-waitout" and sel.detail):
                try:
                    msg = sel.interrupt_message or sel.detail
                    stdscr.attron(curses.color_pair(1 if sel.stage == "interrupted" else 3))
                    stdscr.addnstr(dy + 2, 2, f"reason: {msg}"[: w - 3], w - 3)
                    stdscr.attroff(curses.color_pair(1 if sel.stage == "interrupted" else 3))
                except curses.error:
                    pass
            tail_lines = (sel.last_log_tail or "(no activity yet)").splitlines()
            log_base = dy + 3 if (sel.interrupt_message or sel.stage == "implement-waitout") else dy + 2
            for j, line in enumerate(tail_lines[-(strip_h - 3) :]):
                if log_base + j >= h - 2:
                    break
                attr = curses.color_pair(4) if interesting_line(line) else curses.A_NORMAL
                stdscr.attron(attr)
                stdscr.addnstr(log_base + j, 2, line[: w - 3], w - 3)
                stdscr.attroff(attr)
        else:
            stdscr.addnstr(dy + 1, 2, "(no selection)", w - 3)
    except curses.error:
        pass

    draw_footer(stdscr, h, w, state)
    stdscr.refresh()


def handle_settings_menu(state: AppState, ch: int) -> None:
    s = state.settings
    nfields = 6
    if ch in (27, ord("q")):
        if state.settings_dirty:
            save_settings(s)
            state.settings_dirty = False
            state.message = "Settings saved"
        state.settings_menu = False
        return
    if ch in (curses.KEY_UP, ord("k")):
        state.settings_idx = (state.settings_idx - 1) % nfields
        return
    if ch in (curses.KEY_DOWN, ord("j")):
        state.settings_idx = (state.settings_idx + 1) % nfields
        return
    if ch in (curses.KEY_LEFT, ord("h"), ord("-")):
        if state.settings_idx == 0:
            s["concurrency"] = max(1, int(s.get("concurrency", 2)) - 1)
        elif state.settings_idx == 1:
            s["maxCycles"] = max(1, int(s.get("maxCycles", 3)) - 1)
        elif state.settings_idx == 2:
            s["implLock"] = not bool(s.get("implLock", True))
        elif state.settings_idx == 3:
            s["implLockWaitSec"] = max(30, int(s.get("implLockWaitSec", 300)) - 30)
        elif state.settings_idx == 4:
            s["lockWaitPolicy"] = (
                "interrupt" if s.get("lockWaitPolicy", "waitout") == "waitout" else "waitout"
            )
        elif state.settings_idx == 5:
            s["waitoutBackoffSec"] = max(0, int(s.get("waitoutBackoffSec", 10)) - 5)
        state.settings_dirty = True
        return
    if ch in (curses.KEY_RIGHT, ord("l"), ord("+"), ord("=")):
        if state.settings_idx == 0:
            s["concurrency"] = min(8, int(s.get("concurrency", 2)) + 1)
        elif state.settings_idx == 1:
            s["maxCycles"] = min(5, int(s.get("maxCycles", 3)) + 1)
        elif state.settings_idx == 2:
            s["implLock"] = not bool(s.get("implLock", True))
        elif state.settings_idx == 3:
            s["implLockWaitSec"] = min(3600, int(s.get("implLockWaitSec", 300)) + 30)
        elif state.settings_idx == 4:
            s["lockWaitPolicy"] = (
                "interrupt" if s.get("lockWaitPolicy", "waitout") == "waitout" else "waitout"
            )
        elif state.settings_idx == 5:
            s["waitoutBackoffSec"] = min(600, int(s.get("waitoutBackoffSec", 10)) + 5)
        state.settings_dirty = True
        return
    if ch == ord(" "):
        if state.settings_idx == 2:
            s["implLock"] = not bool(s.get("implLock", True))
            state.settings_dirty = True
        elif state.settings_idx == 4:
            s["lockWaitPolicy"] = (
                "interrupt" if s.get("lockWaitPolicy", "waitout") == "waitout" else "waitout"
            )
            state.settings_dirty = True
        return
    if ch == ord("s"):
        save_settings(s)
        state.settings_dirty = False
        state.message = (
            f"Saved conc={s.get('concurrency')} wait={s.get('implLockWaitSec')}s "
            f"policy={s.get('lockWaitPolicy', 'waitout')}"
        )
        return


def handle_model_menu(state: AppState, ch: int) -> None:
    if state.model_filter_mode:
        if ch in (27,):
            state.model_filter_mode = False
            return
        if ch in (10, 13):
            state.model_filter_mode = False
            rebuild_model_filtered(state)
            return
        if ch in (curses.KEY_BACKSPACE, 127, 8):
            state.model_filter = state.model_filter[:-1]
            rebuild_model_filtered(state)
            return
        if 32 <= ch < 127:
            state.model_filter += chr(ch)
            rebuild_model_filtered(state)
            return
        return

    if ch in (27, ord("q")):
        if state.models_dirty:
            if state.model_menu_scope == "job" and state.model_job_type:
                # persist only diffs vs global as overrides
                global_m = load_models()
                ov = {
                    k: state.model_job_draft[k]
                    for k in ROLE_KEYS
                    if state.model_job_draft.get(k) and state.model_job_draft.get(k) != global_m.get(k)
                }
                # also keep explicit overrides user set even if equal? prefer draft keys that differ from load at open
                # simpler: save full draft roles that user touched via Enter — use draft vs global
                save_job_overrides(state.model_job_type, ov if ov else state.model_job_draft)
                # If draft equals resolved with no intent, save non-empty draft keys as overrides when dirty
                if not ov and state.model_job_draft:
                    # user set something equal to global — still allow explicit file
                    save_job_overrides(state.model_job_type, {
                        k: state.model_job_draft[k] for k in ROLE_KEYS if state.model_job_draft.get(k)
                    })
                state.message = f"Job models saved · {state.model_job_type}"
            else:
                save_models(state.models)
                state.message = "Global models saved"
            state.models_dirty = False
        state.model_menu = False
        return
    if ch in (9, curses.KEY_RIGHT):
        state.model_role_idx = (state.model_role_idx + 1) % 3
        rebuild_model_filtered(state)
        return
    if ch in (curses.KEY_LEFT,) or ch == curses.KEY_BTAB:
        state.model_role_idx = (state.model_role_idx - 1) % 3
        rebuild_model_filtered(state)
        return
    if ch in (curses.KEY_UP, ord("k")):
        state.model_list_idx = max(0, state.model_list_idx - 1)
        return
    if ch in (curses.KEY_DOWN, ord("j")):
        state.model_list_idx = min(max(0, len(state.model_filtered) - 1), state.model_list_idx + 1)
        return
    if ch == ord("/"):
        state.model_filter_mode = True
        return
    if ch == curses.KEY_F5:
        state.all_models = fetch_opencode_models(force=True)
        rebuild_model_filtered(state)
        state.message = f"Loaded {len(state.all_models)} models"
        return
    if ch in (10, 13):
        if state.model_filtered:
            name = state.model_filtered[state.model_list_idx]
            role = ROLE_KEYS[state.model_role_idx]
            if state.model_menu_scope == "job":
                state.model_job_draft[role] = name
            else:
                state.models[role] = name
            state.models_dirty = True
            state.message = f"Set {ROLE_LABELS[role]} = {name}"
        return
    if ch == ord("s"):
        if state.model_menu_scope == "job" and state.model_job_type:
            global_m = load_models()
            ov = {
                k: state.model_job_draft[k]
                for k in ROLE_KEYS
                if state.model_job_draft.get(k)
                and state.model_job_draft.get(k) != global_m.get(k)
            }
            # if user set values, always save what differs; if all equal clear
            if ov:
                save_job_overrides(state.model_job_type, ov)
            else:
                # keep explicit overrides if draft has any role different from empty overrides intent
                cur_ov = load_job_overrides(state.model_job_type)
                if cur_ov or any(
                    state.model_job_draft.get(k) != global_m.get(k) for k in ROLE_KEYS
                ):
                    save_job_overrides(
                        state.model_job_type,
                        {k: state.model_job_draft[k] for k in ROLE_KEYS if state.model_job_draft.get(k)},
                    )
            state.message = f"Job models saved · {state.model_job_type}"
        else:
            save_models(state.models)
            state.message = "Global models saved to models.json"
        state.models_dirty = False
        return
    if ch == ord("c") and state.model_menu_scope == "job" and state.model_job_type:
        clear_job_overrides(state.model_job_type)
        state.model_job_draft = resolve_models(state.model_job_type, apply_env=False)
        state.models_dirty = False
        state.message = f"Cleared job overrides · {state.model_job_type}"
        rebuild_model_filtered(state)
        return


def handle_log_mode(state: AppState, ch: int) -> None:
    view_estimate = 20
    if ch in (27, ord("q")):
        state.log_mode = False
        return
    if ch in (ord("G"), curses.KEY_END):
        state.log_follow = True
        state.log_scroll = max(0, len(state.log_lines) - 1)
        state.message = "Follow ON · at bottom"
        return
    if ch in (ord("g"), curses.KEY_HOME):
        state.log_follow = False
        state.log_scroll = 0
        state.message = "Follow OFF · at top"
        return
    if ch == ord(" "):
        state.log_follow = not state.log_follow
        if state.log_follow:
            state.log_scroll = max(0, len(state.log_lines) - 1)
        state.message = f"Follow {'ON' if state.log_follow else 'OFF'}"
        return
    # k = kill (not vim-up). Scroll with arrows only.
    if ch == curses.KEY_UP:
        state.log_follow = False
        state.log_scroll = max(0, state.log_scroll - 1)
        return
    if ch == curses.KEY_DOWN:
        state.log_scroll = min(max(0, len(state.log_lines) - 1), state.log_scroll + 1)
        if state.log_scroll >= max(0, len(state.log_lines) - view_estimate):
            state.log_follow = True
        return
    if ch == curses.KEY_PPAGE:
        state.log_follow = False
        state.log_scroll = max(0, state.log_scroll - 15)
        return
    if ch == curses.KEY_NPAGE:
        state.log_scroll = min(max(0, len(state.log_lines) - 1), state.log_scroll + 15)
        return
    if ch == ord("0"):
        state.log_stage_pin = "auto"
        open_live_log(state)
        state.message = "Stage pin: auto"
        return
    if ch == ord("1"):
        state.log_stage_pin = "spec"
        open_live_log(state)
        state.message = "Stage pin: SPEC"
        return
    if ch == ord("2"):
        state.log_stage_pin = "implement"
        open_live_log(state)
        state.message = "Stage pin: IMPLEMENT"
        return
    if ch == ord("3"):
        state.log_stage_pin = "validate"
        open_live_log(state)
        state.message = "Stage pin: VALIDATE"
        return
    if ch == ord("4"):
        state.log_stage_pin = "gate"
        open_live_log(state)
        state.message = "Stage pin: gate"
        return
    # per-node actions also work in log view
    if ch == ord("r"):
        do_retry_selected(state)
        return
    if ch == ord("k"):
        state.confirm = "kill"
        sel = selected_pipe(state)
        state.message = f"Kill {sel.type if sel else '?'}? y/n"
        return
    if ch == ord("n"):
        do_run_now(state)
        return


def show_failure_history(state: AppState) -> None:
    """Load failures.jsonl render into live-log view."""
    sel = selected_pipe(state)
    if not sel or not sel.path:
        state.message = "No selection"
        return
    try:
        r = subprocess.run(
            [
                "python3",
                str(FACTORY / "lib" / "failure_history.py"),
                "render",
                "--job-dir",
                str(sel.path),
                "--type",
                sel.type,
                "--last",
                "8",
            ],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=10,
        )
        text = (r.stdout or "").strip() or "(no prior failures recorded)"
    except Exception as e:
        text = f"(history error: {e})"
    state.log_mode = True
    state.log_follow = False
    state.log_path = sel.path / "failures.jsonl"
    state.log_lines = text.splitlines() or ["(empty)"]
    state.log_scroll = 0
    state.message = f"Failure history: {sel.type} (fails={sel.fail_count} attempt={sel.attempt}) — Esc back"


def do_retry_selected(state: AppState) -> None:
    sel = selected_pipe(state)
    if not sel:
        return
    try:
        node_ctl_bg(["reset", sel.type])
        state.message = f"Full retry queued: {sel.type} (bg)"
    except Exception as e:
        state.message = f"retry error: {e}"
    # light: don't full refresh now — auto-refresh will pick up


def do_retry_all_failed(state: AppState) -> None:
    try:
        node_ctl_bg(["retry-all-failed"])
        state.message = "Retry-all-failed started (bg)…"
    except Exception as e:
        state.message = f"error: {e}"


def do_kill_selected(state: AppState) -> None:
    sel = selected_pipe(state)
    if not sel:
        return
    try:
        node_ctl_bg(["kill", sel.type])
        state.message = f"Kill sent: {sel.type} (bg)…"
    except Exception as e:
        state.message = f"kill error: {e}"


def do_continue_selected(state: AppState, *, no_lock: bool = False) -> None:
    """Resume stuck/failed job from last stage only (no full SPEC re-trial)."""
    sel = selected_pipe(state)
    if not sel:
        return
    if sel.stage == "pass" or sel.verdict == "pass":
        state.message = "Already PASS — use n for full re-run if needed"
        return
    args = ["continue", sel.type]
    if no_lock:
        args.append("--no-lock")
        # Prefer implement when bypassing lock from wait
        if sel.stage in ("implement-wait", "implement", "interrupted"):
            args.extend(["--stage", "implement"])
    try:
        node_ctl_bg(args)
        lock_s = " bypass-lock" if no_lock else ""
        state.message = f"Continue{lock_s} sent: {sel.type} (bg)…"
    except Exception as e:
        state.message = f"continue error: {e}"


def do_bypass_lock(state: AppState) -> None:
    """Skip impl.lock for this job — continue IMPLEMENT immediately."""
    sel = selected_pipe(state)
    if not sel:
        return
    do_continue_selected(state, no_lock=True)


def do_steal_lock(state: AppState) -> None:
    sel = selected_pipe(state)
    if not sel:
        return
    try:
        node_ctl_bg(["steal-lock", sel.type])
        state.message = f"Steal-lock + continue: {sel.type} (bg)…"
    except Exception as e:
        state.message = f"steal error: {e}"


def do_run_now(state: AppState, *, no_lock: bool = False) -> None:
    sel = selected_pipe(state)
    if not sel:
        return
    args = ["run", sel.type]
    if no_lock:
        args.append("--no-lock")
    try:
        node_ctl_bg(args)
        lock_s = " no-lock" if no_lock else ""
        state.message = f"Run now{lock_s}: {sel.type} (bg) — UI stays live"
    except Exception as e:
        state.message = f"run error: {e}"


def do_skip_selected(state: AppState) -> None:
    sel = selected_pipe(state)
    if not sel:
        return
    try:
        node_ctl_bg(["skip", sel.type])
        state.message = f"Skip sent: {sel.type}"
    except Exception as e:
        state.message = f"skip error: {e}"


def do_unskip_selected(state: AppState) -> None:
    sel = selected_pipe(state)
    if not sel:
        return
    try:
        node_ctl_bg(["unskip", sel.type])
        state.message = f"Unskip sent: {sel.type}"
    except Exception as e:
        state.message = f"unskip error: {e}"


def main_curses(stdscr: Any) -> None:
    curses.curs_set(0)
    curses.start_color()
    curses.use_default_colors()
    curses.init_pair(1, curses.COLOR_RED, -1)
    curses.init_pair(2, curses.COLOR_GREEN, -1)
    curses.init_pair(3, curses.COLOR_YELLOW, -1)
    curses.init_pair(4, curses.COLOR_CYAN, -1)
    curses.init_pair(5, curses.COLOR_MAGENTA, -1)
    stdscr.nodelay(True)
    stdscr.timeout(200)
    stdscr.keypad(True)

    state = AppState()
    state.models = load_models()
    state.settings = load_settings()
    state.all_models = fetch_opencode_models(force=False)
    refresh_app(state, reload_models=False)
    state.message = (
        f"Queue={len(state.pipes)} · m=global M=job-models b=batch "
        f"conc={state.settings.get('concurrency')} · Enter=LIVE · h=help"
    )

    while True:
        now = time.time()
        interval = 0.4 if state.log_mode else 1.2
        if (
            state.auto_refresh
            and now - state.last_refresh > interval
            and not state.search_mode
            and not state.model_menu
            and not state.settings_menu
            and not state.model_filter_mode
            and not state.confirm
        ):
            try:
                if state.log_mode:
                    # light refresh: pipes meta + live log only
                    state.pipes = discover_pipes()
                    apply_filter(state)
                    refresh_live_log(state)
                    state.last_refresh = now
                else:
                    refresh_app(state, reload_models=False)
            except Exception as e:
                state.message = f"refresh error: {e}"

        draw(stdscr, state)

        try:
            ch = stdscr.getch()
        except KeyboardInterrupt:
            break
        if ch == -1:
            continue

        # confirm gate
        if state.confirm:
            if ch in (ord("y"), ord("Y")):
                action = state.confirm
                state.confirm = ""
                if action == "kill":
                    do_kill_selected(state)
                elif action == "continue":
                    do_continue_selected(state, no_lock=False)
                elif action == "bypass-lock":
                    do_bypass_lock(state)
                elif action == "steal-lock":
                    do_steal_lock(state)
                elif action == "retry-all":
                    do_retry_all_failed(state)
                elif action == "stop":
                    stop_factory(state)
            elif ch in (ord("n"), ord("N"), 27):
                state.confirm = ""
                state.message = "Cancelled"
            continue

        if state.search_mode:
            if ch in (27,):
                state.search_mode = False
            elif ch in (10, 13):
                state.search_mode = False
                apply_filter(state)
            elif ch in (curses.KEY_BACKSPACE, 127, 8):
                state.search = state.search[:-1]
                apply_filter(state)
            elif 32 <= ch < 127:
                state.search += chr(ch)
                apply_filter(state)
            continue

        if state.settings_menu:
            handle_settings_menu(state, ch)
            continue

        if state.model_menu:
            handle_model_menu(state, ch)
            continue

        if state.log_mode:
            handle_log_mode(state, ch)
            continue

        if state.show_help:
            if ch in (27, ord("q"), ord("h"), ord("?")):
                state.show_help = False
            continue

        if ch in (ord("q"), 27):
            if state.models_dirty:
                save_models(state.models)
            if state.settings_dirty:
                save_settings(state.settings)
            alive, pid = factory_alive()
            if alive:
                state.message = f"Quit TUI — factory still running pid={pid}"
            break
        elif ch == curses.KEY_UP:
            state.selected = max(0, state.selected - 1)
        elif ch == curses.KEY_DOWN:
            state.selected = min(max(0, len(state.filtered) - 1), state.selected + 1)
        elif ch in (10, 13, ord("l")):
            open_live_log(state)
        elif ch in (ord("G"), curses.KEY_END):
            open_live_log(state)
        elif ch == ord("S"):
            start_factory(state, resume=False, dry=False)
        elif ch == ord("C"):
            start_factory(state, resume=True, dry=False)
        elif ch == ord("d"):
            start_factory(state, resume=False, dry=True)
        elif ch == ord("X"):
            state.confirm = "stop"
            state.message = "FACTORY STOP all workers? y/n"
        elif ch == ord("m"):
            open_model_menu(state, scope="global")
        elif ch == ord("M"):
            open_model_menu(state, scope="job")
        elif ch == ord("b"):
            open_settings_menu(state)
        elif ch == ord("y"):
            sel = selected_pipe(state)
            if sel and sel.stage in RUNNING_STAGES:
                state.confirm = "continue"
                state.message = (
                    f"Continue {sel.type} from last stage (no full re-trial)? y/n"
                )
            else:
                do_continue_selected(state, no_lock=False)
        elif ch == ord("L"):
            # Bypass impl.lock for this job only
            sel = selected_pipe(state)
            if not sel:
                state.message = "No selection"
            else:
                state.confirm = "bypass-lock"
                state.message = (
                    f"Bypass impl.lock & continue IMPLEMENT for {sel.type}? y/n"
                )
        elif ch == curses.KEY_SLEFT or ch == ord("!"):  # Shift+L may be ! on some terms
            # Steal lock — aggressive
            sel = selected_pipe(state)
            holder = lock_holder()
            state.confirm = "steal-lock"
            state.message = (
                f"STEAL lock (kill holder={holder or '?'}) then continue "
                f"{sel.type if sel else '?'}? y/n"
            )
        elif ch == ord("r"):
            do_retry_selected(state)
        elif ch == ord("R"):
            state.confirm = "retry-all"
            state.message = "Retry ALL failed/partial/interrupted? y/n"
        elif ch == ord("H"):
            show_failure_history(state)
        elif ch == ord("k"):
            state.confirm = "kill"
            sel = selected_pipe(state)
            state.message = f"Kill {sel.type if sel else '?'}? y/n"
        elif ch == ord("n"):
            do_run_now(state, no_lock=False)
        elif ch == ord("x"):
            do_skip_selected(state)
        elif ch == ord("u"):
            do_unskip_selected(state)
        elif ch == ord("p"):
            state.filter_mode = "pending"
            apply_filter(state)
            state.selected = 0
            state.message = "Filter: pending"
        elif ch == ord("e"):
            state.filter_mode = "running"
            apply_filter(state)
            state.selected = 0
            state.message = "Filter: running"
        elif ch == ord("f"):
            state.filter_mode = "failed"
            apply_filter(state)
            state.selected = 0
            state.message = "Filter: failed"
        elif ch == ord("a"):
            state.filter_mode = "all"
            apply_filter(state)
            state.selected = 0
            state.message = "Filter: all"
        elif ch == ord("s"):
            # s = skipped filter (models uses m)
            state.filter_mode = "skipped"
            apply_filter(state)
            state.selected = 0
            state.message = "Filter: skipped"
        elif ch == ord("/"):
            state.search_mode = True
            state.message = "Search pipes…"
        elif ch == ord("F5") if False else -999:
            pass
        elif ch == curses.KEY_F5 or ch == ord("Z"):
            refresh_app(state, reload_models=not state.models_dirty)
            state.message = "Refreshed"
        elif ch in (ord("h"), ord("?")):
            state.show_help = True


def main() -> None:
    os.chdir(ROOT)
    try:
        curses.wrapper(main_curses)
    except KeyboardInterrupt:
        pass
    alive, pid = factory_alive()
    if alive:
        print(f"Factory still running (pid={pid}). Stop with: npm run factory:stop")


if __name__ == "__main__":
    main()
