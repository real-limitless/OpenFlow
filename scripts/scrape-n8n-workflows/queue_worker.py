#!/usr/bin/env python3
"""
Background queue worker: drain pending scrape jobs with N concurrent agents.

  python queue_worker.py
  python queue_worker.py --once   # process until empty then exit

Respects settings.json (concurrency, delays, html, proxies).
"""

from __future__ import annotations

import argparse
import os
import signal
import sys
import threading
import time
import traceback
from pathlib import Path

# package root on path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.client import (  # noqa: E402
    StealthConfig,
    StealthSession,
    append_catalog,
    fetch_one,
    is_complete,
)
from lib.job_store import (  # noqa: E402
    claim_next,
    is_worker_alive,
    jobs_root,
    load_settings,
    out_dir_from_settings,
    pidfile_path,
    queue_counts,
    reset_stale_running,
    save_run_state,
    update_job,
    worker_log_path,
    write_job_status,
)
from lib.proxy_pool import ProxyPool  # noqa: E402

_stop = threading.Event()


def log(msg: str, root: Path | None = None) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        lp = worker_log_path(root)
        with lp.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def handle_signal(signum: int, _frame: object) -> None:
    log(f"signal {signum} — stopping after current jobs…")
    _stop.set()
    save_run_state({"status": "stopping", "pid": os.getpid()})


def agent_loop(agent_id: int, root: Path, pool: ProxyPool | None) -> None:
    settings = load_settings(root)
    out_dir = out_dir_from_settings(settings)
    catalog = out_dir / "catalog.jsonl"
    max_attempts = int(settings.get("maxAttempts") or 4)
    use_proxy = bool(settings.get("useProxy"))
    fallback_direct = bool(settings.get("proxyFallbackDirect", True))
    want_html = bool(settings.get("html", True))
    skip_existing = bool(settings.get("skipExisting", True))
    shuffle = bool(settings.get("shuffleQueue", True))

    while not _stop.is_set():
        settings = load_settings(root)
        use_proxy = bool(settings.get("useProxy"))
        want_html = bool(settings.get("html", True))
        out_dir = out_dir_from_settings(settings)
        catalog = out_dir / "catalog.jsonl"

        job = claim_next(root, shuffle=shuffle)
        if not job:
            return  # idle — outer loop restarts agents or exits

        wid = int(job["id"])
        attempts = int(job.get("attempts") or 1)
        proxy_url: str | None = None
        if use_proxy and pool is not None:
            proxy_url = pool.acquire()
        # After enough job attempts with proxies, force direct (free SOCKS5 often dead)
        force_direct = bool(
            fallback_direct and use_proxy and attempts >= max(2, max_attempts - 1)
        )
        if force_direct:
            proxy_url = None

        # Dead proxies: short connect timeout + fewer retries + mid-request rotate
        cfg = StealthConfig(
            min_delay=float(settings.get("minDelay") or 1.2),
            max_delay=float(settings.get("maxDelay") or 5.5),
            pause_prob=float(settings.get("pauseProb") or 0.08),
            proxy=proxy_url,
            max_retries=4 if proxy_url else 5,
            timeout=25.0 if proxy_url else 45.0,
            connect_timeout=8.0 if proxy_url else 15.0,
            proxy_fail_rotate_after=1,
        )

        current_proxy: list[str | None] = [proxy_url]

        def stage_cb(stage: str, _wid: int = wid) -> None:
            update_job(_wid, stage=stage, proxy=current_proxy[0], root=root)
            write_job_status(
                _wid,
                {
                    "stage": stage,
                    "status": "running",
                    "proxy": current_proxy[0],
                    "agent": agent_id,
                },
                root=root,
            )

        def rotate() -> str | None:
            if force_direct or pool is None:
                current_proxy[0] = None
                return None
            nxt = pool.acquire()
            # occasionally fall back to direct even mid-job
            if nxt is None and fallback_direct:
                current_proxy[0] = None
                return None
            current_proxy[0] = nxt
            return nxt

        def mark_bad(p: str) -> None:
            if pool is not None:
                pool.report_bad(p)

        log(
            f"agent-{agent_id} claim {wid} attempt={attempts} "
            f"proxy={proxy_url or 'direct'}"
            f"{' (force-direct)' if force_direct else ''}",
            root,
        )
        update_job(wid, stage="starting", proxy=proxy_url, root=root)

        try:
            if skip_existing and is_complete(out_dir, wid, want_html):
                update_job(
                    wid,
                    status="skipped",
                    stage="exists",
                    error=None,
                    root=root,
                )
                write_job_status(
                    wid,
                    {"status": "skipped", "stage": "exists", "agent": agent_id},
                    root=root,
                )
                log(f"agent-{agent_id} skip {wid} (exists)", root)
                continue

            with StealthSession(
                cfg,
                quiet=True,
                log=lambda m: log(f"agent-{agent_id} {m}", root),
                proxy_rotator=rotate if (use_proxy and pool and not force_direct) else (
                    (lambda: None) if (use_proxy and fallback_direct) else None
                ),
                on_proxy_bad=mark_bad if pool else None,
            ) as session:
                # Never warm-up through a random free SOCKS5 — wastes minutes
                if attempts == 1 and not current_proxy[0]:
                    try:
                        session.warm()
                    except Exception:
                        pass
                row = fetch_one(
                    session,
                    workflow_id=wid,
                    card={
                        "id": wid,
                        "name": job.get("name"),
                        "slug": job.get("slug"),
                        "url": job.get("url"),
                    },
                    out_dir=out_dir,
                    want_html=want_html,
                    stage_cb=stage_cb,
                )
                final_proxy = session.proxy
            append_catalog(catalog, row)
            if final_proxy and pool is not None:
                pool.report_ok(final_proxy)
            update_job(
                wid,
                status="done",
                stage="done",
                proxy=final_proxy,
                error=None,
                extra={"name": row.get("name"), "result": row.get("paths")},
                root=root,
            )
            write_job_status(
                wid,
                {
                    "status": "done",
                    "stage": "done",
                    "proxy": final_proxy,
                    "name": row.get("name"),
                    "paths": row.get("paths"),
                    "agent": agent_id,
                },
                root=root,
            )
            log(f"agent-{agent_id} done {wid} {row.get('name')}", root)
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            bad_p = current_proxy[0]
            if bad_p and pool is not None:
                pool.report_bad(bad_p)
            # retry as pending if under max attempts
            if attempts < max_attempts:
                update_job(
                    wid,
                    status="pending",
                    stage="retry",
                    proxy=bad_p,
                    error=err,
                    root=root,
                )
                write_job_status(
                    wid,
                    {
                        "status": "pending",
                        "stage": "retry",
                        "error": err,
                        "attempts": attempts,
                        "proxy": bad_p,
                        "agent": agent_id,
                    },
                    root=root,
                )
                log(f"agent-{agent_id} retry {wid}: {err}", root)
                time.sleep(min(5, 1.5**attempts))
            else:
                update_job(
                    wid,
                    status="failed",
                    stage="failed",
                    proxy=bad_p,
                    error=err,
                    root=root,
                )
                write_job_status(
                    wid,
                    {
                        "status": "failed",
                        "stage": "failed",
                        "error": err,
                        "attempts": attempts,
                        "proxy": bad_p,
                        "agent": agent_id,
                        "trace": traceback.format_exc()[-2000:],
                    },
                    root=root,
                )
                log(f"agent-{agent_id} FAIL {wid}: {err}", root)


def run_worker(*, once: bool = False, root: Path | None = None) -> int:
    root = jobs_root(root)
    if is_worker_alive(root) and not once:
        # another worker running
        st = Path(pidfile_path(root))
        log(f"worker already alive (pidfile {st})", root)
        return 1

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    pid = os.getpid()
    pidfile_path(root).write_text(str(pid), encoding="utf-8")
    n_reset = reset_stale_running(root)
    if n_reset:
        log(f"reset {n_reset} stale running → pending", root)

    settings = load_settings(root)
    pool: ProxyPool | None = None
    if settings.get("useProxy"):
        pool = ProxyPool(root)
        if pool.count_listed() == 0:
            try:
                n = pool.refresh()
                log(f"refreshed proxy list: {n}", root)
            except Exception as e:
                log(f"proxy refresh failed: {e}", root)
        if pool.summary().get("alive", 0) == 0 and pool.count_listed() > 0:
            log("probing proxies (sample)…", root)
            try:
                res = pool.health_check(limit=20)
                log(f"proxy probe: {res}", root)
            except Exception as e:
                log(f"proxy probe failed: {e}", root)

    save_run_state(
        {
            "status": "running",
            "pid": pid,
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "agents": int(settings.get("concurrency") or 2),
            "once": once,
        },
        root,
    )
    log(
        f"worker start pid={pid} concurrency={settings.get('concurrency')} "
        f"proxy={settings.get('useProxy')} out={out_dir_from_settings(settings)}",
        root,
    )

    try:
        while not _stop.is_set():
            settings = load_settings(root)
            conc = max(1, min(8, int(settings.get("concurrency") or 2)))
            counts = queue_counts(root)
            if counts.get("pending", 0) == 0 and counts.get("running", 0) == 0:
                log("queue empty", root)
                if once:
                    break
                # idle wait for more work
                for _ in range(20):
                    if _stop.is_set():
                        break
                    time.sleep(0.5)
                    if queue_counts(root).get("pending", 0) > 0:
                        break
                else:
                    if once:
                        break
                continue

            # spawn up to conc agents that each claim until empty
            threads: list[threading.Thread] = []
            for i in range(conc):
                if _stop.is_set():
                    break
                t = threading.Thread(
                    target=agent_loop,
                    args=(i + 1, root, pool),
                    name=f"scrape-agent-{i+1}",
                    daemon=True,
                )
                t.start()
                threads.append(t)
            for t in threads:
                t.join()
            if once and queue_counts(root).get("pending", 0) == 0:
                break
            time.sleep(0.3)
    finally:
        save_run_state(
            {"status": "idle", "pid": None, "stoppedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
            root,
        )
        try:
            pidfile_path(root).unlink(missing_ok=True)
        except OSError:
            pass
        log("worker exit", root)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="n8n workflow scrape queue worker")
    p.add_argument("--once", action="store_true", help="Drain queue then exit")
    p.add_argument(
        "--jobs",
        type=Path,
        default=None,
        help="Jobs directory (default: scripts/scrape-n8n-workflows/.jobs)",
    )
    args = p.parse_args(argv)
    return run_worker(once=args.once, root=args.jobs)


if __name__ == "__main__":
    raise SystemExit(main())
