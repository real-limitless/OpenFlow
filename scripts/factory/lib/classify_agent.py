#!/usr/bin/env python3
"""Classify OpenCode agent outcome from exit code + log text.

Designed to avoid false positives from corpus dumps / docs the agent read
(e.g. file size "502", Discord field "rate_limit_per_user").
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Prefer error-context patterns. class: retryable | hard_fail
# Order matters — first match in the scanned window wins.
PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    (
        re.compile(
            r"(?:rate\s*limit(?:ed|ing)?\s*(?:exceeded|hit|error)?|"
            r"too many requests|quota\s*exceeded|"
            r"\bHTTP\s*429\b|\bstatus(?:\s*code)?\s*[:=]?\s*429\b|\b429\b\s*(?:error|response)?)",
            re.I,
        ),
        "rate_limit",
        "retryable",
    ),
    (
        re.compile(
            r"(?:bad\s*gateway|service\s*unavailable|gateway\s*timeout|overloaded|"
            r"\bHTTP\s*50[234]\b|\bstatus(?:\s*code)?\s*[:=]?\s*50[234]\b|"
            r"(?:error|failed|failure)[^\n]{0,40}\b50[234]\b|"
            r"\b50[234]\b[^\n]{0,40}(?:error|failed|unavailable))",
            re.I,
        ),
        "provider_error",
        "retryable",
    ),
    (
        re.compile(
            r"(?:\[factory\]\s*TIMEOUT after|timed?\s*out|deadline\s*exceeded)",
            re.I,
        ),
        "timeout",
        "retryable",
    ),
    (
        re.compile(
            r"ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network error|ENOTFOUND",
            re.I,
        ),
        "network_error",
        "retryable",
    ),
    (
        re.compile(
            r"(?:unauthorized|invalid api key|auth(?:entication)? failed|"
            r"\bHTTP\s*401\b|\bHTTP\s*403\b|\bstatus(?:\s*code)?\s*[:=]?\s*40[13]\b)",
            re.I,
        ),
        "auth_error",
        "hard_fail",
    ),
    (
        re.compile(r"model not found|unknown model|does not exist", re.I),
        "bad_model",
        "hard_fail",
    ),
    (
        re.compile(r"opencode not found", re.I),
        "opencode_missing",
        "hard_fail",
    ),
]

TOOLISH_RE = re.compile(r"(→|✱|Read |Write |Edit |Grep |Skill |Bash )")
SUCCESS_RE = re.compile(
    r"(?:Done\.|spec written|Spec job .* complete|no changes needed|"
    r"GATE_SPEC_OK|implementation complete|registered)",
    re.I,
)
# Bare numbers that used to false-positive (file sizes, JSON fields)
NOISE_RATE = re.compile(r"rate_limit_per_user|rateLimitPerUser", re.I)


def _strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text or "")


def _tail_window(text: str, max_lines: int = 80, max_chars: int = 12000) -> str:
    """Last N lines (capped), where real agent errors usually appear."""
    lines = text.splitlines()
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    chunk = "\n".join(lines)
    if len(chunk) > max_chars:
        chunk = chunk[-max_chars:]
    return chunk


def _scan_window(text: str) -> str:
    """Build a scan window: tail + any explicit error lines from full log."""
    tail = _tail_window(text)
    # Also pull lines that look like real errors from the full body
    err_lines: list[str] = []
    for ln in text.splitlines():
        if re.search(
            r"(?i)(?:^error\b|\[error\]|status code|http\s*50[234]|http\s*429|"
            r"rate limit(?:ed|ing)?\s*(?:exceeded|hit)|unauthorized|invalid api|"
            r"\[factory\]\s*TIMEOUT)",
            ln,
        ):
            # skip noise field names
            if NOISE_RATE.search(ln) and not re.search(r"(?i)exceeded|429|too many", ln):
                continue
            err_lines.append(ln.strip()[:300])
    if err_lines:
        # last few error-ish lines + tail
        extra = "\n".join(err_lines[-15:])
        return extra + "\n" + tail
    return tail


def classify(log_text: str, exit_code: int) -> dict:
    text = _strip_ansi(log_text or "")
    stripped = text.strip()
    toolish = bool(TOOLISH_RE.search(text))
    window = _scan_window(text)

    if exit_code == 124:
        return {
            "ok": False,
            "class": "retryable",
            "reason": "timeout",
            "message": "agent timed out (exit 124)",
        }
    if exit_code == 127:
        return {
            "ok": False,
            "class": "hard_fail",
            "reason": "opencode_missing",
            "message": "opencode binary missing or not executable",
        }

    for pat, reason, cls in PATTERNS:
        if pat.search(window):
            # Success override: exit 0, real tools, success phrase, and match
            # only appears as historical/noise (not in last 20 lines as hard error)
            if exit_code == 0 and toolish and SUCCESS_RE.search(text):
                last20 = "\n".join(text.splitlines()[-20:])
                # if pattern also in last 20 as a live error, still fail
                if not pat.search(last20) or SUCCESS_RE.search(last20):
                    continue
            return {
                "ok": False,
                "class": cls,
                "reason": reason,
                "message": f"agent log matched {reason}",
            }

    # No tool activity and tiny log → likely failed before work
    if exit_code != 0 and len(stripped) < 80:
        return {
            "ok": False,
            "class": "retryable",
            "reason": "empty_or_short_log",
            "message": f"agent exit {exit_code} with little/no output",
        }
    if exit_code != 0 and not toolish:
        return {
            "ok": False,
            "class": "retryable",
            "reason": "agent_error",
            "message": f"agent exit {exit_code} without tool activity",
        }
    if exit_code != 0:
        return {
            "ok": False,
            "class": "retryable",
            "reason": "agent_nonzero_exit",
            "message": f"agent exit {exit_code}",
        }

    # exit 0 but empty — suspicious
    if len(stripped) < 40 and not toolish:
        return {
            "ok": False,
            "class": "retryable",
            "reason": "empty_success",
            "message": "agent exit 0 but log empty/no tools",
        }

    return {"ok": True, "class": "ok", "reason": "ok", "message": "agent completed"}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--log", required=True)
    p.add_argument("--exit-code", type=int, default=0)
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    path = Path(args.log)
    text = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""
    result = classify(text, args.exit_code)
    if args.json:
        print(json.dumps(result))
    else:
        print(f"ok={'1' if result['ok'] else '0'}")
        print(f"class={result['class']}")
        print(f"reason={result['reason']}")
        print(f"message={result['message']}")
    sys.exit(0 if result["ok"] or args.json else 1)


if __name__ == "__main__":
    main()
