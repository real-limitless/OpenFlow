#!/usr/bin/env python3
"""Catalog helpers for the OpenFlow node factory."""
from __future__ import annotations

import argparse
import contextlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_state import _atomic_write, _file_lock  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CATALOG = ROOT / "docs" / "specs" / "catalog.json"
# Sidecar lives under .jobs (gitignored) so the lock never lands in the repo.
CATALOG_LOCK = ROOT / "scripts" / "factory" / ".jobs" / "catalog.lock"


def load() -> dict:
    with _file_lock(CATALOG_LOCK, shared=True):
        return json.loads(CATALOG.read_text(encoding="utf-8"))


def save(data: dict) -> None:
    with _file_lock(CATALOG_LOCK):
        _atomic_write(CATALOG, json.dumps(data, indent=2) + "\n")


@contextlib.contextmanager
def catalog_transaction():
    """Hold the lock across a read-modify-write of catalog.json.

    Concurrent pipelines both call set-status here. Note this only serialises
    catalog.py against itself -- IMPLEMENT agents are told to edit catalog.json
    directly (prompts/02-implement-node.md step 5) and take no lock, so that
    race is narrowed, not closed.
    """
    with _file_lock(CATALOG_LOCK):
        data = json.loads(CATALOG.read_text(encoding="utf-8"))
        yield data
        _atomic_write(CATALOG, json.dumps(data, indent=2) + "\n")


def get_batch(batch_id: str) -> dict:
    data = load()
    batches = data.get("batches") or {}
    if batch_id not in batches:
        raise SystemExit(f"Unknown batch {batch_id!r}. Known: {', '.join(sorted(batches))}")
    b = batches[batch_id]
    types = list(b.get("types") or [])
    if len(types) > 5:
        types = types[:5]
    return {
        "id": batch_id,
        "slug": b.get("slug") or f"batch-{batch_id}",
        "types": types,
        "factory": data.get("factory") or {},
    }


def set_node_status(type_name: str, **fields: str) -> None:
    with catalog_transaction() as data:
        nodes = data.setdefault("nodes", {})
        entry = nodes.setdefault(type_name, {})
        entry.update({k: v for k, v in fields.items() if v is not None})
        nodes[type_name] = entry


def dedupe_queue(data: dict | None = None) -> tuple[dict, list[str]]:
    """Keep first occurrence of each type in catalog.queue. Returns (data, removed)."""
    data = data if data is not None else load()
    queue = data.get("queue") or []
    if not isinstance(queue, list):
        return data, []
    seen: set[str] = set()
    out: list = []
    removed: list[str] = []
    for item in queue:
        t = item.get("type") if isinstance(item, dict) else str(item)
        if not t or t in seen:
            if t:
                removed.append(str(t))
            continue
        seen.add(str(t))
        out.append(item)
    data["queue"] = out
    return data, removed


def main() -> None:
    p = argparse.ArgumentParser(description="OpenFlow factory catalog CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("get-batch")
    g.add_argument("batch")

    s = sub.add_parser("set-status")
    s.add_argument("type")
    s.add_argument("--executor")
    s.add_argument("--spec")
    s.add_argument("--factory")

    sub.add_parser("dedupe-queue", help="Remove duplicate types from catalog.queue (keep first)")

    args = p.parse_args()
    if args.cmd == "get-batch":
        print(json.dumps(get_batch(args.batch), indent=2))
    elif args.cmd == "set-status":
        set_node_status(
            args.type,
            executor=args.executor,
            spec=args.spec,
            factory=args.factory,
        )
        print("ok")
    elif args.cmd == "dedupe-queue":
        data, removed = dedupe_queue()
        if removed:
            from datetime import date

            data["updated"] = date.today().isoformat()
            save(data)
        print(json.dumps({"removed": removed, "queueLen": len(data.get("queue") or [])}, indent=2))


if __name__ == "__main__":
    main()
