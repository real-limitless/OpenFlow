#!/usr/bin/env python3
"""Fill factory prompt templates."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROMPTS = ROOT / "scripts" / "factory" / "prompts"
LIB = Path(__file__).resolve().parent


def assemble(
    template_name: str,
    *,
    type_name: str,
    batch: str,
    cycle: int,
    max_cycles: int,
    fix_hints: str,
    gate_log: str = "",
    failure_history: str = "",
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
        "{{FAILURE_HISTORY}}": failure_history.strip() or "(no prior failures recorded)",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text


def _load_history(job_dir: str, type_name: str) -> str:
    try:
        sys.path.insert(0, str(LIB))
        from failure_history import job_dir_for, render

        jd = job_dir_for(type_name or None, job_dir or None)
        return render(jd, last=5)
    except Exception:
        return "(no prior failures recorded)"


def _load_hints(job_dir: str, type_name: str, explicit: str) -> str:
    if explicit.strip():
        return explicit
    try:
        sys.path.insert(0, str(LIB))
        from failure_history import job_dir_for, latest_fix_hints

        jd = job_dir_for(type_name or None, job_dir or None)
        return latest_fix_hints(jd) or ""
    except Exception:
        return ""


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("template", choices=["01-spec-node.md", "02-implement-node.md", "03-validate-node.md"])
    p.add_argument("--type", required=True)
    p.add_argument("--batch", required=True)
    p.add_argument("--cycle", type=int, default=1)
    p.add_argument("--max-cycles", type=int, default=3)
    p.add_argument("--fix-hints", default="")
    p.add_argument("--gate-log-file", default="")
    p.add_argument("--job-dir", default="")
    p.add_argument("-o", "--output", required=True)
    args = p.parse_args()

    gate = ""
    if args.gate_log_file:
        gp = Path(args.gate_log_file)
        if gp.exists():
            gate = gp.read_text(encoding="utf-8", errors="replace")

    fix_hints = _load_hints(args.job_dir, args.type, args.fix_hints)
    history = _load_history(args.job_dir, args.type)

    out = assemble(
        args.template,
        type_name=args.type,
        batch=args.batch,
        cycle=args.cycle,
        max_cycles=args.max_cycles,
        fix_hints=fix_hints,
        gate_log=gate,
        failure_history=history,
    )
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out, encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
