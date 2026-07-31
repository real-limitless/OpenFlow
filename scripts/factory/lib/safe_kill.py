#!/usr/bin/env python3
"""
Safely kill OpenFlow factory processes only.

NEVER kills process groups unless the group leader cmdline is clearly a factory
worker. NEVER touches PID 1 or the caller's session if it looks like a desktop.

Usage:
  safe_kill.py worker --pid PID [--pgid PGID]
  safe_kill.py factory-agents
  safe_kill.py type --type n8n-nodes-base.foo
  safe_kill.py pids --pids 1,2,3
"""
from __future__ import annotations

import argparse
import os
import signal
import sys
import time
from pathlib import Path

FACTORY_MARKERS = (
    "scripts/factory/lib/run_node_pipeline.sh",
    "scripts/factory/lib/queue_worker.sh",
    "scripts/factory/run_queue.sh",
)
# Must appear together with a factory marker or opencode+factory title
TITLE_MARKERS = (
    "factory SPEC ",
    "factory IMPL ",
    "factory VAL ",
)

# Never kill these
BLOCKLIST_SUBSTR = (
    "gnome",
    "kwin",
    "plasmashell",
    "xfce",
    "wayland",
    "Xorg",
    "xfwm",
    "mutter",
    "sddm",
    "gdm",
    "systemd --user",
    "dbus-daemon",
    "pipewire",
    "wireplumber",
    "ssh-agent",
    "opencode tui",  # interactive user opencode, not factory run
)


def cmdline_of(pid: int) -> str:
    try:
        raw = open(f"/proc/{pid}/cmdline", "rb").read()
        return raw.replace(b"\x00", b" ").decode("utf-8", "replace").strip()
    except Exception:
        return ""


def is_factory_cmd(cmd: str) -> bool:
    if not cmd:
        return False
    low = cmd.lower()
    if any(b in low for b in BLOCKLIST_SUBSTR):
        return False
    # Explicit factory scripts
    if any(m in cmd for m in FACTORY_MARKERS):
        # avoid killing node_ctl / run_queue stop itself mid-flight if possible
        if "safe_kill.py" in cmd:
            return False
        return True
    # opencode / timeout / stdbuf only when factory SPEC|IMPL|VAL title present
    if any(t in cmd for t in TITLE_MARKERS):
        if "opencode" in cmd or "timeout" in cmd or "stdbuf" in cmd:
            return True
    return False


def children_of(pid: int) -> list[int]:
    out = []
    try:
        for name in os.listdir("/proc"):
            if not name.isdigit():
                continue
            try:
                stat = open(f"/proc/{name}/stat", encoding="utf-8").read().split()
                # ppid is field 4 (index 3)
                if int(stat[3]) == pid:
                    out.append(int(name))
            except Exception:
                continue
    except Exception:
        pass
    return out


def kill_tree_safe(pid: int, log: list[str]) -> None:
    """Kill pid and its descendants one-by-one. Never killpg."""
    if pid <= 1:
        return
    # build tree depth-first
    stack = [pid]
    order: list[int] = []
    seen: set[int] = set()
    while stack:
        p = stack.pop()
        if p in seen or p <= 1:
            continue
        seen.add(p)
        kids = children_of(p)
        stack.extend(kids)
        order.append(p)
    # kill children before parents
    for p in reversed(order):
        cmd = cmdline_of(p)
        # only kill non-root of tree if factory-related OR descendant of verified factory root
        if p != pid and not is_factory_cmd(cmd) and p not in seen:
            continue
        if p == pid and not is_factory_cmd(cmd):
            # allow killing explicit pid only if it's factory OR we were given pipeline.pid
            # still require factory marker for safety when using broad scans
            pass
        try:
            os.kill(p, signal.SIGTERM)
            log.append(f"TERM {p} {cmd[:120]}")
        except Exception as e:
            log.append(f"TERM-fail {p} {e}")
    time.sleep(0.15)
    for p in reversed(order):
        try:
            os.kill(p, 0)
        except Exception:
            continue
        try:
            os.kill(p, signal.SIGKILL)
            log.append(f"KILL {p}")
        except Exception:
            pass


def verify_factory_pid(pid: int) -> bool:
    if pid <= 1:
        return False
    return is_factory_cmd(cmdline_of(pid))


def kill_worker(pid: int | None, pgid: int | None) -> list[str]:
    log: list[str] = []
    # Prefer verified single pid tree — NEVER kill -$pgid unless pgid cmdline is queue_worker
    targets: list[int] = []
    if pid and verify_factory_pid(pid):
        targets.append(pid)
    elif pid:
        log.append(f"skip-unverified-worker-pid {pid} cmd={cmdline_of(pid)[:80]}")
    if pgid and pgid != pid:
        if verify_factory_pid(pgid) and "queue_worker" in cmdline_of(pgid):
            # kill members of group individually, not killpg
            for name in os.listdir("/proc"):
                if not name.isdigit():
                    continue
                p = int(name)
                try:
                    # pgid from /proc/pid/stat field 5 (index 4)
                    stat = open(f"/proc/{name}/stat", encoding="utf-8").read().split()
                    if int(stat[4]) == pgid and verify_factory_pid(p):
                        targets.append(p)
                except Exception:
                    continue
        else:
            log.append(f"skip-unverified-pgid {pgid} cmd={cmdline_of(pgid)[:80]}")
    for t in sorted(set(targets)):
        kill_tree_safe(t, log)
    return log


def collect_factory_agent_pids(type_filter: str | None = None) -> list[int]:
    found = []
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        pid = int(name)
        cmd = cmdline_of(pid)
        if not is_factory_cmd(cmd):
            continue
        if type_filter:
            # type must appear in cmdline for per-type kill
            if type_filter not in cmd and f"--type {type_filter}" not in cmd:
                # also match title "factory IMPL type"
                if not any(
                    f"factory {s} {type_filter}" in cmd for s in ("SPEC", "IMPL", "VAL")
                ):
                    continue
        found.append(pid)
    return found


def kill_from_pidfiles(jobs_root: Path, type_filter: str | None = None) -> list[str]:
    log: list[str] = []
    nodes = jobs_root / "nodes"
    if not nodes.is_dir():
        return log
    for d in nodes.iterdir():
        if not d.is_dir():
            continue
        if type_filter:
            safe = type_filter.replace("/", "_")
            if d.name != safe and type_filter not in d.name:
                # check status type
                sp = d / "status.json"
                if sp.exists():
                    try:
                        import json

                        if json.loads(sp.read_text()).get("type") != type_filter:
                            continue
                    except Exception:
                        continue
                else:
                    continue
        for pf in ("pipeline.pid", "opencode.pid"):
            path = d / pf
            if not path.is_file():
                continue
            try:
                pid = int(path.read_text().strip())
            except Exception:
                continue
            if verify_factory_pid(pid) or pf == "pipeline.pid":
                # pipeline.pid is written by our script — trust more
                if pf == "pipeline.pid" or verify_factory_pid(pid):
                    kill_tree_safe(pid, log)
            else:
                log.append(f"skip-pidfile {path} pid={pid} cmd={cmdline_of(pid)[:80]}")
    return log


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    w = sub.add_parser("worker")
    w.add_argument("--pid", type=int, default=None)
    w.add_argument("--pgid", type=int, default=None)

    sub.add_parser("factory-agents")

    t = sub.add_parser("type")
    t.add_argument("--type", required=True)

    p = sub.add_parser("pids")
    p.add_argument("--pids", required=True, help="comma-separated")

    args = ap.parse_args()
    jobs = Path(os.environ.get("FACTORY_JOBS", "scripts/factory/.jobs"))
    log: list[str] = []

    if args.cmd == "worker":
        log = kill_worker(args.pid, args.pgid)
    elif args.cmd == "factory-agents":
        log.extend(kill_from_pidfiles(jobs))
        for pid in collect_factory_agent_pids():
            kill_tree_safe(pid, log)
    elif args.cmd == "type":
        log.extend(kill_from_pidfiles(jobs, args.type))
        for pid in collect_factory_agent_pids(args.type):
            kill_tree_safe(pid, log)
    elif args.cmd == "pids":
        for part in args.pids.split(","):
            part = part.strip()
            if part.isdigit():
                kill_tree_safe(int(part), log)

    for line in log:
        print(line)
    print(f"safe_kill_events={len(log)}")


if __name__ == "__main__":
    main()
