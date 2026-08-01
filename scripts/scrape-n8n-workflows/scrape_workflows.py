#!/usr/bin/env python3
"""
Stealth scraper for public n8n workflow posts on https://n8n.io/workflows/

CLI entrypoint. Shared logic lives in lib/client.py.
For interactive scan / cherry-pick / queue, use tui.py.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.client import (  # noqa: E402
    HEALTH_URL,
    WORKFLOWS_HOME,
    StealthConfig,
    StealthSession,
    append_catalog,
    atomic_write_json,
    enumerate_search,
    enumerate_search_parallel,
    fetch_categories,
    fetch_one,
    is_complete,
    utc_now_iso,
)


@dataclass
class ScrapeState:
    path: Path
    discovered_ids: list[int] = field(default_factory=list)
    completed_ids: list[int] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)
    total_reported: int | None = None
    last_run: str | None = None

    @classmethod
    def load(cls, path: Path) -> ScrapeState:
        if not path.exists():
            return cls(path=path)
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            path=path,
            discovered_ids=[int(x) for x in data.get("discovered_ids", [])],
            completed_ids=[int(x) for x in data.get("completed_ids", [])],
            failed={str(k): str(v) for k, v in (data.get("failed") or {}).items()},
            total_reported=data.get("total_reported"),
            last_run=data.get("last_run"),
        )

    def save(self) -> None:
        atomic_write_json(
            self.path,
            {
                "discovered_ids": self.discovered_ids,
                "completed_ids": self.completed_ids,
                "failed": self.failed,
                "total_reported": self.total_reported,
                "last_run": self.last_run or utc_now_iso(),
                "counts": {
                    "discovered": len(self.discovered_ids),
                    "completed": len(self.completed_ids),
                    "failed": len(self.failed),
                },
            },
        )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Scrape public workflows from https://n8n.io/workflows/ (stealth + random)."
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / ".scraped" / "n8n-workflows",
        help="Output directory (default: <repo>/.scraped/n8n-workflows)",
    )
    p.add_argument(
        "--html",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Save full HTML post body (default: on)",
    )
    p.add_argument("--min-delay", type=float, default=1.2)
    p.add_argument("--max-delay", type=float, default=5.5)
    p.add_argument("--pause-prob", type=float, default=0.08)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--ids", type=str, default="")
    p.add_argument("--category", type=str, default="", help="Filter: category=AI")
    p.add_argument(
        "--apps",
        type=str,
        default="",
        help="Filter product/integration (site ?integrations=) e.g. 'Google Sheets'",
    )
    p.add_argument("--nodes", type=str, default="", help="Filter node type id")
    p.add_argument("--search", type=str, default="", help="Text search")
    p.add_argument("--no-resume", action="store_true")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--skip-warm", action="store_true")
    p.add_argument("--skip-enumerate", action="store_true")
    p.add_argument(
        "--parallel-scan",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Fetch catalog pages in parallel (fixed page size; default on)",
    )
    p.add_argument("--scan-workers", type=int, default=10, help="Parallel scan workers")
    p.add_argument(
        "--scan-rows",
        type=int,
        default=100,
        help="Fixed page size for enumeration (must stay constant)",
    )
    p.add_argument(
        "--scan-proxy",
        action="store_true",
        help="Use SOCKS5 pool for parallel page scans",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.min_delay > args.max_delay:
        print("--min-delay must be <= --max-delay", file=sys.stderr)
        return 2
    random.seed(args.seed if args.seed is not None else None)

    out_dir: Path = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    state = ScrapeState.load(out_dir / "state.json")
    catalog_path = out_dir / "catalog.jsonl"

    cfg = StealthConfig(
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        pause_prob=args.pause_prob,
    )

    only_ids: list[int] | None = None
    if args.ids.strip():
        only_ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]

    with StealthSession(cfg) as session:
        try:
            health = session.get_json(HEALTH_URL, referer=WORKFLOWS_HOME)
            print(f"API health: {health}", file=sys.stderr)
        except Exception as e:
            print(f"API health check failed: {e}", file=sys.stderr)
            return 1

        if not args.skip_warm:
            session.warm()

        cats = fetch_categories(session)
        if cats:
            atomic_write_json(out_dir / "categories.json", {"categories": cats})
            print(f"Saved {len(cats)} categories", file=sys.stderr)

        cards_by_id: dict[int, dict[str, Any]] = {}

        if only_ids is not None:
            targets = only_ids
            for i in only_ids:
                cards_by_id[i] = {"id": i, "slug": str(i)}
        elif args.skip_enumerate and state.discovered_ids:
            targets = list(state.discovered_ids)
            for i in targets:
                cards_by_id[i] = {"id": i, "slug": str(i)}
        else:
            on_page = lambda page, batch, unique, tot: print(
                f"  page {page}: +{batch} (unique {unique} / ~{tot})",
                file=sys.stderr,
            )
            if args.parallel_scan:
                proxy_urls = None
                if args.scan_proxy:
                    from lib.proxy_pool import ProxyPool

                    pool = ProxyPool()
                    if pool.count_listed() == 0:
                        try:
                            n = pool.refresh()
                            print(f"Refreshed {n} proxies", file=sys.stderr)
                        except Exception as e:
                            print(f"Proxy refresh failed: {e}", file=sys.stderr)
                    proxy_urls = list(pool._alive) or pool.listed_proxies()
                cards, total = enumerate_search_parallel(
                    category=args.category or None,
                    apps=args.apps or None,
                    nodes=args.nodes or None,
                    search=args.search or None,
                    limit=args.limit or 0,
                    rows=args.scan_rows,
                    workers=args.scan_workers,
                    min_delay=max(0.05, args.min_delay * 0.2),
                    max_delay=max(0.1, args.max_delay * 0.25),
                    use_proxy=bool(args.scan_proxy and proxy_urls),
                    proxy_urls=proxy_urls,
                    on_page=on_page,
                )
            else:
                cards, total = enumerate_search(
                    session,
                    category=args.category or None,
                    apps=args.apps or None,
                    nodes=args.nodes or None,
                    search=args.search or None,
                    limit=args.limit or 0,
                    rows=args.scan_rows,
                    on_page=on_page,
                )
            state.total_reported = total
            for c in cards:
                cards_by_id[int(c["id"])] = c
            targets = [int(c["id"]) for c in cards]
            state.discovered_ids = sorted(targets)
            state.save()
            miss = (total or 0) - len(targets) if total else 0
            print(
                f"Discovered {len(targets)} (API total={total}"
                f"{f', missing≈{miss}' if miss else ', complete'})",
                file=sys.stderr,
            )

        random.shuffle(targets)
        if args.limit and args.limit > 0 and only_ids is None:
            # already limited in enumerate if set; still cap for id lists
            pass
        if args.limit and args.limit > 0 and only_ids is not None:
            targets = targets[: args.limit]

        completed = set(state.completed_ids)
        print(
            f"Downloading {len(targets)} workflows "
            f"(resume={'off' if args.no_resume else 'on'}, html={args.html})…",
            file=sys.stderr,
        )

        ok = skipped = failed = 0
        for idx, wid in enumerate(targets, start=1):
            if not args.no_resume and is_complete(out_dir, wid, args.html):
                skipped += 1
                completed.add(wid)
                state.completed_ids = sorted(completed)
                print(f"[{idx}/{len(targets)}] skip {wid} (exists)", file=sys.stderr)
                continue
            print(f"[{idx}/{len(targets)}] fetch {wid}…", file=sys.stderr)
            try:
                row = fetch_one(
                    session,
                    workflow_id=wid,
                    card=cards_by_id.get(wid),
                    out_dir=out_dir,
                    want_html=args.html,
                )
                append_catalog(catalog_path, row)
                completed.add(wid)
                state.completed_ids = sorted(completed)
                state.failed.pop(str(wid), None)
                state.last_run = utc_now_iso()
                state.save()
                ok += 1
                print(f"  ✓ {row.get('name', wid)}", file=sys.stderr)
            except Exception as e:
                failed += 1
                state.failed[str(wid)] = str(e)
                state.last_run = utc_now_iso()
                state.save()
                append_catalog(
                    catalog_path,
                    {
                        "id": wid,
                        "status": "error",
                        "error": str(e),
                        "scrapedAt": utc_now_iso(),
                    },
                )
                print(f"  ✗ {wid}: {e}", file=sys.stderr)

        state.last_run = utc_now_iso()
        state.save()
        summary = {
            "ok": ok,
            "skipped": skipped,
            "failed": failed,
            "targets": len(targets),
            "completed_total": len(state.completed_ids),
            "discovered_total": len(state.discovered_ids),
            "out": str(out_dir),
            "finishedAt": utc_now_iso(),
        }
        atomic_write_json(out_dir / "summary.json", summary)
        print(json.dumps(summary, indent=2))
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
