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
  local pgid="" pid="" run_id=""
  if [[ -f "$STATE" ]]; then
    pgid=$(python3 -c "import json;d=json.load(open('$STATE'));print(d.get('pgid') or '')" 2>/dev/null || true)
    pid=$(python3 -c "import json;d=json.load(open('$STATE'));print(d.get('pid') or '')" 2>/dev/null || true)
    run_id=$(python3 -c "import json;d=json.load(open('$STATE'));print(d.get('runId') or '')" 2>/dev/null || true)
  fi
  if [[ -f "$PIDFILE" ]]; then
    pid="${pid:-$(cat "$PIDFILE" 2>/dev/null || true)}"
  fi

  echo "Factory Stop: pid=${pid:-?} pgid=${pgid:-?} runId=${run_id:-?}"

  # Kill process group first, then pid tree — avoid broad pkill (can hang/match self)
  if [[ -n "${pgid:-}" && "$pgid" != "None" && "$pgid" =~ ^[0-9]+$ ]]; then
    kill -TERM "-$pgid" 2>/dev/null || true
    sleep 0.5
    kill -KILL "-$pgid" 2>/dev/null || true
  fi
  if [[ -n "${pid:-}" && "$pid" != "None" && "$pid" =~ ^[0-9]+$ ]]; then
    # children of worker
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    sleep 0.5
    pkill -KILL -P "$pid" 2>/dev/null || true
    kill -KILL "$pid" 2>/dev/null || true
  fi

  rm -f "$JOBS/impl.lock" "$PIDFILE"

  if [[ -n "${run_id:-}" ]]; then
    case "$run_id" in
      run-*)
        rm -rf "/tmp/openflow-factory-${run_id}" "/var/tmp/openflow-factory-${run_id}" 2>/dev/null || true
        ;;
    esac
  fi

  python3 "$ROOT/scripts/factory/lib/run_state.py" set-status stopped >/dev/null 2>&1 || true
  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" >/dev/null 2>&1 || true
  echo "Factory stopped. Tmp corpus wiped (if any). Checkpoint retained under scripts/factory/.jobs/nodes/"
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
