#!/usr/bin/env python3
"""Resolve factory models: env > job override > global > catalog > defaults."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
JOBS = ROOT / "scripts" / "factory" / ".jobs"
CATALOG = ROOT / "docs" / "specs" / "catalog.json"
GLOBAL_MODELS = JOBS / "models.json"
SETTINGS = JOBS / "settings.json"

DEFAULT_MODELS = {
    "spec": "xai/grok-4.5",
    "implement": "featherless/zai-org/GLM-5.2",
    "validate": "xai/grok-4.5",
}

DEFAULT_SETTINGS = {
    "concurrency": 2,
    "maxCycles": 3,
    "implLock": True,
}

ROLE_KEYS = ("spec", "implement", "validate")


def safe_type(type_name: str) -> str:
    return type_name.replace("/", "_")


def job_models_path(type_name: str) -> Path:
    return JOBS / "nodes" / safe_type(type_name) / "models.json"


def load_global_models() -> dict[str, str]:
    m = dict(DEFAULT_MODELS)
    if CATALOG.exists():
        try:
            m.update((json.loads(CATALOG.read_text()).get("factory") or {}).get("models") or {})
        except Exception:
            pass
    if GLOBAL_MODELS.exists():
        try:
            m.update(json.loads(GLOBAL_MODELS.read_text()))
        except Exception:
            pass
    return m


def load_job_overrides(type_name: str) -> dict[str, str]:
    p = job_models_path(type_name)
    if not p.is_file():
        return {}
    try:
        data = json.loads(p.read_text())
        return {k: str(v) for k, v in data.items() if k in ROLE_KEYS and v}
    except Exception:
        return {}


def save_job_overrides(type_name: str, overrides: dict[str, str]) -> Path:
    p = job_models_path(type_name)
    p.parent.mkdir(parents=True, exist_ok=True)
    clean = {k: overrides[k] for k in ROLE_KEYS if overrides.get(k)}
    if not clean:
        if p.exists():
            p.unlink()
        return p
    p.write_text(json.dumps(clean, indent=2) + "\n")
    return p


def clear_job_overrides(type_name: str) -> None:
    p = job_models_path(type_name)
    if p.exists():
        p.unlink()


def resolve_models(type_name: str | None = None, *, apply_env: bool = True) -> dict[str, str]:
    """
    Priority:
      1. process env FACTORY_MODEL_* (if apply_env)
      2. per-job models.json
      3. global models.json + catalog
      4. defaults
    """
    m = load_global_models()
    if type_name:
        m.update(load_job_overrides(type_name))
    if apply_env:
        for ek, k in (
            ("FACTORY_MODEL_SPEC", "spec"),
            ("FACTORY_MODEL_IMPL", "implement"),
            ("FACTORY_MODEL_VAL", "validate"),
        ):
            if os.environ.get(ek):
                m[k] = os.environ[ek]
    return {k: m.get(k, DEFAULT_MODELS[k]) for k in ROLE_KEYS}


def load_settings() -> dict:
    s = dict(DEFAULT_SETTINGS)
    if CATALOG.exists():
        try:
            fac = (json.loads(CATALOG.read_text()).get("factory") or {})
            if "concurrency" in fac:
                s["concurrency"] = int(fac["concurrency"])
            if "maxCycles" in fac:
                s["maxCycles"] = int(fac["maxCycles"])
        except Exception:
            pass
    if SETTINGS.exists():
        try:
            raw = json.loads(SETTINGS.read_text())
            if "concurrency" in raw:
                s["concurrency"] = max(1, min(8, int(raw["concurrency"])))
            if "maxCycles" in raw:
                s["maxCycles"] = max(1, min(5, int(raw["maxCycles"])))
            if "implLock" in raw:
                s["implLock"] = bool(raw["implLock"])
        except Exception:
            pass
    if os.environ.get("FACTORY_CONCURRENCY"):
        try:
            s["concurrency"] = max(1, min(8, int(os.environ["FACTORY_CONCURRENCY"])))
        except ValueError:
            pass
    if os.environ.get("FACTORY_MAX_CYCLES"):
        try:
            s["maxCycles"] = max(1, min(5, int(os.environ["FACTORY_MAX_CYCLES"])))
        except ValueError:
            pass
    return s


def save_settings(settings: dict) -> None:
    JOBS.mkdir(parents=True, exist_ok=True)
    payload = {
        "concurrency": max(1, min(8, int(settings.get("concurrency", 2)))),
        "maxCycles": max(1, min(5, int(settings.get("maxCycles", 3)))),
        "implLock": bool(settings.get("implLock", True)),
    }
    SETTINGS.write_text(json.dumps(payload, indent=2) + "\n")


def export_shell(type_name: str | None = None) -> None:
    """Print bash export lines for models + settings."""
    m = resolve_models(type_name, apply_env=True)
    s = load_settings()
    print(f'export FACTORY_MODEL_SPEC={json.dumps(m["spec"])}')
    print(f'export FACTORY_MODEL_IMPL={json.dumps(m["implement"])}')
    print(f'export FACTORY_MODEL_VAL={json.dumps(m["validate"])}')
    print(f'export FACTORY_MAX_CYCLES={json.dumps(str(s["maxCycles"]))}')
    print(f'export FACTORY_CONCURRENCY={json.dumps(str(s["concurrency"]))}')
    print(f'export FACTORY_IMPL_LOCK={"1" if s["implLock"] else "0"}')


def main() -> None:
    p = argparse.ArgumentParser(description="Resolve factory models/settings")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("resolve")
    r.add_argument("--type", default=None)
    r.add_argument("--shell", action="store_true")

    g = sub.add_parser("get-job")
    g.add_argument("--type", required=True)

    sj = sub.add_parser("set-job")
    sj.add_argument("--type", required=True)
    sj.add_argument("--spec")
    sj.add_argument("--implement")
    sj.add_argument("--validate")

    cj = sub.add_parser("clear-job")
    cj.add_argument("--type", required=True)

    sub.add_parser("settings-get")
    ss = sub.add_parser("settings-set")
    ss.add_argument("--concurrency", type=int)
    ss.add_argument("--max-cycles", type=int)
    ss.add_argument("--impl-lock", choices=["on", "off", "true", "false", "1", "0"])

    args = p.parse_args()

    if args.cmd == "resolve":
        if args.shell:
            export_shell(args.type)
        else:
            print(json.dumps(resolve_models(args.type), indent=2))
    elif args.cmd == "get-job":
        print(json.dumps(load_job_overrides(args.type), indent=2))
    elif args.cmd == "set-job":
        cur = load_job_overrides(args.type)
        if args.spec:
            cur["spec"] = args.spec
        if args.implement:
            cur["implement"] = args.implement
        if args.validate:
            cur["validate"] = args.validate
        path = save_job_overrides(args.type, cur)
        print(json.dumps({"path": str(path), "models": cur}, indent=2))
    elif args.cmd == "clear-job":
        clear_job_overrides(args.type)
        print("cleared")
    elif args.cmd == "settings-get":
        print(json.dumps(load_settings(), indent=2))
    elif args.cmd == "settings-set":
        s = load_settings()
        if args.concurrency is not None:
            s["concurrency"] = args.concurrency
        if args.max_cycles is not None:
            s["maxCycles"] = args.max_cycles
        if args.impl_lock is not None:
            s["implLock"] = args.impl_lock in ("on", "true", "1")
        save_settings(s)
        print(json.dumps(s, indent=2))


if __name__ == "__main__":
    main()
