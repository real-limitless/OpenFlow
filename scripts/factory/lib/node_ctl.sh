#!/usr/bin/env bash
# Per-node factory control: reset|retry|run|kill|skip|unskip|status|retry-all-failed
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
JOBS="$ROOT/scripts/factory/.jobs"
NODES="$JOBS/nodes"
PIPE="$ROOT/scripts/factory/lib/run_node_pipeline.sh"
STATE_PY="$ROOT/scripts/factory/lib/run_state.py"

CMD="${1:-}"
TYPE=""
HARD=0
OPT_SPEC=""
OPT_IMPL=""
OPT_VAL=""
if [[ $# -ge 1 ]]; then shift; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hard) HARD=1; shift ;;
    --type) TYPE="$2"; shift 2 ;;
    --spec) OPT_SPEC="$2"; shift 2 ;;
    --implement|--impl) OPT_IMPL="$2"; shift 2 ;;
    --validate|--val) OPT_VAL="$2"; shift 2 ;;
    *)
      if [[ -z "$TYPE" && "$1" != --* ]]; then TYPE="$1"; shift
      else shift
      fi
      ;;
  esac
done

safe_name() { echo "${1//\//_}"; }
node_dir() { echo "$NODES/$(safe_name "$1")"; }
status_path() { echo "$(node_dir "$1")/status.json"; }

read_json_field() {
  local file="$1" field="$2"
  python3 -c "import json,sys;d=json.load(open(sys.argv[1]));v=d.get(sys.argv[2]);print('' if v is None else v)" \
    "$file" "$field" 2>/dev/null || true
}

write_node_status() {
  local type="$1" stage="$2" verdict="${3:-}" detail="${4:-}"
  local dir
  dir="$(node_dir "$type")"
  mkdir -p "$dir"
  NODE_TYPE="$type" STAGE="$stage" VERDICT="$verdict" DETAIL="$detail" DIR="$dir" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
p = Path(os.environ["DIR"]) / "status.json"
prev = {}
if p.exists():
    try:
        prev = json.loads(p.read_text())
    except Exception:
        pass
data = {
    **prev,
    "type": os.environ["NODE_TYPE"],
    "stage": os.environ["STAGE"],
    "cycle": int(prev.get("cycle") or 0),
    "verdict": os.environ["VERDICT"] or None,
    "detail": os.environ.get("DETAIL") or None,
    "pid": None,
    "opencodePid": None,
    "pipelinePid": None,
    "stageLog": None,
    "updatedAt": datetime.now(timezone.utc).isoformat(),
}
p.write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({"type": data["type"], "stage": data["stage"]}))
PY
}

ensure_type() {
  [[ -n "$TYPE" ]] || { echo "need type: $0 $CMD <type>" >&2; exit 2; }
}

requeue_type() {
  local t="$1"
  NODE_TYPE="$t" python3 - <<'PY'
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path("scripts/factory/lib").resolve()))
from run_state import load_state, save_state, build_pending
t = os.environ["NODE_TYPE"]
s = load_state()
for k in ("completed", "partial", "failed", "active", "skipped"):
    s[k] = [x for x in (s.get(k) or []) if x != t]
s["pending"] = build_pending(include_partial=True)
if t not in s["pending"]:
    s["pending"].insert(0, t)
save_state(s)
print("pending", len(s["pending"]))
PY
}

cmd_status() {
  ensure_type
  local sp
  sp="$(status_path "$TYPE")"
  if [[ -f "$sp" ]]; then cat "$sp"; else echo "{\"type\":\"$TYPE\",\"stage\":\"queued\"}"; fi
}

kill_tree() {
  local pid="$1"
  [[ -n "$pid" && "$pid" =~ ^[0-9]+$ ]] || return 0
  local kids
  kids=$(pgrep -P "$pid" 2>/dev/null || true)
  for k in $kids; do kill_tree "$k"; done
  kill -TERM "$pid" 2>/dev/null || true
  sleep 0.15
  kill -KILL "$pid" 2>/dev/null || true
}

cmd_kill() {
  ensure_type
  local sp dir pid opid ppid stage
  sp="$(status_path "$TYPE")"
  dir="$(node_dir "$TYPE")"
  pid=""; opid=""; ppid=""
  if [[ -f "$sp" ]]; then
    pid=$(read_json_field "$sp" pid)
    opid=$(read_json_field "$sp" opencodePid)
    ppid=$(read_json_field "$sp" pipelinePid)
  fi
  [[ -f "$dir/pipeline.pid" ]] && ppid="${ppid:-$(cat "$dir/pipeline.pid" 2>/dev/null || true)}"
  [[ -f "$dir/opencode.pid" ]] && opid="${opid:-$(cat "$dir/opencode.pid" 2>/dev/null || true)}"

  # title / cmdline match (escape carefully)
  pkill -TERM -f "run_node_pipeline.sh --type ${TYPE}" 2>/dev/null || true
  pkill -TERM -f "factory SPEC ${TYPE}" 2>/dev/null || true
  pkill -TERM -f "factory IMPL ${TYPE}" 2>/dev/null || true
  pkill -TERM -f "factory VAL ${TYPE}" 2>/dev/null || true

  for p in $opid $pid $ppid; do
    kill_tree "$p"
  done
  sleep 0.25
  pkill -KILL -f "run_node_pipeline.sh --type ${TYPE}" 2>/dev/null || true
  pkill -KILL -f "factory SPEC ${TYPE}" 2>/dev/null || true
  pkill -KILL -f "factory IMPL ${TYPE}" 2>/dev/null || true
  pkill -KILL -f "factory VAL ${TYPE}" 2>/dev/null || true

  rm -f "$dir/pipeline.pid" "$dir/opencode.pid" 2>/dev/null || true

  local run_id safe
  run_id=$(python3 -c "import json;from pathlib import Path;p=Path('$JOBS/run-state.json');print(json.load(open(p)).get('runId') or '') if p.exists() else ''" 2>/dev/null || true)
  safe=$(safe_name "$TYPE")
  if [[ -n "$run_id" ]]; then
    rm -rf "/tmp/openflow-factory-${run_id}/${safe}" 2>/dev/null || true
  fi

  if [[ -f "$sp" ]]; then
    stage=$(read_json_field "$sp" stage)
    if [[ "$stage" != "pass" && "$stage" != "skipped" && "$stage" != "queued" ]]; then
      write_node_status "$TYPE" "interrupted" "" "killed by operator"
      python3 "$STATE_PY" mark "$TYPE" --bucket partial 2>/dev/null || true
    fi
  fi
  local meta="$JOBS/impl.lock.holder"
  if [[ -f "$meta" ]] && grep -qF "$TYPE" "$meta" 2>/dev/null; then
    rm -f "$meta"
  fi
  echo "killed $TYPE"
}

cmd_reset() {
  ensure_type
  local dir
  dir="$(node_dir "$TYPE")"
  mkdir -p "$dir"
  cmd_kill >/dev/null 2>&1 || true
  if [[ "$HARD" -eq 1 ]]; then
    rm -rf "$dir"/cycle-* "$dir"/gate-latest.log "$dir"/fix_hints.txt "$dir"/heartbeat 2>/dev/null || true
  fi
  write_node_status "$TYPE" "queued" "" "reset for retry"
  : >"$dir/fix_hints.txt"
  requeue_type "$TYPE"
  echo "reset $TYPE → queued"
}

cmd_skip() {
  ensure_type
  cmd_kill >/dev/null 2>&1 || true
  write_node_status "$TYPE" "skipped" "" "skipped by operator"
  NODE_TYPE="$TYPE" python3 - <<'PY'
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path("scripts/factory/lib").resolve()))
from run_state import load_state, save_state
t = os.environ["NODE_TYPE"]
s = load_state()
for k in ("pending", "active", "completed", "partial", "failed"):
    s[k] = [x for x in (s.get(k) or []) if x != t]
sk = list(s.get("skipped") or [])
if t not in sk:
    sk.append(t)
s["skipped"] = sk
save_state(s)
print("skipped", t)
PY
}

cmd_unskip() {
  ensure_type
  write_node_status "$TYPE" "queued" "" "unskipped"
  requeue_type "$TYPE"
  echo "unskipped $TYPE"
}

cmd_run() {
  ensure_type
  local dir log run_id
  dir="$(node_dir "$TYPE")"
  mkdir -p "$dir" "$JOBS"
  if [[ -f "$dir/pipeline.pid" ]] && kill -0 "$(cat "$dir/pipeline.pid")" 2>/dev/null; then
    echo "already running pid=$(cat "$dir/pipeline.pid")" >&2
    exit 1
  fi
  # optional one-shot flags also persist as job overrides when provided
  if [[ -n "$OPT_SPEC" || -n "$OPT_IMPL" || -n "$OPT_VAL" ]]; then
    args=(python3 "$ROOT/scripts/factory/lib/resolve_models.py" set-job --type "$TYPE")
    [[ -n "$OPT_SPEC" ]] && args+=(--spec "$OPT_SPEC")
    [[ -n "$OPT_IMPL" ]] && args+=(--implement "$OPT_IMPL")
    [[ -n "$OPT_VAL" ]] && args+=(--validate "$OPT_VAL")
    "${args[@]}" >/dev/null
  fi
  write_node_status "$TYPE" "queued" "" "manual run starting"
  python3 "$STATE_PY" mark "$TYPE" --bucket active 2>/dev/null || true

  run_id=$(python3 -c "import json;from pathlib import Path;p=Path('$JOBS/run-state.json');print((json.load(open(p)).get('runId') if p.exists() else None) or 'run-manual')" 2>/dev/null || echo "run-manual")
  log="$JOBS/factory.log"

  # resolve: CLI env > job models > global
  [[ -n "$OPT_SPEC" ]] && export FACTORY_MODEL_SPEC="$OPT_SPEC"
  [[ -n "$OPT_IMPL" ]] && export FACTORY_MODEL_IMPL="$OPT_IMPL"
  [[ -n "$OPT_VAL" ]] && export FACTORY_MODEL_VAL="$OPT_VAL"
  eval "$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --type "$TYPE" --shell)"

  (
    echo $$ >"$dir/pipeline.pid"
    bash "$PIPE" --type "$TYPE" --run-id "$run_id" --batch queue >>"$log" 2>&1
    rm -f "$dir/pipeline.pid" "$dir/opencode.pid"
  ) &
  disown $! 2>/dev/null || true
  echo "started $TYPE bg pid=$! log=$log"
  echo "  SPEC=$FACTORY_MODEL_SPEC"
  echo "  IMPL=$FACTORY_MODEL_IMPL"
  echo "  VAL=$FACTORY_MODEL_VAL"
}

cmd_models() {
  ensure_type
  if [[ -n "$OPT_SPEC" || -n "$OPT_IMPL" || -n "$OPT_VAL" ]]; then
    args=(python3 "$ROOT/scripts/factory/lib/resolve_models.py" set-job --type "$TYPE")
    [[ -n "$OPT_SPEC" ]] && args+=(--spec "$OPT_SPEC")
    [[ -n "$OPT_IMPL" ]] && args+=(--implement "$OPT_IMPL")
    [[ -n "$OPT_VAL" ]] && args+=(--validate "$OPT_VAL")
    "${args[@]}"
  else
    python3 "$ROOT/scripts/factory/lib/resolve_models.py" get-job --type "$TYPE"
    echo "--- resolved ---"
    python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --type "$TYPE"
  fi
}

cmd_models_clear() {
  ensure_type
  python3 "$ROOT/scripts/factory/lib/resolve_models.py" clear-job --type "$TYPE"
  echo "cleared job models for $TYPE"
}

cmd_retry_all_failed() {
  python3 - <<'PY'
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path("scripts/factory/lib").resolve()))
from run_state import load_queue_types, read_node_status

n = 0
for t in load_queue_types():
    st = read_node_status(t) or {}
    stage = st.get("stage")
    verdict = st.get("verdict")
    if stage in ("fail", "partial", "interrupted") or verdict == "fail":
        subprocess.run(["bash", "scripts/factory/lib/node_ctl.sh", "reset", t], check=False)
        n += 1
print(f"retried {n} failed/partial/interrupted")
PY
}

case "$CMD" in
  status) cmd_status ;;
  reset|retry) cmd_reset ;;
  kill) cmd_kill ;;
  skip) cmd_skip ;;
  unskip) cmd_unskip ;;
  run) cmd_run ;;
  models) cmd_models ;;
  models-clear) cmd_models_clear ;;
  retry-all-failed) cmd_retry_all_failed ;;
  *)
    echo "Usage: $0 {status|reset|retry|kill|skip|unskip|run|models|models-clear|retry-all-failed} <type> [--hard] [--spec M] [--impl M] [--val M]" >&2
    exit 2
    ;;
esac
