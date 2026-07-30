#!/usr/bin/env python3
"""Fill factory prompt templates."""
from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROMPTS = ROOT / "scripts" / "factory" / "prompts"


def assemble(
    template_name: str,
    *,
    type_name: str,
    batch: str,
    cycle: int,
    max_cycles: int,
    fix_hints: str,
    gate_log: str = "",
) -> str:
    path = PROMPTS / template_name
    text = path.read_text(encoding="utf-8")
    replacements = {
        "{{TYPE}}": type_name,
        "{{BATCH}}": batch,
        "{{CYCLE}}": str(cycle),
        "{{MAX_CYCLES}}": str(max_cycles),
        "{{FIX_HINTS}}": fix_hints.strip() or "(none)",
        "{{GATE_LOG}}": gate_log.strip() or "(no gate log)",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("template", choices=["01-spec-node.md", "02-implement-node.md", "03-validate-node.md"])
    p.add_argument("--type", required=True)
    p.add_argument("--batch", required=True)
    p.add_argument("--cycle", type=int, default=1)
    p.add_argument("--max-cycles", type=int, default=3)
    p.add_argument("--fix-hints", default="")
    p.add_argument("--gate-log-file", default="")
    p.add_argument("-o", "--output", required=True)
    args = p.parse_args()

    gate = ""
    if args.gate_log_file:
        gate = Path(args.gate_log_file).read_text(encoding="utf-8", errors="replace")

    out = assemble(
        args.template,
        type_name=args.type,
        batch=args.batch,
        cycle=args.cycle,
        max_cycles=args.max_cycles,
        fix_hints=args.fix_hints,
        gate_log=gate,
    )
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out, encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
