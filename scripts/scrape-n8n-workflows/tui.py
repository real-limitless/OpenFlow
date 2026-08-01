#!/usr/bin/env python3
"""
n8n.io workflow scrape TUI — factory-style queue.

  Surf (scan categories / products / search) → cherry-pick addresses →
  enqueue → launch scrape agents (optional SOCKS5).

  python tui.py
"""

from __future__ import annotations

import curses
import json
import os
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.address_list import address_from_card, address_from_id  # noqa: E402
from lib.client import (  # noqa: E402
    StealthConfig,
    StealthSession,
    enumerate_search,
    enumerate_search_parallel,
    fetch_facets,
    parse_workflow_id,
)
from lib.proxy_pool import ProxyPool  # noqa: E402
from lib.job_store import (  # noqa: E402
    append_scan_addresses,
    count_scan_addresses,
    drop_jobs,
    enqueue,
    is_worker_alive,
    jobs_root,
    list_queue,
    list_scans,
    load_scan_addresses,
    load_settings,
    load_all_scan_ids_map,
    new_scan_id,
    out_dir_from_settings,
    queue_counts,
    requeue_failed,
    save_scan_meta,
    save_settings,
    worker_log_path,
)
MODES = ("scan", "list", "queue", "proxies", "settings", "log", "help")


@dataclass
class App:
    mode: str = "scan"
    message: str = ""
    # scan
    facet_kind: str = "apps"  # all | category | apps | nodes | search | id
    facets: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    facet_items: list[dict[str, Any]] = field(default_factory=list)
    facet_sel: int = 0
    facet_scroll: int = 0
    facet_filter: str = ""
    search_input: str = ""
    input_mode: str | None = None  # "search" | "id" | "filter" | "settings_edit"
    input_buf: str = ""
    input_target: str = ""
    scan_running: bool = False
    scan_progress: str = ""
    active_scan_id: str | None = None
    # list
    list_rows: list[dict[str, Any]] = field(default_factory=list)
    list_sel: int = 0
    list_scroll: int = 0
    list_selected: set[int] = field(default_factory=set)  # workflow ids
    list_query: str = ""
    # queue
    queue_rows: list[dict[str, Any]] = field(default_factory=list)
    queue_sel: int = 0
    queue_scroll: int = 0
    queue_filter: str = "all"  # all|pending|running|done|failed
    # proxies
    proxy_summary: dict[str, Any] = field(default_factory=dict)
    proxy_busy: bool = False
    # settings
    settings: dict[str, Any] = field(default_factory=dict)
    settings_keys: list[str] = field(default_factory=list)
    settings_sel: int = 0
    # log
    log_lines: list[str] = field(default_factory=list)
    log_scroll: int = 0
    # background
    bg_msg: str = ""
    stop_scan: threading.Event = field(default_factory=threading.Event)


def clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def safe_addstr(win: Any, y: int, x: int, text: str, attr: int = 0) -> None:
    try:
        h, w = win.getmaxyx()
        if y < 0 or y >= h or x >= w:
            return
        text = text[: max(0, w - x - 1)]
        win.addstr(y, x, text, attr)
    except curses.error:
        pass


def load_facets_bg(app: App) -> None:
    def run() -> None:
        try:
            cfg = StealthConfig(min_delay=0.3, max_delay=0.8, pause_prob=0)
            with StealthSession(cfg, quiet=True) as s:
                app.facets = fetch_facets(s)
            app.message = (
                f"Facets: {len(app.facets.get('categories', []))} cats, "
                f"{len(app.facets.get('apps', []))} apps, "
                f"{len(app.facets.get('nodes', []))} nodes"
            )
            rebuild_facet_items(app)
        except Exception as e:
            app.message = f"Facet load failed: {e}"

    threading.Thread(target=run, daemon=True).start()


def rebuild_facet_items(app: App) -> None:
    kind = app.facet_kind
    q = app.facet_filter.lower()
    if kind == "all":
        app.facet_items = [{"value": "(entire library)", "count": None}]
    elif kind == "search":
        app.facet_items = [{"value": app.search_input or "(type / to enter search)", "count": None}]
    elif kind == "id":
        app.facet_items = [{"value": app.search_input or "(type / to paste id or URL)", "count": None}]
    else:
        key = "categories" if kind == "category" else kind
        items = list(app.facets.get(key) or [])
        if q:
            items = [i for i in items if q in str(i.get("value") or "").lower()]
        # sort by count desc
        items.sort(key=lambda i: int(i.get("count") or 0), reverse=True)
        app.facet_items = items
    app.facet_sel = clamp(app.facet_sel, 0, max(0, len(app.facet_items) - 1))


def start_scan(app: App) -> None:
    if app.scan_running:
        app.message = "Scan already running"
        return
    kind = app.facet_kind
    value: str | None = None
    category = apps = nodes = search = None
    limit = 0

    if kind == "all":
        pass
    elif kind == "category":
        if not app.facet_items:
            app.message = "No categories loaded — wait or press R"
            return
        value = str(app.facet_items[app.facet_sel].get("value") or "")
        category = value
    elif kind == "apps":
        if not app.facet_items:
            app.message = "No apps loaded — wait or press R"
            return
        value = str(app.facet_items[app.facet_sel].get("value") or "")
        apps = value
    elif kind == "nodes":
        if not app.facet_items:
            app.message = "No nodes loaded"
            return
        value = str(app.facet_items[app.facet_sel].get("value") or "")
        nodes = value
    elif kind == "search":
        if not app.search_input.strip():
            app.message = "Enter search with / first"
            return
        search = app.search_input.strip()
        value = search
    elif kind == "id":
        wid = parse_workflow_id(app.search_input)
        if wid is None:
            app.message = "Enter a workflow id or URL with /"
            return
        scan_id = new_scan_id()
        addr = address_from_id(
            wid, scan_id=scan_id, source_kind="id", source_value=app.search_input
        )
        append_scan_addresses(scan_id, [addr])
        save_scan_meta(
            {
                "scanId": scan_id,
                "kind": "id",
                "value": app.search_input,
                "totalReported": 1,
                "count": 1,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "done",
            }
        )
        app.active_scan_id = scan_id
        reload_list(app)
        app.mode = "list"
        app.message = f"Scanned single id {wid}"
        return
    else:
        app.message = f"Unknown scan kind {kind}"
        return

    app.stop_scan.clear()
    app.scan_running = True
    app.scan_progress = "starting…"
    app.message = f"Scanning {kind}={value or 'all'}…"

    def run() -> None:
        scan_id = new_scan_id()
        app.active_scan_id = scan_id
        save_scan_meta(
            {
                "scanId": scan_id,
                "kind": kind,
                "value": value,
                "totalReported": None,
                "count": 0,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "running",
            }
        )
        try:
            settings = load_settings()
            scan_rows = int(settings.get("scanRows") or 100)
            scan_workers = int(settings.get("scanWorkers") or 10)
            scan_parallel = bool(settings.get("scanParallel", True))
            # Parallel page fan-out can use SOCKS5 even when detail-scrape useProxy is off
            scan_use_proxy = bool(settings.get("scanUseProxy", True))

            proxy_urls: list[str] = []
            if scan_use_proxy:
                pool = ProxyPool()
                if pool.count_listed() == 0:
                    try:
                        pool.refresh()
                    except Exception as e:
                        app.scan_progress = f"proxy refresh warn: {e}"
                # use healthy if any, else raw listed
                proxy_urls = list(pool._alive) if pool._alive else pool.listed_proxies()
                if not proxy_urls:
                    scan_use_proxy = False
                    app.scan_progress = "no proxies — scanning direct parallel"

            def on_page(page: int, batch: int, unique: int, total: int) -> None:
                app.scan_progress = (
                    f"{'parallel' if scan_parallel else 'seq'} "
                    f"page {page} +{batch} unique={unique}/~{total} "
                    f"workers={scan_workers if scan_parallel else 1} "
                    f"proxy={'on' if scan_use_proxy else 'off'}"
                )
                save_scan_meta(
                    {
                        "scanId": scan_id,
                        "kind": kind,
                        "value": value,
                        "totalReported": total,
                        "count": unique,
                        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "status": "running",
                        "progress": app.scan_progress,
                        "parallel": scan_parallel,
                        "workers": scan_workers,
                        "rows": scan_rows,
                        "useProxy": scan_use_proxy,
                    }
                )

            if scan_parallel:
                cards, total = enumerate_search_parallel(
                    category=category,
                    apps=apps,
                    nodes=nodes,
                    search=search,
                    limit=limit,
                    rows=scan_rows,
                    workers=scan_workers,
                    min_delay=float(settings.get("scanMinDelay") or 0.15),
                    max_delay=float(settings.get("scanMaxDelay") or 0.55),
                    pause_prob=0.0,
                    use_proxy=scan_use_proxy,
                    proxy_urls=proxy_urls or None,
                    proxy_fallback_direct=bool(
                        settings.get("proxyFallbackDirect", True)
                    ),
                    on_page=on_page,
                    stop_flag=lambda: app.stop_scan.is_set(),
                    log=lambda m: None,
                )
            else:
                cfg = StealthConfig(
                    min_delay=float(settings.get("minDelay") or 1.2),
                    max_delay=float(settings.get("maxDelay") or 5.5),
                    pause_prob=float(settings.get("pauseProb") or 0.05),
                )
                with StealthSession(cfg, quiet=True) as session:
                    cards, total = enumerate_search(
                        session,
                        category=category,
                        apps=apps,
                        nodes=nodes,
                        search=search,
                        limit=limit,
                        rows=scan_rows,
                        on_page=on_page,
                        stop_flag=lambda: app.stop_scan.is_set(),
                    )
            addrs = [
                address_from_card(
                    c,
                    source_kind=kind,
                    source_value=value,
                    scan_id=scan_id,
                )
                for c in cards
            ]
            append_scan_addresses(scan_id, addrs)
            coverage = (
                f"{len(addrs)}/{total}" if total else str(len(addrs))
            )
            save_scan_meta(
                {
                    "scanId": scan_id,
                    "kind": kind,
                    "value": value,
                    "totalReported": total,
                    "count": len(addrs),
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "status": "done",
                    "parallel": scan_parallel,
                    "workers": scan_workers,
                    "rows": scan_rows,
                    "useProxy": scan_use_proxy,
                    "coverage": coverage,
                }
            )
            app.active_scan_id = scan_id
            reload_list(app)
            app.mode = "list"
            miss = (total or 0) - len(addrs) if total else 0
            app.message = (
                f"Scan done: {len(addrs)} addresses (api total={total}"
                f"{f', missing≈{miss}' if miss > 0 else ', complete'})"
            )
        except Exception as e:
            app.message = f"Scan failed: {e}"
            save_scan_meta(
                {
                    "scanId": scan_id,
                    "kind": kind,
                    "value": value,
                    "status": "failed",
                    "error": str(e),
                    "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            )
        finally:
            app.scan_running = False
            app.scan_progress = ""

    threading.Thread(target=run, daemon=True).start()


def reload_list(app: App) -> None:
    sid = app.active_scan_id
    if not sid:
        scans = list_scans()
        if scans:
            sid = scans[0].get("scanId")
            app.active_scan_id = sid
    if not sid:
        app.list_rows = []
        return
    app.list_rows = load_scan_addresses(
        sid, query=app.list_query, limit=5000
    )
    app.list_sel = clamp(app.list_sel, 0, max(0, len(app.list_rows) - 1))


def reload_queue(app: App) -> None:
    rows = list_queue()
    if app.queue_filter != "all":
        rows = [r for r in rows if r.get("status") == app.queue_filter]
    # newest first for done/failed, pending first otherwise
    app.queue_rows = list(reversed(rows)) if app.queue_filter in ("done", "failed") else rows
    app.queue_sel = clamp(app.queue_sel, 0, max(0, len(app.queue_rows) - 1))


def start_worker(app: App) -> None:
    if is_worker_alive():
        app.message = "Worker already running"
        return
    worker = ROOT / "queue_worker.py"
    logp = worker_log_path()
    # detach
    with open(logp, "a", encoding="utf-8") as lf:
        subprocess.Popen(
            [sys.executable, str(worker)],
            cwd=str(ROOT),
            stdout=lf,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    time.sleep(0.3)
    app.message = "Worker started" if is_worker_alive() else "Worker start attempted"


def stop_worker(app: App) -> None:
    st = Path(jobs_root() / "run-state.json")
    pid = None
    if st.exists():
        try:
            pid = json.loads(st.read_text()).get("pid")
        except json.JSONDecodeError:
            pass
    pf = jobs_root() / "worker.pid"
    if not pid and pf.exists():
        try:
            pid = int(pf.read_text().strip())
        except ValueError:
            pid = None
    if not pid:
        app.message = "No worker pid"
        return
    try:
        os.kill(int(pid), 15)
        app.message = f"Sent SIGTERM to worker {pid}"
    except OSError as e:
        app.message = f"Stop failed: {e}"


def run_selected_now(app: App) -> None:
    """Enqueue selected list ids at high priority and ensure worker."""
    if app.mode == "list":
        ids = list(app.list_selected)
        if not ids and app.list_rows:
            ids = [int(app.list_rows[app.list_sel]["id"])]
        addrs = [r for r in app.list_rows if int(r["id"]) in set(ids)]
        if not addrs and ids:
            addrs = [address_from_id(i, scan_id=app.active_scan_id or "adhoc") for i in ids]
        n = enqueue(addrs, priority=10)
        app.message = f"Enqueued {n} (priority)"
    elif app.mode == "queue":
        if not app.queue_rows:
            return
        row = app.queue_rows[app.queue_sel]
        requeue_failed([int(row["id"])])
        app.message = f"Requeued {row.get('id')}"
    start_worker(app)


def draw_header(stdscr: Any, app: App, h: int, w: int) -> None:
    worker = "ON" if is_worker_alive() else "off"
    counts = queue_counts()
    tabs = " ".join(
        ("[" + m.upper() + "]" if m == app.mode else m) for m in MODES if m != "help"
    )
    line1 = f" n8n scrape TUI  |  worker:{worker}  q:{counts.get('pending',0)}p/{counts.get('running',0)}r/{counts.get('done',0)}d/{counts.get('failed',0)}f  "
    line2 = f" {tabs}  |  Tab cycle  ? help  q quit  "
    safe_addstr(stdscr, 0, 0, line1[: w - 1], curses.A_REVERSE)
    safe_addstr(stdscr, 1, 0, line2[: w - 1], curses.A_DIM)


def draw_footer(stdscr: Any, app: App, h: int, w: int) -> None:
    msg = app.message or ""
    if app.scan_running:
        msg = f"SCAN {app.scan_progress} | {msg}"
    if app.input_mode:
        prompt = {
            "search": "search> ",
            "id": "id/url> ",
            "filter": "filter facets> ",
            "list_filter": "list filter> ",
            "custom_facet": f"custom {app.facet_kind}> ",
            "settings_edit": f"{app.input_target}= ",
        }.get(app.input_mode, "> ")
        msg = prompt + app.input_buf
    safe_addstr(stdscr, h - 1, 0, msg[: w - 1].ljust(w - 1), curses.A_REVERSE)


def draw_scan(stdscr: Any, app: App, y0: int, h: int, w: int) -> None:
    kinds = ["all", "category", "apps", "nodes", "search", "id"]
    kind_line = " source: " + "  ".join(
        (f"*{k}*" if k == app.facet_kind else k) for k in kinds
    )
    safe_addstr(stdscr, y0, 0, kind_line[: w - 1])
    safe_addstr(
        stdscr,
        y0 + 1,
        0,
        " 1-6 switch source | / input | f filter facets | Enter run scan | c cancel scan | R reload facets",
        curses.A_DIM,
    )
    if app.facet_kind == "apps":
        safe_addstr(
            stdscr,
            y0 + 2,
            0,
            " apps ≡ site ?integrations=…  e.g. Google Sheets",
            curses.A_DIM,
        )
    body_top = y0 + 3
    body_h = h - body_top - 1
    items = app.facet_items
    if app.facet_sel < app.facet_scroll:
        app.facet_scroll = app.facet_sel
    if app.facet_sel >= app.facet_scroll + body_h:
        app.facet_scroll = app.facet_sel - body_h + 1
    for i in range(body_h):
        idx = app.facet_scroll + i
        if idx >= len(items):
            break
        it = items[idx]
        mark = ">" if idx == app.facet_sel else " "
        cnt = it.get("count")
        cnt_s = f"  ({cnt})" if cnt is not None else ""
        line = f" {mark} {it.get('value')}{cnt_s}"
        attr = curses.A_REVERSE if idx == app.facet_sel else 0
        safe_addstr(stdscr, body_top + i, 0, line[: w - 1], attr)


def draw_list(stdscr: Any, app: App, y0: int, h: int, w: int) -> None:
    sid = app.active_scan_id or "-"
    n = len(app.list_rows)
    total = count_scan_addresses(sid) if sid != "-" else 0
    safe_addstr(
        stdscr,
        y0,
        0,
        f" scan={sid}  showing {n}/{total}  selected={len(app.list_selected)}  query={app.list_query!r}",
    )
    safe_addstr(
        stdscr,
        y0 + 1,
        0,
        " Space toggle | a all | A clear | e enqueue sel | E enqueue ALL | n run now | / filter | [ ] prev/next scan",
        curses.A_DIM,
    )
    body_top = y0 + 2
    body_h = h - body_top - 1
    if app.list_sel < app.list_scroll:
        app.list_scroll = app.list_sel
    if app.list_sel >= app.list_scroll + body_h:
        app.list_scroll = app.list_sel - body_h + 1
    for i in range(body_h):
        idx = app.list_scroll + i
        if idx >= len(app.list_rows):
            break
        r = app.list_rows[idx]
        wid = int(r["id"])
        chk = "x" if wid in app.list_selected else " "
        cur = ">" if idx == app.list_sel else " "
        name = (r.get("name") or "")[: max(10, w - 40)]
        line = f" {cur}[{chk}] {wid:>6}  {name}"
        attr = curses.A_REVERSE if idx == app.list_sel else 0
        safe_addstr(stdscr, body_top + i, 0, line[: w - 1], attr)


def draw_queue(stdscr: Any, app: App, y0: int, h: int, w: int) -> None:
    counts = queue_counts()
    safe_addstr(
        stdscr,
        y0,
        0,
        f" filter={app.queue_filter}  pending={counts.get('pending')} running={counts.get('running')} "
        f"done={counts.get('done')} failed={counts.get('failed')}",
    )
    safe_addstr(
        stdscr,
        y0 + 1,
        0,
        " S start worker | X stop | r requeue failed | d drop pending | 1-5 filter | n run",
        curses.A_DIM,
    )
    body_top = y0 + 2
    body_h = h - body_top - 1
    if app.queue_sel < app.queue_scroll:
        app.queue_scroll = app.queue_sel
    if app.queue_sel >= app.queue_scroll + body_h:
        app.queue_scroll = app.queue_sel - body_h + 1
    for i in range(body_h):
        idx = app.queue_scroll + i
        if idx >= len(app.queue_rows):
            break
        r = app.queue_rows[idx]
        cur = ">" if idx == app.queue_sel else " "
        name = (r.get("name") or "")[: max(8, w - 55)]
        proxy = (r.get("proxy") or "-")[-18:]
        line = (
            f" {cur}{r.get('id'):>6}  {str(r.get('status')):8}  "
            f"{str(r.get('stage')):12}  a{r.get('attempts',0)}  {proxy:18}  {name}"
        )
        attr = curses.A_REVERSE if idx == app.queue_sel else 0
        safe_addstr(stdscr, body_top + i, 0, line[: w - 1], attr)


def draw_proxies(stdscr: Any, app: App, y0: int, h: int, w: int) -> None:
    s = load_settings()
    pool = ProxyPool()
    summary = pool.summary()
    app.proxy_summary = summary
    lines = [
        f" useProxy={s.get('useProxy')}  fallbackDirect={s.get('proxyFallbackDirect')}",
        f" source={s.get('proxyUrl')}",
        f" listed={summary.get('listed')}  alive={summary.get('alive')}  dead={summary.get('dead')}",
        f" list={summary.get('listPath')}",
        f" updated={summary.get('updatedAt')}",
        "",
        " R refresh list from Databay | H health-check sample | t toggle useProxy",
        " Free SOCKS5 lists are often dead — probe before enabling.",
        f" busy={app.proxy_busy}",
    ]
    for i, line in enumerate(lines):
        if y0 + i >= h - 1:
            break
        safe_addstr(stdscr, y0 + i, 0, line[: w - 1])


def draw_settings(stdscr: Any, app: App, y0: int, h: int, w: int) -> None:
    app.settings = load_settings()
    keys = [
        "concurrency",
        "minDelay",
        "maxDelay",
        "pauseProb",
        "html",
        "useProxy",
        "proxyFallbackDirect",
        "maxAttempts",
        "shuffleQueue",
        "skipExisting",
        "scanParallel",
        "scanWorkers",
        "scanRows",
        "scanUseProxy",
        "scanMinDelay",
        "scanMaxDelay",
        "outDir",
        "proxyUrl",
        "proxyProbeTimeout",
    ]
    app.settings_keys = keys
    safe_addstr(stdscr, y0, 0, " Enter edit | +/- toggle bools / nudge numbers | s save", curses.A_DIM)
    body_top = y0 + 1
    for i, k in enumerate(keys):
        if body_top + i >= h - 1:
            break
        cur = ">" if i == app.settings_sel else " "
        val = app.settings.get(k)
        line = f" {cur} {k:22} = {val}"
        attr = curses.A_REVERSE if i == app.settings_sel else 0
        safe_addstr(stdscr, body_top + i, 0, line[: w - 1], attr)


def draw_log(stdscr: Any, app: App, y0: int, h: int, w: int) -> None:
    lp = worker_log_path()
    lines: list[str] = []
    if lp.exists():
        try:
            raw = lp.read_text(encoding="utf-8", errors="replace").splitlines()
            lines = raw[-500:]
        except OSError:
            lines = ["(cannot read log)"]
    else:
        lines = ["(no worker.log yet — start worker with S)"]
    app.log_lines = lines
    body_h = h - y0 - 1
    start = max(0, len(lines) - body_h - app.log_scroll)
    end = start + body_h
    for i, line in enumerate(lines[start:end]):
        safe_addstr(stdscr, y0 + i, 0, line[: w - 1])


def draw_help(stdscr: Any, app: App, y0: int, h: int, w: int) -> None:
    help_text = [
        "WORKFLOW: Scan → List cherry-pick → Enqueue → Start worker",
        "",
        "SCAN: 1 all  2 category  3 apps (integrations)  4 nodes  5 search  6 id",
        "      Enter run scan   / text or custom facet value   f filter list   R reload",
        "LIST: Space select  a/A all/clear  e enqueue  E enqueue all  n run now",
        "      [ ] prev/next scan   / filter list",
        "QUEUE: S start worker  X stop  r requeue failed  d drop  1-5 status filter",
        "PROXIES: R refresh Databay SOCKS5  H health check  t toggle useProxy",
        "SETTINGS: edit delays, concurrency, html, outDir",
        "",
        "Site: https://n8n.io/workflows/  |  ?integrations=Google+Sheets → apps filter",
        "Output: .scraped/n8n-workflows/workflows/{id}/meta.json + workflow.json",
        "Worker keeps running if you quit the TUI (q).",
    ]
    for i, line in enumerate(help_text):
        if y0 + i >= h - 1:
            break
        safe_addstr(stdscr, y0 + i, 0, line[: w - 1])


def handle_input_mode(app: App, key: int) -> bool:
    if app.input_mode is None:
        return False
    if key in (27,):  # esc
        app.input_mode = None
        app.input_buf = ""
        return True
    if key in (10, 13):  # enter
        mode = app.input_mode
        buf = app.input_buf
        app.input_mode = None
        app.input_buf = ""
        if mode in ("search", "id"):
            app.search_input = buf
            if mode == "search":
                app.facet_kind = "search"
            else:
                app.facet_kind = "id"
            rebuild_facet_items(app)
            app.message = f"Set {mode}: {buf}"
        elif mode == "custom_facet":
            # inject typed value at top of facet list and select it
            val = buf.strip()
            if val:
                app.facet_items = [{"value": val, "count": None}] + [
                    i for i in app.facet_items if str(i.get("value")) != val
                ]
                app.facet_sel = 0
                app.message = f"Custom {app.facet_kind}={val} (Enter to scan)"
            else:
                app.message = "Empty custom value"
        elif mode == "filter":
            app.facet_filter = buf
            rebuild_facet_items(app)
        elif mode == "list_filter":
            app.list_query = buf
            reload_list(app)
        elif mode == "settings_edit":
            k = app.input_target
            settings = load_settings()
            old = settings.get(k)
            try:
                if isinstance(old, bool):
                    settings[k] = buf.strip().lower() in ("1", "true", "yes", "on")
                elif isinstance(old, int):
                    settings[k] = int(buf)
                elif isinstance(old, float):
                    settings[k] = float(buf)
                else:
                    settings[k] = buf
                save_settings(settings)
                app.message = f"Saved {k}={settings[k]}"
            except ValueError:
                app.message = f"Invalid value for {k}"
        return True
    if key in (curses.KEY_BACKSPACE, 127, 8):
        app.input_buf = app.input_buf[:-1]
        return True
    if 32 <= key < 127:
        app.input_buf += chr(key)
        return True
    return True


def main_curses(stdscr: Any) -> None:
    curses.curs_set(0)
    stdscr.nodelay(True)
    stdscr.timeout(200)
    app = App()
    app.settings = load_settings()
    jobs_root()
    load_facets_bg(app)
    rebuild_facet_items(app)
    scans = list_scans()
    if scans:
        app.active_scan_id = scans[0].get("scanId")
        reload_list(app)
    reload_queue(app)

    while True:
        stdscr.erase()
        h, w = stdscr.getmaxyx()
        draw_header(stdscr, app, h, w)
        y0 = 2
        body_h = h
        if app.mode == "scan":
            draw_scan(stdscr, app, y0, body_h, w)
        elif app.mode == "list":
            draw_list(stdscr, app, y0, body_h, w)
        elif app.mode == "queue":
            reload_queue(app)
            draw_queue(stdscr, app, y0, body_h, w)
        elif app.mode == "proxies":
            draw_proxies(stdscr, app, y0, body_h, w)
        elif app.mode == "settings":
            draw_settings(stdscr, app, y0, body_h, w)
        elif app.mode == "log":
            draw_log(stdscr, app, y0, body_h, w)
        elif app.mode == "help":
            draw_help(stdscr, app, y0, body_h, w)
        draw_footer(stdscr, app, h, w)
        stdscr.refresh()

        try:
            key = stdscr.getch()
        except KeyboardInterrupt:
            break
        if key == -1:
            continue

        if handle_input_mode(app, key):
            continue

        if key in (ord("q"),):
            break
        if key in (ord("?"),):
            app.mode = "help"
            continue
        if key == 9:  # Tab
            cycle = ["scan", "list", "queue", "proxies", "settings", "log"]
            i = cycle.index(app.mode) if app.mode in cycle else -1
            app.mode = cycle[(i + 1) % len(cycle)]
            continue

        # global worker controls
        if key == ord("S"):
            start_worker(app)
            continue
        if key == ord("X"):
            stop_worker(app)
            continue

        if app.mode == "scan":
            if key == ord("1"):
                app.facet_kind = "all"
                rebuild_facet_items(app)
            elif key == ord("2"):
                app.facet_kind = "category"
                rebuild_facet_items(app)
            elif key == ord("3"):
                app.facet_kind = "apps"
                rebuild_facet_items(app)
            elif key == ord("4"):
                app.facet_kind = "nodes"
                rebuild_facet_items(app)
            elif key == ord("5"):
                app.facet_kind = "search"
                rebuild_facet_items(app)
            elif key == ord("6"):
                app.facet_kind = "id"
                rebuild_facet_items(app)
            elif key == ord("/"):
                # free-text: search/id modes, or custom facet value for apps/category/nodes
                if app.facet_kind == "id":
                    app.input_mode = "id"
                    app.input_buf = app.search_input
                elif app.facet_kind == "search":
                    app.input_mode = "search"
                    app.input_buf = app.search_input
                elif app.facet_kind in ("apps", "category", "nodes"):
                    app.input_mode = "custom_facet"
                    app.input_buf = ""
                else:
                    app.input_mode = "search"
                    app.facet_kind = "search"
                    app.input_buf = app.search_input
            elif key == ord("f"):
                app.input_mode = "filter"
                app.input_buf = app.facet_filter
            elif key == ord("R"):
                load_facets_bg(app)
                app.message = "Reloading facets…"
            elif key == ord("c"):
                app.stop_scan.set()
                app.message = "Cancel scan requested"
            elif key in (10, 13):
                start_scan(app)
            elif key == curses.KEY_UP:
                app.facet_sel = max(0, app.facet_sel - 1)
            elif key == curses.KEY_DOWN:
                app.facet_sel = min(max(0, len(app.facet_items) - 1), app.facet_sel + 1)
            elif key == curses.KEY_PPAGE:
                app.facet_sel = max(0, app.facet_sel - 10)
            elif key == curses.KEY_NPAGE:
                app.facet_sel = min(max(0, len(app.facet_items) - 1), app.facet_sel + 10)

        elif app.mode == "list":
            if key == curses.KEY_UP:
                app.list_sel = max(0, app.list_sel - 1)
            elif key == curses.KEY_DOWN:
                app.list_sel = min(max(0, len(app.list_rows) - 1), app.list_sel + 1)
            elif key == curses.KEY_PPAGE:
                app.list_sel = max(0, app.list_sel - 20)
            elif key == curses.KEY_NPAGE:
                app.list_sel = min(max(0, len(app.list_rows) - 1), app.list_sel + 20)
            elif key == ord(" "):
                if app.list_rows:
                    wid = int(app.list_rows[app.list_sel]["id"])
                    if wid in app.list_selected:
                        app.list_selected.discard(wid)
                    else:
                        app.list_selected.add(wid)
            elif key == ord("a"):
                app.list_selected = {int(r["id"]) for r in app.list_rows}
                app.message = f"Selected {len(app.list_selected)}"
            elif key == ord("A"):
                app.list_selected.clear()
            elif key == ord("/"):
                app.input_mode = "list_filter"
                app.input_buf = app.list_query
            elif key == ord("e"):
                ids = app.list_selected
                addrs = [r for r in app.list_rows if int(r["id"]) in ids]
                if not addrs and app.list_rows:
                    addrs = [app.list_rows[app.list_sel]]
                n = enqueue(addrs)
                app.message = f"Enqueued {n}"
                reload_queue(app)
            elif key == ord("E"):
                if not app.active_scan_id:
                    app.message = "No active scan"
                else:
                    m = load_all_scan_ids_map(app.active_scan_id)
                    n = enqueue(list(m.values()))
                    app.message = f"Enqueued entire scan: {n}"
                    reload_queue(app)
            elif key == ord("n"):
                run_selected_now(app)
            elif key == ord("["):
                scans = list_scans()
                ids = [s.get("scanId") for s in scans]
                if app.active_scan_id in ids:
                    i = ids.index(app.active_scan_id)
                    app.active_scan_id = ids[min(len(ids) - 1, i + 1)]
                elif ids:
                    app.active_scan_id = ids[0]
                reload_list(app)
            elif key == ord("]"):
                scans = list_scans()
                ids = [s.get("scanId") for s in scans]
                if app.active_scan_id in ids:
                    i = ids.index(app.active_scan_id)
                    app.active_scan_id = ids[max(0, i - 1)]
                elif ids:
                    app.active_scan_id = ids[0]
                reload_list(app)
            elif key == ord("r"):
                reload_list(app)

        elif app.mode == "queue":
            if key == curses.KEY_UP:
                app.queue_sel = max(0, app.queue_sel - 1)
            elif key == curses.KEY_DOWN:
                app.queue_sel = min(max(0, len(app.queue_rows) - 1), app.queue_sel + 1)
            elif key == ord("1"):
                app.queue_filter = "all"
            elif key == ord("2"):
                app.queue_filter = "pending"
            elif key == ord("3"):
                app.queue_filter = "running"
            elif key == ord("4"):
                app.queue_filter = "done"
            elif key == ord("5"):
                app.queue_filter = "failed"
            elif key == ord("r"):
                if app.queue_rows:
                    n = requeue_failed([int(app.queue_rows[app.queue_sel]["id"])])
                    app.message = f"Requeued {n}"
                else:
                    n = requeue_failed()
                    app.message = f"Requeued all failed: {n}"
            elif key == ord("d"):
                if app.queue_rows:
                    wid = int(app.queue_rows[app.queue_sel]["id"])
                    n = drop_jobs([wid], only_pending=True)
                    app.message = f"Dropped {n}"
            elif key == ord("n"):
                run_selected_now(app)

        elif app.mode == "proxies":
            if key == ord("t"):
                s = load_settings()
                s["useProxy"] = not bool(s.get("useProxy"))
                save_settings(s)
                app.message = f"useProxy={s['useProxy']}"
            elif key == ord("R"):
                if app.proxy_busy:
                    continue

                def refresh() -> None:
                    app.proxy_busy = True
                    try:
                        n = ProxyPool().refresh()
                        app.message = f"Refreshed {n} proxies"
                    except Exception as e:
                        app.message = f"Refresh failed: {e}"
                    finally:
                        app.proxy_busy = False

                threading.Thread(target=refresh, daemon=True).start()
            elif key == ord("H"):
                if app.proxy_busy:
                    continue

                def probe() -> None:
                    app.proxy_busy = True
                    try:
                        res = ProxyPool().health_check(limit=25)
                        app.message = f"Probe {res}"
                    except Exception as e:
                        app.message = f"Probe failed: {e}"
                    finally:
                        app.proxy_busy = False

                threading.Thread(target=probe, daemon=True).start()
                app.message = "Probing proxies…"

        elif app.mode == "settings":
            if key == curses.KEY_UP:
                app.settings_sel = max(0, app.settings_sel - 1)
            elif key == curses.KEY_DOWN:
                app.settings_sel = min(len(app.settings_keys) - 1, app.settings_sel + 1)
            elif key in (10, 13):
                k = app.settings_keys[app.settings_sel]
                app.input_mode = "settings_edit"
                app.input_target = k
                app.input_buf = str(load_settings().get(k, ""))
            elif key == ord("s"):
                save_settings(load_settings())
                app.message = "Settings saved"
            elif key in (ord("+"), ord("=")):
                k = app.settings_keys[app.settings_sel]
                s = load_settings()
                v = s.get(k)
                if isinstance(v, bool):
                    s[k] = True
                elif isinstance(v, int):
                    s[k] = v + 1
                elif isinstance(v, float):
                    s[k] = round(v + 0.1, 3)
                save_settings(s)
            elif key in (ord("-"), ord("_")):
                k = app.settings_keys[app.settings_sel]
                s = load_settings()
                v = s.get(k)
                if isinstance(v, bool):
                    s[k] = False
                elif isinstance(v, int):
                    s[k] = max(0, v - 1)
                elif isinstance(v, float):
                    s[k] = max(0.0, round(v - 0.1, 3))
                save_settings(s)

        elif app.mode == "log":
            if key == curses.KEY_UP:
                app.log_scroll = min(app.log_scroll + 1, 400)
            elif key == curses.KEY_DOWN:
                app.log_scroll = max(0, app.log_scroll - 1)
            elif key == ord("g"):
                app.log_scroll = 0


def main() -> int:
    try:
        curses.wrapper(main_curses)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
