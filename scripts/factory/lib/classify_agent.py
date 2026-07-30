#!/usr/bin/env python3
"""Classify OpenCode agent outcome from exit code + log text."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# (pattern, reason_code, class)  class: retryable | hard_fail
PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"\b429\b|rate[\s_-]?limit|too many requests|quota", re.I), "rate_limit", "retryable"),
    (re.compile(r"\b502\b|\b503\b|\b504\b|bad gateway|service unavailable|overloaded", re.I), "provider_error", "retryable"),
    (re.compile(r"TIMEOUT after|timed out|deadline exceeded", re.I), "timeout", "retryable"),
    (re.compile(r"ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network error", re.I), "network_error", "retryable"),
    (re.compile(r"unauthorized|invalid api key|auth(?:entication)? failed|401\b|403\b", re.I), "auth_error", "hard_fail"),
    (re.compile(r"model not found|unknown model|does not exist", re.I), "bad_model", "hard_fail"),
    (re.compile(r"opencode not found", re.I), "opencode_missing", "hard_fail"),
]


def classify(log_text: str, exit_code: int) -> dict:
    text = re.sub(r"\x1b\[[0-9;]*m", "", log_text or "")
    # empty / nearly empty log with non-zero exit
    stripped = text.strip()
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
        if pat.search(text):
            return {
                "ok": False,
                "class": cls,
                "reason": reason,
                "message": f"agent log matched {reason}",
            }

    # No tool activity and tiny log → likely failed before work
    toolish = bool(re.search(r"(→|✱|Read |Write |Edit |Grep |Skill )", text))
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
        # shell-friendly
        print(f"ok={'1' if result['ok'] else '0'}")
        print(f"class={result['class']}")
        print(f"reason={result['reason']}")
        print(f"message={result['message']}")
    # Always exit 0 when --json so callers can capture stdout under set -e
    if args.json:
        sys.exit(0)
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
