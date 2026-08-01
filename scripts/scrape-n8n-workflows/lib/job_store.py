"""Queue, scans, settings, and per-job status for the scrape TUI/worker."""

from __future__ import annotations

import json
import os
import random
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .client import atomic_write_json, utc_now_iso

PACKAGE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_JOBS = PACKAGE_DIR / ".jobs"
DEFAULT_OUT = PACKAGE_DIR.parents[1] / ".scraped" / "n8n-workflows"

_lock = threading.RLock()

DEFAULT_SETTINGS: dict[str, Any] = {
    "concurrency": 2,
    "minDelay": 1.2,
    "maxDelay": 5.5,
    "pauseProb": 0.08,
    "html": True,
    "useProxy": False,
    "proxyUrl": "https://databay.com/free-proxy-list/socks5.txt",
    "proxyProbeTimeout": 8.0,
    "proxyFallbackDirect": True,
    "maxAttempts": 4,
    "outDir": str(DEFAULT_OUT),
    "shuffleQueue": True,
    "skipExisting": True,
    # Parallel catalog scan (fixed page size — required for correct offsets)
    "scanParallel": True,
    "scanWorkers": 10,
    "scanRows": 100,
    "scanUseProxy": True,
    "scanMinDelay": 0.15,
    "scanMaxDelay": 0.55,
}


def jobs_root(path: Path | None = None) -> Path:
    root = path or DEFAULT_JOBS
    root.mkdir(parents=True, exist_ok=True)
    (root / "scans").mkdir(exist_ok=True)
    (root / "status").mkdir(exist_ok=True)
    (root / "proxies").mkdir(exist_ok=True)
    return root


def settings_path(root: Path | None = None) -> Path:
    return jobs_root(root) / "settings.json"


def load_settings(root: Path | None = None) -> dict[str, Any]:
    p = settings_path(root)
    data = dict(DEFAULT_SETTINGS)
    if p.exists():
        try:
            loaded = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data.update(loaded)
        except json.JSONDecodeError:
            pass
    return data


def save_settings(settings: dict[str, Any], root: Path | None = None) -> None:
    merged = dict(DEFAULT_SETTINGS)
    merged.update(settings)
    atomic_write_json(settings_path(root), merged)


def out_dir_from_settings(settings: dict[str, Any] | None = None) -> Path:
    s = settings or load_settings()
    p = Path(s.get("outDir") or DEFAULT_OUT)
    if not p.is_absolute():
        p = (PACKAGE_DIR / p).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


# ---------------------------------------------------------------------------
# Run state / worker pid
# ---------------------------------------------------------------------------


def run_state_path(root: Path | None = None) -> Path:
    return jobs_root(root) / "run-state.json"


def load_run_state(root: Path | None = None) -> dict[str, Any]:
    p = run_state_path(root)
    if not p.exists():
        return {"status": "idle", "pid": None, "startedAt": None, "agents": 0}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"status": "idle", "pid": None}


def save_run_state(state: dict[str, Any], root: Path | None = None) -> None:
    atomic_write_json(run_state_path(root), state)


def pidfile_path(root: Path | None = None) -> Path:
    return jobs_root(root) / "worker.pid"


def worker_log_path(root: Path | None = None) -> Path:
    return jobs_root(root) / "worker.log"


def is_worker_alive(root: Path | None = None) -> bool:
    st = load_run_state(root)
    pid = st.get("pid")
    if not pid:
        pf = pidfile_path(root)
        if pf.exists():
            try:
                pid = int(pf.read_text().strip())
            except ValueError:
                pid = None
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ProcessLookupError, ValueError):
        return False


# ---------------------------------------------------------------------------
# Scans (address lists)
# ---------------------------------------------------------------------------


def new_scan_id() -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"scan-{ts}-{uuid.uuid4().hex[:6]}"


def scan_paths(scan_id: str, root: Path | None = None) -> tuple[Path, Path]:
    r = jobs_root(root)
    return r / "scans" / f"{scan_id}.jsonl", r / "scans" / f"{scan_id}.meta.json"


def list_scans(root: Path | None = None) -> list[dict[str, Any]]:
    r = jobs_root(root) / "scans"
    metas = []
    for p in sorted(r.glob("*.meta.json"), reverse=True):
        try:
            metas.append(json.loads(p.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return metas


def save_scan_meta(meta: dict[str, Any], root: Path | None = None) -> None:
    _, mp = scan_paths(meta["scanId"], root)
    atomic_write_json(mp, meta)


def append_scan_addresses(
    scan_id: str, addresses: list[dict[str, Any]], root: Path | None = None
) -> int:
    jp, _ = scan_paths(scan_id, root)
    jp.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with jp.open("a", encoding="utf-8") as f:
        for a in addresses:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")
            n += 1
    return n


def load_scan_addresses(
    scan_id: str,
    root: Path | None = None,
    *,
    limit: int = 0,
    offset: int = 0,
    query: str = "",
) -> list[dict[str, Any]]:
    jp, _ = scan_paths(scan_id, root)
    if not jp.exists():
        return []
    q = query.strip().lower()
    out: list[dict[str, Any]] = []
    skipped = 0
    with jp.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if q:
                blob = f"{row.get('id')} {row.get('name')} {row.get('url')}".lower()
                if q not in blob:
                    continue
            if skipped < offset:
                skipped += 1
                continue
            out.append(row)
            if limit and len(out) >= limit:
                break
    return out


def count_scan_addresses(scan_id: str, root: Path | None = None) -> int:
    jp, _ = scan_paths(scan_id, root)
    if not jp.exists():
        return 0
    n = 0
    with jp.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                n += 1
    return n


def load_all_scan_ids_map(
    scan_id: str, root: Path | None = None
) -> dict[int, dict[str, Any]]:
    """Full scan into dict (for enqueue-all). Use carefully on huge scans."""
    jp, _ = scan_paths(scan_id, root)
    out: dict[int, dict[str, Any]] = {}
    if not jp.exists():
        return out
    with jp.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                out[int(row["id"])] = row
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
    return out


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------


def queue_path(root: Path | None = None) -> Path:
    return jobs_root(root) / "queue.jsonl"


def _read_queue_raw(root: Path | None = None) -> list[dict[str, Any]]:
    p = queue_path(root)
    if not p.exists():
        return []
    rows = []
    with p.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def _write_queue_raw(rows: list[dict[str, Any]], root: Path | None = None) -> None:
    p = queue_path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    tmp.replace(p)


def list_queue(
    root: Path | None = None, *, status: str | None = None
) -> list[dict[str, Any]]:
    rows = _read_queue_raw(root)
    if status:
        rows = [r for r in rows if r.get("status") == status]
    return rows


def queue_counts(root: Path | None = None) -> dict[str, int]:
    counts: dict[str, int] = {
        "pending": 0,
        "running": 0,
        "done": 0,
        "failed": 0,
        "skipped": 0,
    }
    for r in _read_queue_raw(root):
        s = str(r.get("status") or "pending")
        counts[s] = counts.get(s, 0) + 1
    counts["total"] = sum(counts.values())
    return counts


def enqueue(
    addresses: list[dict[str, Any]],
    root: Path | None = None,
    *,
    priority: int = 0,
) -> int:
    """Add addresses to queue as pending. Skips ids already pending/running."""
    with _lock:
        rows = _read_queue_raw(root)
        active = {
            int(r["id"])
            for r in rows
            if r.get("status") in ("pending", "running") and "id" in r
        }
        added = 0
        now = utc_now_iso()
        for a in addresses:
            try:
                wid = int(a["id"])
            except (KeyError, TypeError, ValueError):
                continue
            if wid in active:
                continue
            rows.append(
                {
                    "id": wid,
                    "name": a.get("name"),
                    "url": a.get("url") or a.get("public_url"),
                    "slug": a.get("slug"),
                    "status": "pending",
                    "attempts": 0,
                    "priority": priority,
                    "enqueuedAt": now,
                    "updatedAt": now,
                    "stage": "queued",
                    "proxy": None,
                    "error": None,
                    "source": a.get("source"),
                }
            )
            active.add(wid)
            added += 1
        _write_queue_raw(rows, root)
        return added


def claim_next(
    root: Path | None = None, *, shuffle: bool = True
) -> dict[str, Any] | None:
    """Atomically claim one pending job → running."""
    with _lock:
        rows = _read_queue_raw(root)
        pending_idx = [i for i, r in enumerate(rows) if r.get("status") == "pending"]
        if not pending_idx:
            return None
        if shuffle:
            i = random.choice(pending_idx)
        else:
            # highest priority first, then oldest
            pending_idx.sort(
                key=lambda ix: (
                    -int(rows[ix].get("priority") or 0),
                    rows[ix].get("enqueuedAt") or "",
                )
            )
            i = pending_idx[0]
        now = utc_now_iso()
        rows[i]["status"] = "running"
        rows[i]["stage"] = "claimed"
        rows[i]["attempts"] = int(rows[i].get("attempts") or 0) + 1
        rows[i]["updatedAt"] = now
        rows[i]["claimedAt"] = now
        job = dict(rows[i])
        _write_queue_raw(rows, root)
        return job


def update_job(
    workflow_id: int,
    *,
    status: str | None = None,
    stage: str | None = None,
    proxy: str | None = None,
    error: str | None = None,
    extra: dict[str, Any] | None = None,
    root: Path | None = None,
) -> None:
    with _lock:
        rows = _read_queue_raw(root)
        for r in rows:
            if int(r.get("id") or -1) != int(workflow_id):
                continue
            if status is not None:
                r["status"] = status
            if stage is not None:
                r["stage"] = stage
            if proxy is not None:
                r["proxy"] = proxy
            if error is not None:
                r["error"] = error
            if extra:
                r.update(extra)
            r["updatedAt"] = utc_now_iso()
            break
        _write_queue_raw(rows, root)


def drop_jobs(
    ids: list[int], root: Path | None = None, *, only_pending: bool = False
) -> int:
    with _lock:
        idset = set(ids)
        rows = _read_queue_raw(root)
        kept = []
        dropped = 0
        for r in rows:
            try:
                wid = int(r["id"])
            except (KeyError, TypeError, ValueError):
                kept.append(r)
                continue
            if wid in idset and (not only_pending or r.get("status") == "pending"):
                dropped += 1
                continue
            kept.append(r)
        _write_queue_raw(kept, root)
        return dropped


def requeue_failed(ids: list[int] | None = None, root: Path | None = None) -> int:
    with _lock:
        rows = _read_queue_raw(root)
        idset = set(ids) if ids is not None else None
        n = 0
        for r in rows:
            if r.get("status") != "failed":
                continue
            try:
                wid = int(r["id"])
            except (KeyError, TypeError, ValueError):
                continue
            if idset is not None and wid not in idset:
                continue
            r["status"] = "pending"
            r["stage"] = "queued"
            r["error"] = None
            r["updatedAt"] = utc_now_iso()
            n += 1
        _write_queue_raw(rows, root)
        return n


def reset_stale_running(root: Path | None = None) -> int:
    """If worker died, move running → pending."""
    with _lock:
        rows = _read_queue_raw(root)
        n = 0
        for r in rows:
            if r.get("status") == "running":
                r["status"] = "pending"
                r["stage"] = "queued"
                r["updatedAt"] = utc_now_iso()
                n += 1
        if n:
            _write_queue_raw(rows, root)
        return n


# ---------------------------------------------------------------------------
# Per-job status files
# ---------------------------------------------------------------------------


def status_path(workflow_id: int, root: Path | None = None) -> Path:
    return jobs_root(root) / "status" / f"{workflow_id}.json"


def write_job_status(workflow_id: int, data: dict[str, Any], root: Path | None = None) -> None:
    payload = dict(data)
    payload["id"] = workflow_id
    payload["updatedAt"] = utc_now_iso()
    atomic_write_json(status_path(workflow_id, root), payload)


def read_job_status(workflow_id: int, root: Path | None = None) -> dict[str, Any] | None:
    p = status_path(workflow_id, root)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
