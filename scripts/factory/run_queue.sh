#!/usr/bin/env bash
# Factory queue control: start | resume | stop | status
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
JOBS="$ROOT/scripts/factory/.jobs"
STATE="$JOBS/run-state.json"
PIDFILE="$JOBS/factory.pid"
WORKER="$ROOT/scripts/factory/lib/queue_worker.sh"
mkdir -p "$JOBS"

CMD="${1:-status}"
if [[ $# -gt 0 ]]; then shift; fi
# Prefer settings.json, then env, then 2
CONCURRENCY="${FACTORY_CONCURRENCY:-}"
export FACTORY_DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --dry-run) export FACTORY_DRY_RUN=1; shift ;;
    *) shift ;;
  esac
done

if [[ -z "$CONCURRENCY" ]]; then
  CONCURRENCY=$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" settings-get 2>/dev/null \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('concurrency',2))" 2>/dev/null || echo 2)
fi
# export settings into env for worker
eval "$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --shell 2>/dev/null || true)"
export FACTORY_CONCURRENCY="$CONCURRENCY"

stop_factory() {
  set +e
  local pgid="" pid="" run_id="" leftover=0
  if [[ -f "$STATE" ]]; then
    pgid=$(python3 -c "import json;d=json.load(open('$STATE'));print(d.get('pgid') or '')" 2>/dev/null || true)
    pid=$(python3 -c "import json;d=json.load(open('$STATE'));print(d.get('pid') or '')" 2>/dev/null || true)
    run_id=$(python3 -c "import json;d=json.load(open('$STATE'));print(d.get('runId') or '')" 2>/dev/null || true)
  fi
  if [[ -f "$PIDFILE" ]]; then
    pid="${pid:-$(cat "$PIDFILE" 2>/dev/null || true)}"
  fi

  echo "Factory Stop: pid=${pid:-?} pgid=${pgid:-?} runId=${run_id:-?}"
  echo "Factory Stop: SAFE mode — no session/process-group wipe"

  # 1. Mark stopped first so queue won't accept new work if anything races
  python3 "$ROOT/scripts/factory/lib/run_state.py" set-status stopped >/dev/null 2>&1 || true

  # 2. Kill worker ONLY if cmdline is queue_worker (never blind -$pgid)
  echo "Factory Stop: safe_kill worker…"
  FACTORY_JOBS="$JOBS" python3 "$ROOT/scripts/factory/lib/safe_kill.py" worker \
    ${pid:+--pid "$pid"} ${pgid:+--pgid "$pgid"} 2>&1 | tee -a "$JOBS/factory.log" || true

  # 3. Kill ALL per-node pipelines + opencode agents via allowlisted /proc + pidfiles
  echo "Factory Stop: safe kill-all node agents…"
  bash "$ROOT/scripts/factory/lib/node_ctl.sh" kill-all 2>&1 | tee -a "$JOBS/factory.log" || true

  # 4. Final allowlisted sweep (no killpg)
  echo "Factory Stop: safe factory-agents sweep…"
  FACTORY_JOBS="$JOBS" python3 "$ROOT/scripts/factory/lib/safe_kill.py" factory-agents 2>&1 \
    | tee -a "$JOBS/factory.log" || true

  rm -f "$JOBS/impl.lock" "$JOBS/impl.lock.holder" "$PIDFILE" 2>/dev/null || true

  if [[ -n "${run_id:-}" ]]; then
    case "$run_id" in
      run-*)
        rm -rf "/tmp/openflow-factory-${run_id}" "/var/tmp/openflow-factory-${run_id}" 2>/dev/null || true
        ;;
    esac
  fi

  # 5. Verify no leftovers
  leftover=$(python3 - <<'PY' 2>/dev/null || echo 0
import os
needles = ("run_node_pipeline.sh --type ", "factory SPEC ", "factory IMPL ", "factory VAL ", "queue_worker.sh")
n = 0
for name in os.listdir("/proc"):
    if not name.isdigit():
        continue
    try:
        cmd = open(f"/proc/{name}/cmdline", "rb").read().replace(b"\x00", b" ").decode("utf-8", "replace")
    except Exception:
        continue
    if any(x in cmd for x in needles):
        n += 1
print(n)
PY
)

  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" >/dev/null 2>&1 || true
  set -e
  echo "Factory stopped. leftover_agents=${leftover:-?} Tmp corpus wiped. Checkpoint under scripts/factory/.jobs/nodes/"
  if [[ "${leftover:-0}" != "0" ]]; then
    echo "WARNING: ${leftover} factory-related process(es) still visible — check: ps aux | grep factory" >&2
    return 1
  fi
  return 0
}

start_or_resume() {
  local mode="$1"
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Factory already running pid=$(cat "$PIDFILE")"
    [[ "$mode" == "resume" ]] && exit 0
    exit 1
  fi

  local args=(--concurrency "$CONCURRENCY")
  [[ "$mode" == "resume" ]] && args+=(--resume)
  # push max cycles from settings
  eval "$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --shell 2>/dev/null || true)"
  python3 "$ROOT/scripts/factory/lib/run_state.py" init-run "${args[@]}"

  chmod +x "$WORKER" \
    "$ROOT/scripts/factory/lib/run_node_pipeline.sh" \
    "$ROOT/scripts/factory/lib/fetch_spec_corpus.sh" \
    "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" \
    "$ROOT/scripts/factory/lib/validate_node.sh" 2>/dev/null || true

  # Always background (incl. dry-run) so TUI/CLI return immediately
  if [[ "${FACTORY_DRY_RUN}" == "1" ]]; then
    echo "Dry-run worker (background)…"
    FACTORY_DRY_RUN=1 setsid bash "$WORKER" >>"$JOBS/factory.log" 2>&1 &
  else
    # New session so Factory Stop can kill the whole group
    setsid bash "$WORKER" >>"$JOBS/factory.log" 2>&1 &
  fi
  sleep 0.5
  echo "Factory $mode — pid=$(cat "$PIDFILE" 2>/dev/null || echo '?') log=$JOBS/factory.log"
  bash "$0" status
}

case "$CMD" in
  start) start_or_resume start ;;
  resume) start_or_resume resume ;;
  stop) stop_factory ;;
  status)
    python3 - <<'PY' 2>/dev/null || echo '{"status":"idle"}'
import json
from pathlib import Path
p = Path("scripts/factory/.jobs/run-state.json")
if not p.exists():
    print(json.dumps({"status": "idle"}))
else:
    d = json.loads(p.read_text())
    print(json.dumps({
        "runId": d.get("runId"),
        "status": d.get("status"),
        "pid": d.get("pid"),
        "pgid": d.get("pgid"),
        "models": d.get("models"),
        "concurrency": d.get("concurrency"),
        "pending": len(d.get("pending") or []),
        "active": len(d.get("active") or []),
        "completed": len(d.get("completed") or []),
        "partial": len(d.get("partial") or []),
        "failed": len(d.get("failed") or []),
        "activeTypes": (d.get("active") or [])[:8],
        "updatedAt": d.get("updatedAt"),
    }, indent=2))
PY
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "process: alive pid=$(cat "$PIDFILE")"
    else
      echo "process: not running"
    fi
    ;;
  *)
    echo "Usage: $0 {start|resume|stop|status} [--concurrency N] [--dry-run]" >&2
    exit 2
    ;;
esac
