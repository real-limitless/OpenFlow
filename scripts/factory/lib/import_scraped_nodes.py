#!/usr/bin/env python3
"""Discover unconverted n8n node types from scraped workflows and enqueue them.

Scans workflow.json dumps under .scraped/, diffs against docs/specs/catalog.json,
and optionally appends missing official types to the factory queue.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[3]
CATALOG = ROOT / "docs" / "specs" / "catalog.json"
SCRAPE_SETTINGS = ROOT / "scripts" / "scrape-n8n-workflows" / ".jobs" / "settings.json"
SCRAPED_ROOT = ROOT / ".scraped"

# Canvas-only / deprecated types that should not enter the factory by default.
DEFAULT_DENY = frozenset(
    {
        "n8n-nodes-base.stickyNote",
        "n8n-nodes-base.function",
        "n8n-nodes-base.functionItem",
        "n8n-nodes-base.cron",
        "n8n-nodes-base.start",
        "n8n-nodes-base.interval",
        "n8n-nodes-base.n8nTrainingCustomerDatastore",
        "n8n-nodes-base.n8nTrainingCustomerMessenger",
    }
)


def load_catalog() -> dict[str, Any]:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def save_catalog(data: dict[str, Any]) -> None:
    CATALOG.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def catalog_known_types(data: dict[str, Any]) -> set[str]:
    known: set[str] = set()
    for t in (data.get("nodes") or {}):
        known.add(str(t))
    for item in data.get("queue") or []:
        if isinstance(item, dict) and item.get("type"):
            known.add(str(item["type"]))
        elif isinstance(item, str):
            known.add(item)
    return known


def resolve_workflow_dirs(scraped_dir: str | None) -> list[Path]:
    """Return directories that contain per-id workflow folders with workflow.json."""
    if scraped_dir:
        p = Path(scraped_dir).expanduser().resolve()
        candidates = [p]
        if (p / "workflows").is_dir():
            candidates.append(p / "workflows")
        for c in candidates:
            if c.is_dir() and any(c.glob("*/workflow.json")):
                return [c]
        raise SystemExit(f"No workflows/*/workflow.json under {p}")

    found: list[Path] = []
    # Prefer scrape TUI outDir
    if SCRAPE_SETTINGS.exists():
        try:
            out = json.loads(SCRAPE_SETTINGS.read_text(encoding="utf-8")).get("outDir")
            if out:
                op = Path(out)
                if not op.is_absolute():
                    op = (ROOT / op).resolve()
                for c in (op, op / "workflows"):
                    if c.is_dir() and any(c.glob("*/workflow.json")):
                        found.append(c)
                        break
        except Exception:
            pass

    if not found and SCRAPED_ROOT.is_dir():
        for child in sorted(SCRAPED_ROOT.iterdir()):
            if not child.is_dir():
                continue
            for c in (child / "workflows", child):
                if c.is_dir() and any(c.glob("*/workflow.json")):
                    found.append(c)
                    break

    # Dedupe while preserving order
    seen: set[Path] = set()
    uniq: list[Path] = []
    for p in found:
        rp = p.resolve()
        if rp not in seen:
            seen.add(rp)
            uniq.append(rp)
    if not uniq:
        raise SystemExit(
            f"No scraped workflows found. Run the scraper or pass --scraped-dir. "
            f"Looked under {SCRAPED_ROOT}"
        )
    return uniq


def extract_types_from_workflow(path: Path) -> set[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return set()
    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        # Nested shapes seen in some dumps
        if isinstance(data.get("workflow"), dict):
            nodes = data["workflow"].get("nodes")
        elif isinstance(data.get("data"), dict):
            nodes = data["data"].get("nodes")
    if not isinstance(nodes, list):
        return set()
    types: set[str] = set()
    for n in nodes:
        if isinstance(n, dict):
            t = n.get("type")
            if isinstance(t, str) and t:
                types.add(t)
    return types


def is_official(type_name: str) -> bool:
    return type_name.startswith("n8n-nodes-base.") or type_name.startswith("@n8n/")


def package_of(type_name: str) -> str:
    if type_name.startswith("@n8n/"):
        # @n8n/n8n-nodes-langchain.foo → @n8n/n8n-nodes-langchain
        rest = type_name[len("@n8n/") :]
        if "." in rest:
            return "@n8n/" + rest.split(".", 1)[0]
        return "@n8n/" + rest
    if type_name.startswith("n8n-nodes-base."):
        return "n8n-nodes-base"
    if type_name.startswith("@"):
        # @scope/pkg.name → @scope/pkg
        body = type_name[1:]
        if "/" in body:
            scope, rest = body.split("/", 1)
            pkg = rest.split(".", 1)[0]
            return f"@{scope}/{pkg}"
        return type_name
    if "." in type_name:
        return type_name.split(".", 1)[0]
    return type_name


def tier_of(type_name: str) -> str:
    if type_name.startswith("@n8n/"):
        return "langchain"
    if type_name.startswith("n8n-nodes-base."):
        return "core"
    return "community"


def scan_usage(workflow_dirs: Iterable[Path]) -> tuple[Counter[str], int]:
    usage: Counter[str] = Counter()
    wf_count = 0
    for base in workflow_dirs:
        for wf in base.glob("*/workflow.json"):
            types = extract_types_from_workflow(wf)
            if not types:
                continue
            wf_count += 1
            for t in types:
                usage[t] += 1
    return usage, wf_count


def compute_gaps(
    usage: Counter[str],
    known: set[str],
    *,
    include_community: bool,
    min_workflows: int,
    use_denylist: bool,
) -> list[tuple[str, int]]:
    deny = DEFAULT_DENY if use_denylist else frozenset()
    gaps: list[tuple[str, int]] = []
    for t, count in usage.items():
        if count < min_workflows:
            continue
        if t in known:
            continue
        if t in deny:
            continue
        if not include_community and not is_official(t):
            continue
        gaps.append((t, count))
    gaps.sort(key=lambda x: (-x[1], x[0]))
    return gaps


def print_table(gaps: list[tuple[str, int]], *, top: int | None) -> None:
    rows = gaps if top is None or top <= 0 else gaps[:top]
    if not rows:
        print("No gaps found.")
        return
    w_type = max(len(t) for t, _ in rows)
    w_type = max(w_type, 4)
    print(f"{'type'.ljust(w_type)}  {'workflows':>9}  package  tier")
    print(f"{'-' * w_type}  {'-' * 9}  -------  ----")
    for t, c in rows:
        print(f"{t.ljust(w_type)}  {c:9d}  {package_of(t)}  {tier_of(t)}")
    if top and top > 0 and len(gaps) > top:
        print(f"\n… {len(gaps) - top} more (pass --top 0 or omit limit to show all)")


def cmd_report(args: argparse.Namespace) -> int:
    dirs = resolve_workflow_dirs(args.scraped_dir)
    usage, wf_count = scan_usage(dirs)
    data = load_catalog()
    known = catalog_known_types(data)
    gaps = compute_gaps(
        usage,
        known,
        include_community=args.include_community,
        min_workflows=args.min_workflows,
        use_denylist=not args.no_denylist,
    )

    summary = {
        "workflowDirs": [str(d) for d in dirs],
        "workflowsScanned": wf_count,
        "uniqueTypes": len(usage),
        "catalogKnown": len(known),
        "gaps": len(gaps),
        "includeCommunity": args.include_community,
        "minWorkflows": args.min_workflows,
    }

    if args.json:
        rows = gaps if not args.top or args.top <= 0 else gaps[: args.top]
        out = {
            **summary,
            "types": [
                {
                    "type": t,
                    "workflows": c,
                    "package": package_of(t),
                    "tier": tier_of(t),
                }
                for t, c in rows
            ],
        }
        print(json.dumps(out, indent=2))
        return 0

    print(
        f"Scraped dirs: {', '.join(str(d) for d in dirs)}\n"
        f"Workflows: {wf_count}  unique types: {len(usage)}  "
        f"catalog known: {len(known)}  gaps: {len(gaps)}\n"
    )
    print_table(gaps, top=args.top)
    return 0


def max_queue_priority(data: dict[str, Any]) -> int:
    pri = 0
    for item in data.get("queue") or []:
        if isinstance(item, dict):
            try:
                pri = max(pri, int(item.get("priority") or 0))
            except (TypeError, ValueError):
                pass
    return pri


def cmd_enqueue(args: argparse.Namespace) -> int:
    dirs = resolve_workflow_dirs(args.scraped_dir)
    usage, wf_count = scan_usage(dirs)
    data = load_catalog()
    known = catalog_known_types(data)
    gaps = compute_gaps(
        usage,
        known,
        include_community=args.include_community,
        min_workflows=args.min_workflows,
        use_denylist=not args.no_denylist,
    )

    top = args.top if args.top is not None else 50
    if top <= 0:
        selected = gaps
    else:
        selected = gaps[:top]

    print(
        f"Workflows: {wf_count}  gaps: {len(gaps)}  selecting: {len(selected)} "
        f"(top={top if top > 0 else 'all'}, min-workflows={args.min_workflows})"
    )
    if not selected:
        print("Nothing to enqueue.")
        return 0

    print_table(selected, top=None)

    next_pri = max_queue_priority(data) + 1
    nodes = data.setdefault("nodes", {})
    queue = data.setdefault("queue", [])
    if not isinstance(queue, list):
        raise SystemExit("catalog.queue must be a list")

    proposed: list[dict[str, Any]] = []
    for i, (t, count) in enumerate(selected):
        if t in known:
            continue
        entry_node = {
            "priority": "P2",
            "executor": "missing",
            "spec": "missing",
            "factory": "pending",
            "source": "scraped-usage",
            "usageWorkflows": count,
        }
        entry_queue = {
            "type": t,
            "priority": next_pri + i,
            "tier": tier_of(t),
            "executor": "missing",
            "spec": "missing",
        }
        proposed.append({"node": entry_node, "queue": entry_queue})

    if args.dry_run:
        print(f"\n[dry-run] would append {len(proposed)} types to catalog nodes+queue")
        for p in proposed[:10]:
            print(f"  + {p['queue']['type']}  pri={p['queue']['priority']}  "
                  f"tier={p['queue']['tier']}  workflows={p['node']['usageWorkflows']}")
        if len(proposed) > 10:
            print(f"  … {len(proposed) - 10} more")
        return 0

    added = 0
    for p in proposed:
        t = p["queue"]["type"]
        # Re-check in case of concurrent edits / prior dups
        if t in known or t in nodes:
            continue
        if any((isinstance(q, dict) and q.get("type") == t) or q == t for q in queue):
            known.add(t)
            continue
        nodes[t] = p["node"]
        queue.append(p["queue"])
        known.add(t)
        added += 1

    # Always scrub any pre-existing queue duplicates (first wins)
    from catalog import dedupe_queue  # type: ignore

    data, removed = dedupe_queue(data)
    data["updated"] = date.today().isoformat()
    save_catalog(data)
    msg = f"\nWrote {CATALOG.relative_to(ROOT)} (+{added} types)"
    if removed:
        msg += f", removed {len(removed)} queue duplicate(s)"
    print(msg)

    if args.refresh_pending:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from run_state import (  # type: ignore
            _dedupe_preserve,
            build_pending,
            load_state,
            save_state,
        )

        state = load_state()
        for k in ("pending", "active", "completed", "partial", "failed", "skipped"):
            state[k] = _dedupe_preserve(list(state.get(k) or []))
        state["pending"] = build_pending(include_partial=True)
        save_state(state)
        print(f"Refreshed run-state pending: {len(state['pending'])} types (lists deduped)")

    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Find unconverted n8n modules in scraped workflows and insert into factory catalog"
    )
    sub = p.add_subparsers(dest="cmd")

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument(
            "--scraped-dir",
            default=None,
            help="Scraped dump root or …/workflows dir (default: scrape settings outDir / .scraped/*)",
        )
        sp.add_argument(
            "--min-workflows",
            type=int,
            default=1,
            help="Minimum workflows that must use a type (default: 1)",
        )
        sp.add_argument(
            "--include-community",
            action="store_true",
            help="Include third-party community packages (default: official only)",
        )
        sp.add_argument(
            "--no-denylist",
            action="store_true",
            help="Do not skip stickyNote / deprecated function/cron/start/…",
        )

    r = sub.add_parser("report", help="List unconverted types ranked by workflow usage")
    add_common(r)
    r.add_argument(
        "--top",
        type=int,
        default=0,
        help="Show only top N gaps (0 = all, default)",
    )
    r.add_argument("--json", action="store_true", help="JSON output")

    e = sub.add_parser("enqueue", help="Append top gaps to catalog nodes + queue")
    add_common(e)
    e.add_argument(
        "--top",
        type=int,
        default=50,
        help="Enqueue top N by usage (default: 50; 0 = all matching)",
    )
    e.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview catalog changes without writing",
    )
    e.add_argument(
        "--refresh-pending",
        action="store_true",
        help="Rebuild scripts/factory/.jobs/run-state.json pending list",
    )

    d = sub.add_parser(
        "dedupe",
        help="Remove duplicate types from catalog.queue and factory run-state lists",
    )
    d.add_argument(
        "--dry-run",
        action="store_true",
        help="Report duplicates without writing",
    )

    return p


def cmd_dedupe(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from catalog import dedupe_queue, load, save  # type: ignore

    data = load()
    data, removed = dedupe_queue(data)
    print(f"catalog.queue duplicates: {removed or '(none)'}")
    if removed and not args.dry_run:
        data["updated"] = date.today().isoformat()
        save(data)
        print(f"Wrote {CATALOG.relative_to(ROOT)} (queue len {len(data.get('queue') or [])})")

    state_path = ROOT / "scripts" / "factory" / ".jobs" / "run-state.json"
    if state_path.exists():
        from run_state import _dedupe_preserve, load_state, save_state  # type: ignore

        state = load_state()
        any_rem = False
        for k in ("pending", "active", "completed", "partial", "failed", "skipped"):
            before = list(state.get(k) or [])
            after = _dedupe_preserve(before)
            if len(after) != len(before):
                dups = [t for t in before if before.count(t) > 1]
                print(f"run-state.{k}: removed dups {sorted(set(dups))}")
                state[k] = after
                any_rem = True
            else:
                print(f"run-state.{k}: ok ({len(after)})")
        if any_rem and not args.dry_run:
            save_state(state)
            print("Wrote run-state.json")
    if args.dry_run:
        print("[dry-run] no files written")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    # Default subcommand: report
    if not argv or argv[0].startswith("-"):
        argv = ["report", *argv]

    p = build_parser()
    args = p.parse_args(argv)
    if args.cmd == "report":
        return cmd_report(args)
    if args.cmd == "enqueue":
        return cmd_enqueue(args)
    if args.cmd == "dedupe":
        return cmd_dedupe(args)
    p.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
