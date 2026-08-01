#!/usr/bin/env python3
"""Catalog helpers for the OpenFlow node factory."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CATALOG = ROOT / "docs" / "specs" / "catalog.json"


def load() -> dict:
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def save(data: dict) -> None:
    CATALOG.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


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
    data = load()
    nodes = data.setdefault("nodes", {})
    entry = nodes.setdefault(type_name, {})
    entry.update({k: v for k, v in fields.items() if v is not None})
    nodes[type_name] = entry
    save(data)


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
