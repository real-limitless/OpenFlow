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
OPT_STAGE="auto"   # auto|spec|implement|validate
NO_LOCK=0
if [[ $# -ge 1 ]]; then shift; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hard) HARD=1; shift ;;
    --type) TYPE="$2"; shift 2 ;;
    --spec) OPT_SPEC="$2"; shift 2 ;;
    --implement|--impl) OPT_IMPL="$2"; shift 2 ;;
    --validate|--val) OPT_VAL="$2"; shift 2 ;;
    --stage) OPT_STAGE="$2"; shift 2 ;;
    --no-lock) NO_LOCK=1; shift ;;
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
  for k in $kids; do
    kill_tree "$k" || true
  done
  kill -TERM "$pid" 2>/dev/null || true
  sleep 0.1
  kill -KILL "$pid" 2>/dev/null || true
  return 0
}

# Kill by fixed-string match via /proc (pkill -f is regex and fragile).
# Never match this helper / node_ctl itself.
kill_matching() {
  local needle="$1"
  NEEDLE="$needle" SELF="$$" python3 - <<'PY' || true
import os, signal, sys

needle = os.environ.get("NEEDLE", "")
self_pid = int(os.environ.get("SELF", "0"))
me = os.getpid()
parent = os.getppid()
skip = {me, parent, self_pid}
killed = []

def cmdline_of(pid: int) -> str:
    try:
        raw = open(f"/proc/{pid}/cmdline", "rb").read()
        return raw.replace(b"\x00", b" ").decode("utf-8", "replace")
    except Exception:
        return ""

for name in os.listdir("/proc"):
    if not name.isdigit():
        continue
    pid = int(name)
    if pid in skip:
        continue
    cmd = cmdline_of(pid)
    if not cmd or needle not in cmd:
        continue
    # skip our own control scripts
    if "node_ctl.sh" in cmd or "kill_matching" in cmd:
        continue
    if "resolve_models.py" in cmd:
        continue
    try:
        # kill children first
        for cname in os.listdir("/proc"):
            if not cname.isdigit():
                continue
            try:
                stat = open(f"/proc/{cname}/stat").read().split()
                # field 4 is ppid
                if int(stat[3]) == pid:
                    os.kill(int(cname), signal.SIGKILL)
            except Exception:
                pass
        os.kill(pid, signal.SIGTERM)
        killed.append(pid)
    except Exception:
        pass

for pid in list(killed):
    try:
        os.kill(pid, signal.SIGKILL)
    except Exception:
        pass

print(" ".join(str(x) for x in killed))
PY
}

cmd_kill() {
  # Never abort early — kill must always finish status update
  set +e
  ensure_type
  local sp dir pid opid ppid stage cycle kept_cycle
  sp="$(status_path "$TYPE")"
  dir="$(node_dir "$TYPE")"
  mkdir -p "$dir"
  pid=""; opid=""; ppid=""; stage=""; cycle="0"
  if [[ -f "$sp" ]]; then
    pid=$(read_json_field "$sp" pid)
    opid=$(read_json_field "$sp" opencodePid)
    ppid=$(read_json_field "$sp" pipelinePid)
    stage=$(read_json_field "$sp" stage)
    cycle=$(read_json_field "$sp" cycle)
  fi
  [[ -f "$dir/pipeline.pid" ]] && ppid="${ppid:-$(cat "$dir/pipeline.pid" 2>/dev/null || true)}"
  [[ -f "$dir/opencode.pid" ]] && opid="${opid:-$(cat "$dir/opencode.pid" 2>/dev/null || true)}"
  kept_cycle="${cycle:-0}"

  echo "[kill] type=$TYPE ppid=$ppid opid=$opid pid=$pid stage=$stage"

  # Prefer exact cmdline needles (not regex)
  kill_matching "run_node_pipeline.sh --type ${TYPE}"
  kill_matching "factory SPEC ${TYPE}"
  kill_matching "factory IMPL ${TYPE}"
  kill_matching "factory VAL ${TYPE}"
  # also timeout wrappers / stdbuf parents
  kill_matching "factory SPEC ${TYPE} c"
  kill_matching "factory IMPL ${TYPE} c"
  kill_matching "factory VAL ${TYPE} c"

  for p in $opid $pid $ppid; do
    kill_tree "$p"
  done
  sleep 0.3
  # second pass SIGKILL
  for p in $opid $pid $ppid; do
    [[ "$p" =~ ^[0-9]+$ ]] && kill -KILL "$p" 2>/dev/null || true
    [[ "$p" =~ ^[0-9]+$ ]] && pkill -KILL -P "$p" 2>/dev/null || true
  done
  kill_matching "run_node_pipeline.sh --type ${TYPE}"

  rm -f "$dir/pipeline.pid" "$dir/opencode.pid" 2>/dev/null || true

  local run_id safe
  run_id=$(python3 -c "import json;from pathlib import Path;p=Path('$JOBS/run-state.json');print(json.load(open(p)).get('runId') or '') if p.exists() else ''" 2>/dev/null || true)
  safe=$(safe_name "$TYPE")
  if [[ -n "$run_id" ]]; then
    rm -rf "/tmp/openflow-factory-${run_id}/${safe}" 2>/dev/null || true
  fi

  # Preserve cycle when marking interrupted
  if [[ -f "$sp" || -n "$stage" ]]; then
    if [[ "$stage" != "pass" && "$stage" != "skipped" && "$stage" != "queued" ]]; then
      TYPE_K="$TYPE" STAGE_K="interrupted" CYC="$kept_cycle" DIR_K="$dir" \
      DETAIL_K="killed by operator" LAST_K="$stage" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
p = Path(os.environ["DIR_K"]) / "status.json"
prev = {}
if p.exists():
    try: prev = json.loads(p.read_text())
    except Exception: pass
prev_stage = prev.get("stage") or os.environ.get("LAST_K")
prev.update({
    "type": os.environ["TYPE_K"],
    "stage": "interrupted",
    "cycle": int(os.environ.get("CYC") or prev.get("cycle") or 0),
    "verdict": None,
    "detail": os.environ.get("DETAIL_K"),
    "interruptReason": "killed_by_operator",
    "interruptMessage": os.environ.get("DETAIL_K"),
    "pid": None,
    "opencodePid": None,
    "pipelinePid": None,
    "stageLog": prev.get("stageLog"),
    "model": prev.get("model"),
    "lastStage": prev_stage if prev_stage not in ("interrupted", None) else prev.get("lastStage"),
    "updatedAt": datetime.now(timezone.utc).isoformat(),
})
p.write_text(json.dumps(prev, indent=2) + "\n")
print(json.dumps({"type": prev["type"], "stage": prev["stage"], "cycle": prev["cycle"], "lastStage": prev.get("lastStage"), "interruptReason": prev.get("interruptReason")}))
PY
      python3 "$STATE_PY" mark "$TYPE" --bucket partial 2>/dev/null || true
    fi
  fi

  # Drop lock holder + try unlock stale lock file
  local meta="$JOBS/impl.lock.holder"
  if [[ -f "$meta" ]] && grep -qF "$TYPE" "$meta" 2>/dev/null; then
    rm -f "$meta"
  fi
  # If nothing holds the lock, remove lock file so waiters can proceed
  if [[ -f "$JOBS/impl.lock" ]]; then
    if ! fuser "$JOBS/impl.lock" >/dev/null 2>&1; then
      rm -f "$JOBS/impl.lock" 2>/dev/null || true
    fi
  fi

  set -e
  echo "killed $TYPE (stage was ${stage:-unknown}, cycle=${kept_cycle})"
}

# Infer resume stage from status.json
infer_continue_stage() {
  local sp stage last failed spec
  sp="$(status_path "$TYPE")"
  stage=""; last=""; failed=""
  if [[ -f "$sp" ]]; then
    stage=$(read_json_field "$sp" stage)
    last=$(read_json_field "$sp" lastStage)
    failed=$(read_json_field "$sp" failedStage)
  fi
  [[ "$stage" == "interrupted" && -n "$last" ]] && stage="$last"
  # Prefer explicit failedStage from gates
  if [[ -n "$failed" && "$failed" != "None" ]]; then
    case "$failed" in
      spec) echo spec; return ;;
      implement) echo implement; return ;;
      validate*) echo validate; return ;;
    esac
  fi
  spec="docs/specs/nodes/${TYPE}.md"
  case "$stage" in
    validate-gates|validate-llm) echo validate ;;
    implement|implement-wait|implement-waitout) echo implement ;;
    spec|spec-corpus) echo spec ;;
    fail|partial|interrupted)
      if [[ -f "$spec" ]]; then echo implement; else echo spec; fi
      ;;
    *)
      if [[ -f "$spec" ]]; then echo implement; else echo spec; fi
      ;;
  esac
}

cmd_continue() {
  set +e
  ensure_type
  local dir log run_id stage cycle from
  dir="$(node_dir "$TYPE")"
  mkdir -p "$dir" "$JOBS"

  # Always kill stuck worker first (keep cycle logs)
  cmd_kill >/dev/null 2>&1 || true

  if [[ -f "$dir/pipeline.pid" ]] && kill -0 "$(cat "$dir/pipeline.pid")" 2>/dev/null; then
    echo "still running after kill; abort" >&2
    exit 1
  fi

  if [[ "$OPT_STAGE" == "auto" ]]; then
    from=$(infer_continue_stage)
  else
    from="$OPT_STAGE"
  fi
  case "$from" in
    spec|implement|validate) ;;
    *) echo "bad stage $from" >&2; exit 2 ;;
  esac

  cycle=$(read_json_field "$(status_path "$TYPE")" cycle)
  [[ -z "$cycle" || "$cycle" == "0" || "$cycle" == "None" ]] && cycle=1

  if [[ -n "$OPT_SPEC" || -n "$OPT_IMPL" || -n "$OPT_VAL" ]]; then
    args=(python3 "$ROOT/scripts/factory/lib/resolve_models.py" set-job --type "$TYPE")
    [[ -n "$OPT_SPEC" ]] && args+=(--spec "$OPT_SPEC")
    [[ -n "$OPT_IMPL" ]] && args+=(--implement "$OPT_IMPL")
    [[ -n "$OPT_VAL" ]] && args+=(--validate "$OPT_VAL")
    "${args[@]}" >/dev/null
  fi

  write_node_status "$TYPE" "queued" "" "continue from $from c$cycle"
  # restore cycle after write_node_status may have kept it
  python3 - <<PY
import json
from pathlib import Path
from datetime import datetime, timezone
p = Path("$(status_path "$TYPE")")
d = json.loads(p.read_text()) if p.exists() else {}
d["type"] = "$TYPE"
d["stage"] = "queued"
d["cycle"] = int("$cycle")
d["detail"] = "continue from $from c$cycle"
d["updatedAt"] = datetime.now(timezone.utc).isoformat()
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(d, indent=2) + "\n")
PY

  python3 "$STATE_PY" mark "$TYPE" --bucket active 2>/dev/null || true
  run_id=$(python3 -c "import json;from pathlib import Path;p=Path('$JOBS/run-state.json');print((json.load(open(p)).get('runId') if p.exists() else None) or 'run-manual')" 2>/dev/null || echo "run-manual")
  log="$JOBS/factory.log"

  [[ -n "$OPT_SPEC" ]] && export FACTORY_MODEL_SPEC="$OPT_SPEC"
  [[ -n "$OPT_IMPL" ]] && export FACTORY_MODEL_IMPL="$OPT_IMPL"
  [[ -n "$OPT_VAL" ]] && export FACTORY_MODEL_VAL="$OPT_VAL"
  # Bypass lock: forced for implement-wait or --no-lock
  if [[ "$NO_LOCK" -eq 1 || "$from" == "implement" ]]; then
    # only force no-lock when user asked OR stage was implement-wait
    local was_wait=0
    [[ "$(read_json_field "$(status_path "$TYPE")" lastStage 2>/dev/null || true)" == "implement-wait" ]] && was_wait=1
    # After kill, lastStage is set; also check detail
    :
  fi
  [[ "$NO_LOCK" -eq 1 ]] && export FACTORY_IMPL_LOCK=0
  eval "$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --type "$TYPE" --shell)"
  [[ "$NO_LOCK" -eq 1 ]] && export FACTORY_IMPL_LOCK=0

  extra=(--continue --from-stage "$from" --start-cycle "$cycle" --once)
  [[ "$NO_LOCK" -eq 1 ]] && extra+=(--no-lock)
  (
    echo $$ >"$dir/pipeline.pid"
    bash "$PIPE" \
      --type "$TYPE" \
      --run-id "$run_id" \
      --batch queue \
      "${extra[@]}" \
      >>"$log" 2>&1
    rm -f "$dir/pipeline.pid" "$dir/opencode.pid"
  ) &
  disown $! 2>/dev/null || true
  set -e
  echo "continue $TYPE from=$from cycle=$cycle bg=$! (one-shot, no full re-trial)"
  echo "  SPEC=$FACTORY_MODEL_SPEC IMPL=$FACTORY_MODEL_IMPL VAL=$FACTORY_MODEL_VAL"
  [[ "$NO_LOCK" -eq 1 ]] && echo "  lock=BYPASSED"
}

cmd_steal_lock() {
  # Kill whoever holds impl.lock, then continue selected with --no-lock
  set +e
  ensure_type
  local meta holder
  meta="$JOBS/impl.lock.holder"
  holder=""
  if [[ -f "$meta" ]]; then
    holder=$(cut -d' ' -f1 "$meta" 2>/dev/null || true)
  fi
  if [[ -n "$holder" && "$holder" != "$TYPE" ]]; then
    echo "[steal] killing lock holder: $holder"
    TYPE_BAK="$TYPE"
    TYPE="$holder"
    cmd_kill >/dev/null 2>&1 || true
    TYPE="$TYPE_BAK"
  fi
  rm -f "$JOBS/impl.lock.holder" 2>/dev/null || true
  if [[ -f "$JOBS/impl.lock" ]] && ! fuser "$JOBS/impl.lock" >/dev/null 2>&1; then
    rm -f "$JOBS/impl.lock" 2>/dev/null || true
  fi
  NO_LOCK=1
  OPT_STAGE=implement
  cmd_continue
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
  [[ "$NO_LOCK" -eq 1 ]] && export FACTORY_IMPL_LOCK=0
  eval "$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --type "$TYPE" --shell)"
  [[ "$NO_LOCK" -eq 1 ]] && export FACTORY_IMPL_LOCK=0

  extra=()
  [[ "$NO_LOCK" -eq 1 ]] && extra+=(--no-lock)
  (
    echo $$ >"$dir/pipeline.pid"
    bash "$PIPE" --type "$TYPE" --run-id "$run_id" --batch queue "${extra[@]}" >>"$log" 2>&1
    rm -f "$dir/pipeline.pid" "$dir/opencode.pid"
  ) &
  disown $! 2>/dev/null || true
  echo "started $TYPE bg pid=$! log=$log"
  echo "  SPEC=$FACTORY_MODEL_SPEC"
  echo "  IMPL=$FACTORY_MODEL_IMPL"
  echo "  VAL=$FACTORY_MODEL_VAL"
  [[ "$NO_LOCK" -eq 1 ]] && echo "  lock=BYPASSED"
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
  continue|resume-job) cmd_continue ;;
  steal-lock) cmd_steal_lock ;;
  skip) cmd_skip ;;
  unskip) cmd_unskip ;;
  run) cmd_run ;;
  models) cmd_models ;;
  models-clear) cmd_models_clear ;;
  retry-all-failed) cmd_retry_all_failed ;;
  *)
    echo "Usage: $0 {status|reset|retry|kill|continue|steal-lock|skip|unskip|run|models|models-clear|retry-all-failed} <type> [--stage …] [--no-lock] [--hard] [--spec M] [--impl M] [--val M]" >&2
    exit 2
    ;;
esac
