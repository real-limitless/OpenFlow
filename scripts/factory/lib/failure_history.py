#!/usr/bin/env python3
"""Per-node factory failure ledger: record, render, archive cycles, clear."""
from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
JOBS = ROOT / "scripts" / "factory" / ".jobs"
NODES = JOBS / "nodes"

MAX_EXCERPT_LINES = 40
MAX_HISTORY_CHARS = 3500
MAX_RENDER_ENTRIES = 5


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(type_name: str) -> str:
    return type_name.replace("/", "_")


def job_dir_for(type_name: str | None = None, job_dir: str | None = None) -> Path:
    if job_dir:
        return Path(job_dir)
    if not type_name:
        raise SystemExit("need --type or --job-dir")
    return NODES / safe_name(type_name)


def ledger_path(jd: Path) -> Path:
    return jd / "failures.jsonl"


def fix_hints_path(jd: Path) -> Path:
    return jd / "fix_hints.txt"


def status_path(jd: Path) -> Path:
    return jd / "status.json"


def load_status(jd: Path) -> dict:
    p = status_path(jd)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_status(jd: Path, data: dict) -> None:
    jd.mkdir(parents=True, exist_ok=True)
    data["updatedAt"] = now()
    status_path(jd).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def read_ledger(jd: Path) -> list[dict]:
    p = ledger_path(jd)
    if not p.exists():
        return []
    out: list[dict] = []
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def extract_gate_excerpt(gate_log: str | Path | None, max_lines: int = MAX_EXCERPT_LINES) -> str:
    if not gate_log:
        return ""
    text = ""
    if isinstance(gate_log, Path) or (isinstance(gate_log, str) and Path(gate_log).is_file()):
        try:
            text = Path(gate_log).read_text(encoding="utf-8", errors="replace")
        except Exception:
            text = str(gate_log)
    else:
        text = str(gate_log)
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    lines = text.splitlines()
    keep: list[str] = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if re.search(
            r"^(FAIL|REASON|PRIMARY|CLASS|GATE_|OK\s|===|missing |not in |no executor|"
            r"impl_|spec_|agent:|summary )",
            s,
            re.I,
        ) or re.search(r"\bFAIL\b|\bERROR\b|gate failed|PRIMARY ", s, re.I):
            keep.append(s[:240])
    if not keep:
        # fall back to last non-empty lines
        keep = [ln.strip()[:240] for ln in lines if ln.strip()][-min(15, max_lines) :]
    return "\n".join(keep[:max_lines])


def parse_reasons_from_gate(excerpt: str) -> list[str]:
    reasons: list[str] = []
    for ln in excerpt.splitlines():
        m = re.match(r"^REASON\s+(.+)$", ln.strip(), re.I)
        if m:
            reasons.append(m.group(1).strip())
            continue
        m = re.match(r"^FAIL\s+(.+)$", ln.strip(), re.I)
        if m:
            reasons.append(m.group(1).strip())
    return reasons


def parse_primary_from_gate(excerpt: str, fallback: str = "") -> str:
    for ln in excerpt.splitlines():
        m = re.match(r"^PRIMARY\s+(\S+)", ln.strip(), re.I)
        if m:
            return m.group(1).strip()
    if fallback:
        return fallback
    reasons = parse_reasons_from_gate(excerpt)
    if reasons:
        return reasons[0].split(":")[0].strip()
    return "unknown"


def build_actionable_hints(
    *,
    stage: str,
    cycle: int,
    primary: str,
    reasons: list[str],
    excerpt: str,
    prior: list[dict],
    extra_hints: list[str] | None = None,
) -> str:
    lines: list[str] = [
        f"[cycle {cycle} / {stage}] PRIMARY={primary or 'unknown'}",
    ]
    for r in reasons[:12]:
        lines.append(f"- {r}")
    if not reasons and excerpt:
        for ln in excerpt.splitlines()[:12]:
            if ln.upper().startswith("FAIL") or ln.upper().startswith("REASON"):
                lines.append(f"- {ln}")
    for h in extra_hints or []:
        h = str(h).strip()
        if h and h not in lines:
            lines.append(f"- {h}")

    # Escalation when same primary repeats
    same = [e for e in prior if (e.get("primary") or "") == primary and primary]
    if len(same) >= 1 and primary and primary not in ("unknown", "ok"):
        lines.append(
            f"ESCALATION: PRIMARY={primary} already failed {len(same)} prior time(s) "
            f"— fix ONLY this miss first; do not restart unrelated work."
        )
        # stage-specific nudges
        nudges = {
            "impl_not_in_runtime": "Append one {type, modulePath, exportName} entry to BUILTIN_EXECUTOR_MODULES in src/lib/engine/node-runtime.ts. That is the only registration step.",
            "impl_edited_barrel": "Revert your edit to src/lib/engine/executors/index.ts — it is a generic barrel that globs BUILTIN_EXECUTOR_MODULES and must never name a node type.",
            "impl_edited_registry": "Revert your edit to src/lib/nodes/registry.ts — descriptions seed automatically from src/lib/nodes/definitions/; export your const there instead.",
            "impl_no_executor": "Create executor under src/lib/engine/executors/ and wire type string.",
            "spec_missing": "Write docs/specs/nodes/<type>.md before implement.",
            "spec_thin": "Expand spec: parameters, runtime behavior, acceptance fixtures.",
            "validate_gates": "Re-read gate FAIL lines above; satisfy every FAIL before re-validating.",
            "rate_limit": "Provider rate-limited — retry same stage; no code thrash.",
            "timeout": "Agent timed out — finish smaller scope; avoid full-repo reads.",
            "agent": "Agent error/empty output — re-run stage; check model availability.",
        }
        for key, tip in nudges.items():
            if key in (primary or "") or (primary or "").startswith(key):
                lines.append(f"HINT: {tip}")
                break

    return "\n".join(lines).strip() + "\n"


def record(
    jd: Path,
    *,
    type_name: str,
    stage: str,
    cycle: int,
    primary: str = "",
    reasons: list[str] | None = None,
    gate_log: str | Path | None = None,
    hints: list[str] | str | None = None,
    model: str = "",
    detail: str = "",
) -> dict:
    jd.mkdir(parents=True, exist_ok=True)
    prior = read_ledger(jd)
    st = load_status(jd)
    attempt = int(st.get("attempt") or 1)
    excerpt = extract_gate_excerpt(gate_log)
    reasons = list(reasons or [])
    if not reasons:
        reasons = parse_reasons_from_gate(excerpt)
    primary = (primary or "").strip() or parse_primary_from_gate(excerpt, "unknown")

    extra: list[str] = []
    if isinstance(hints, str) and hints.strip():
        extra = [ln.strip() for ln in hints.splitlines() if ln.strip()]
    elif isinstance(hints, list):
        extra = [str(h).strip() for h in hints if str(h).strip()]

    # Drop useless generic lines from extra
    junk = re.compile(r"see gate\.log|deterministic gates failed before val|no json verdict", re.I)
    extra = [e for e in extra if not junk.search(e)]

    brief = build_actionable_hints(
        stage=stage,
        cycle=cycle,
        primary=primary,
        reasons=reasons,
        excerpt=excerpt,
        prior=prior,
        extra_hints=extra,
    )
    entry = {
        "ts": now(),
        "type": type_name,
        "attempt": attempt,
        "cycle": int(cycle or 0),
        "stage": stage,
        "primary": primary,
        "reasons": reasons[:20],
        "gateExcerpt": excerpt[:4000],
        "fixHints": [ln.lstrip("- ").strip() for ln in brief.splitlines() if ln.startswith("- ")][:20],
        "model": model or None,
        "detail": (detail or "")[:500] or None,
    }
    with ledger_path(jd).open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    fix_hints_path(jd).write_text(brief, encoding="utf-8")
    st = load_status(jd)
    st["lastFailure"] = {
        "ts": entry["ts"],
        "attempt": attempt,
        "cycle": entry["cycle"],
        "stage": stage,
        "primary": primary,
        "failCount": len(prior) + 1,
    }
    st["failCount"] = len(prior) + 1
    save_status(jd, st)
    return entry


def render(jd: Path, *, last: int = MAX_RENDER_ENTRIES, max_chars: int = MAX_HISTORY_CHARS) -> str:
    entries = read_ledger(jd)
    if not entries:
        return "(no prior failures recorded)"
    take = entries[-max(1, last) :]
    blocks: list[str] = []
    # summary of repeated primaries
    from collections import Counter

    counts = Counter((e.get("primary") or "unknown") for e in entries)
    top = ", ".join(f"{k}×{v}" for k, v in counts.most_common(5))
    blocks.append(f"Ledger: {len(entries)} failure(s). Frequent: {top}")
    for e in take:
        head = (
            f"### attempt {e.get('attempt', '?')} cycle {e.get('cycle', '?')} "
            f"/ {e.get('stage', '?')} — PRIMARY={e.get('primary') or 'unknown'}"
        )
        parts = [head]
        if e.get("model"):
            parts.append(f"model: {e['model']}")
        reasons = e.get("reasons") or []
        if reasons:
            parts.append("reasons:")
            parts.extend(f"  - {r}" for r in reasons[:8])
        hints = e.get("fixHints") or []
        if hints:
            parts.append("hints:")
            parts.extend(f"  - {h}" for h in hints[:8])
        excerpt = (e.get("gateExcerpt") or "").strip()
        if excerpt and not reasons:
            parts.append("gate:")
            parts.extend(f"  {ln}" for ln in excerpt.splitlines()[:10])
        blocks.append("\n".join(parts))
    text = "\n\n".join(blocks)
    if len(text) > max_chars:
        text = text[-max_chars:]
        text = "…(truncated)\n" + text
    return text


def latest_fix_hints(jd: Path) -> str:
    p = fix_hints_path(jd)
    if p.exists():
        t = p.read_text(encoding="utf-8", errors="replace").strip()
        if t:
            return t
    entries = read_ledger(jd)
    if not entries:
        return ""
    e = entries[-1]
    bits = [f"[cycle {e.get('cycle')} / {e.get('stage')}] PRIMARY={e.get('primary')}"]
    for r in e.get("reasons") or []:
        bits.append(f"- {r}")
    for h in e.get("fixHints") or []:
        bits.append(f"- {h}")
    return "\n".join(bits)


def archive_cycles(jd: Path) -> dict:
    """Move cycle-* into archive/attempt-K/; bump attempt; keep failures.jsonl."""
    jd.mkdir(parents=True, exist_ok=True)
    st = load_status(jd)
    attempt = int(st.get("attempt") or 1)
    cycles = sorted(jd.glob("cycle-*"), key=lambda p: p.name)
    archived = []
    if cycles:
        dest_root = jd / "archive" / f"attempt-{attempt}"
        dest_root.mkdir(parents=True, exist_ok=True)
        for c in cycles:
            target = dest_root / c.name
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)
            shutil.move(str(c), str(target))
            archived.append(c.name)
        # also park gate-latest if present
        for name in ("gate-latest.log",):
            g = jd / name
            if g.exists():
                shutil.move(str(g), str(dest_root / name))
    # rewrite fix_hints as summary of ledger for next attempt
    summary = render(jd, last=5)
    if summary and summary != "(no prior failures recorded)":
        header = (
            f"Archived attempt {attempt} ({len(archived)} cycle dir(s)). "
            f"Learn from history below — do not repeat the same PRIMARY failures.\n\n"
        )
        fix_hints_path(jd).write_text(header + summary + "\n", encoding="utf-8")
    st["attempt"] = attempt + 1
    st["cycle"] = 0
    st["stage"] = "queued"
    st["detail"] = f"reset: archived attempt {attempt}, history kept"
    st.pop("verdict", None)
    # keep lastFailure / failCount
    save_status(jd, st)
    return {"archived": archived, "fromAttempt": attempt, "nextAttempt": attempt + 1}


def clear_history(jd: Path, *, wipe_archive: bool = True) -> None:
    ledger_path(jd).unlink(missing_ok=True)
    fix_hints_path(jd).write_text("", encoding="utf-8")
    if wipe_archive:
        arch = jd / "archive"
        if arch.exists():
            shutil.rmtree(arch, ignore_errors=True)
    st = load_status(jd)
    st.pop("lastFailure", None)
    st.pop("failCount", None)
    st["attempt"] = 1
    save_status(jd, st)


def cmd_record(args: argparse.Namespace) -> None:
    jd = job_dir_for(args.type, args.job_dir)
    reasons: list[str] = []
    if args.reasons:
        reasons = [r.strip() for r in args.reasons.split(";") if r.strip()]
    if args.reasons_file:
        rp = Path(args.reasons_file)
        if rp.exists():
            for ln in rp.read_text(encoding="utf-8", errors="replace").splitlines():
                ln = ln.strip()
                if ln.startswith("REASON "):
                    reasons.append(ln[7:].strip())
                elif ln.startswith("FAIL "):
                    reasons.append(ln[5:].strip())
    hints: str | list[str] | None = None
    if args.hints_file:
        hp = Path(args.hints_file)
        if hp.exists():
            hints = hp.read_text(encoding="utf-8", errors="replace")
    elif args.hints:
        hints = args.hints
    entry = record(
        jd,
        type_name=args.type or load_status(jd).get("type") or jd.name,
        stage=args.stage,
        cycle=args.cycle,
        primary=args.primary or "",
        reasons=reasons,
        gate_log=args.gate_log,
        hints=hints,
        model=args.model or "",
        detail=args.detail or "",
    )
    print(json.dumps({"ok": True, "primary": entry["primary"], "cycle": entry["cycle"]}, indent=2))


def cmd_render(args: argparse.Namespace) -> None:
    jd = job_dir_for(args.type, args.job_dir)
    print(render(jd, last=args.last))


def cmd_hints(args: argparse.Namespace) -> None:
    jd = job_dir_for(args.type, args.job_dir)
    print(latest_fix_hints(jd))


def cmd_archive(args: argparse.Namespace) -> None:
    jd = job_dir_for(args.type, args.job_dir)
    print(json.dumps(archive_cycles(jd), indent=2))


def cmd_clear(args: argparse.Namespace) -> None:
    jd = job_dir_for(args.type, args.job_dir)
    clear_history(jd, wipe_archive=not args.keep_archive)
    print(json.dumps({"ok": True, "cleared": str(jd)}))


def cmd_count(args: argparse.Namespace) -> None:
    jd = job_dir_for(args.type, args.job_dir)
    n = len(read_ledger(jd))
    st = load_status(jd)
    last = st.get("lastFailure") or {}
    print(
        json.dumps(
            {
                "failCount": n,
                "attempt": st.get("attempt") or 1,
                "lastPrimary": last.get("primary"),
                "lastStage": last.get("stage"),
            }
        )
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Factory per-node failure history")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_job_args(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--type", default="")
        sp.add_argument("--job-dir", default="")

    rec = sub.add_parser("record")
    add_job_args(rec)
    rec.add_argument("--stage", required=True)
    rec.add_argument("--cycle", type=int, default=1)
    rec.add_argument("--primary", default="")
    rec.add_argument("--reasons", default="", help="semicolon-separated")
    rec.add_argument("--reasons-file", default="")
    rec.add_argument("--gate-log", default="")
    rec.add_argument("--hints", default="")
    rec.add_argument("--hints-file", default="")
    rec.add_argument("--model", default="")
    rec.add_argument("--detail", default="")

    ren = sub.add_parser("render")
    add_job_args(ren)
    ren.add_argument("--last", type=int, default=MAX_RENDER_ENTRIES)

    hi = sub.add_parser("hints")
    add_job_args(hi)

    ar = sub.add_parser("archive-cycles")
    add_job_args(ar)

    cl = sub.add_parser("clear")
    add_job_args(cl)
    cl.add_argument("--keep-archive", action="store_true")

    co = sub.add_parser("count")
    add_job_args(co)

    args = p.parse_args()
    if args.cmd == "record":
        cmd_record(args)
    elif args.cmd == "render":
        cmd_render(args)
    elif args.cmd == "hints":
        cmd_hints(args)
    elif args.cmd == "archive-cycles":
        cmd_archive(args)
    elif args.cmd == "clear":
        cmd_clear(args)
    elif args.cmd == "count":
        cmd_count(args)


if __name__ == "__main__":
    main()
