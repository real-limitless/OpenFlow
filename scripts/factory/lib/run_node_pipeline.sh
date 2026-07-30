#!/usr/bin/env bash
# Per-node: SPEC → IMPLEMENT → VALIDATE
# Corpus for SPEC lives ONLY under /tmp and is wiped after SPEC.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

TYPE=""
DRY_RUN=0
MAX_CYCLES="${FACTORY_MAX_CYCLES:-3}"
RUN_ID="${FACTORY_RUN_ID:-manual}"
MODEL_SPEC="${FACTORY_MODEL_SPEC:-xai/grok-4.5}"
MODEL_IMPL="${FACTORY_MODEL_IMPL:-featherless/zai-org/GLM-5.2}"
MODEL_VAL="${FACTORY_MODEL_VAL:-xai/grok-4.5}"
BATCH_TAG="${FACTORY_BATCH_TAG:-queue}"
# opencode wall-clock limits (seconds)
TIMEOUT_SPEC="${FACTORY_TIMEOUT_SPEC:-900}"       # 15m
TIMEOUT_IMPL="${FACTORY_TIMEOUT_IMPL:-1200}"     # 20m
TIMEOUT_VAL="${FACTORY_TIMEOUT_VAL:-600}"        # 10m
LOCK_WAIT="${FACTORY_IMPL_LOCK_WAIT:-300}"       # default 5m (settings may override)
IMPL_LOCK="${FACTORY_IMPL_LOCK:-1}"
LOCK_WAIT_POLICY="${FACTORY_LOCK_WAIT_POLICY:-waitout}"  # waitout|interrupt
WAITOUT_BACKOFF="${FACTORY_WAITOUT_BACKOFF:-10}"
MAX_WAITOUT_ROUNDS="${FACTORY_MAX_WAITOUT_ROUNDS:-0}"
# Continue / resume controls
FROM_STAGE="spec"          # spec|implement|validate
START_CYCLE=0              # 0 = default 1 (or status cycle when --continue)
ONCE=0                     # 1 = at most one cycle then stop
CONTINUE_MODE=0
NO_LOCK=0                  # 1 = bypass impl.lock for this job only

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type) TYPE="$2"; shift 2 ;;
    --batch) BATCH_TAG="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --max-cycles) MAX_CYCLES="$2"; shift 2 ;;
    --run-id) RUN_ID="$2"; shift 2 ;;
    --from-stage) FROM_STAGE="$2"; shift 2 ;;
    --start-cycle) START_CYCLE="$2"; shift 2 ;;
    --once) ONCE=1; shift ;;
    --continue) CONTINUE_MODE=1; ONCE=1; shift ;;
    --no-lock) NO_LOCK=1; IMPL_LOCK=0; export FACTORY_IMPL_LOCK=0; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$TYPE" ]] || { echo "need --type" >&2; exit 2; }
case "$FROM_STAGE" in
  spec|implement|validate) ;;
  *) echo "bad --from-stage: $FROM_STAGE" >&2; exit 2 ;;
esac

# Fill models from job override / global if env not already set by parent
if [[ -z "${FACTORY_MODEL_SPEC:-}" || -z "${FACTORY_MODEL_IMPL:-}" || -z "${FACTORY_MODEL_VAL:-}" ]]; then
  eval "$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --type "$TYPE" --shell 2>/dev/null || true)"
  MODEL_SPEC="${FACTORY_MODEL_SPEC:-$MODEL_SPEC}"
  MODEL_IMPL="${FACTORY_MODEL_IMPL:-$MODEL_IMPL}"
  MODEL_VAL="${FACTORY_MODEL_VAL:-$MODEL_VAL}"
  MAX_CYCLES="${FACTORY_MAX_CYCLES:-$MAX_CYCLES}"
  if [[ "$NO_LOCK" -eq 0 ]]; then
    IMPL_LOCK="${FACTORY_IMPL_LOCK:-$IMPL_LOCK}"
  fi
  LOCK_WAIT="${FACTORY_IMPL_LOCK_WAIT:-$LOCK_WAIT}"
  LOCK_WAIT_POLICY="${FACTORY_LOCK_WAIT_POLICY:-$LOCK_WAIT_POLICY}"
  WAITOUT_BACKOFF="${FACTORY_WAITOUT_BACKOFF:-$WAITOUT_BACKOFF}"
  MAX_WAITOUT_ROUNDS="${FACTORY_MAX_WAITOUT_ROUNDS:-$MAX_WAITOUT_ROUNDS}"
fi
if [[ "$NO_LOCK" -eq 1 ]]; then
  IMPL_LOCK=0
fi

SAFE="${TYPE//\//_}"
JOB_ROOT="$ROOT/scripts/factory/.jobs/nodes/${SAFE}"
mkdir -p "$JOB_ROOT"
export FACTORY_JOB_DIR="$JOB_ROOT"
LOCK="$ROOT/scripts/factory/.jobs/impl.lock"
LOCK_META="$ROOT/scripts/factory/.jobs/impl.lock.holder"
STATUS_FILE="$JOB_ROOT/status.json"
FIX_HINTS_FILE="$JOB_ROOT/fix_hints.txt"
HEARTBEAT_FILE="$JOB_ROOT/heartbeat"
[[ -f "$FIX_HINTS_FILE" ]] || : >"$FIX_HINTS_FILE"

CORPUS_BASE="/tmp/openflow-factory-${RUN_ID}"
CORPUS_DIR="${CORPUS_BASE}/${SAFE}"

# write_status stage cycle [verdict] [detail] [stage_log] [model] [oc_pid] [interrupt_reason]
write_status() {
  local stage="$1" cycle="$2" verdict="${3:-}" detail="${4:-}"
  local stage_log="${5:-}"
  local model="${6:-}"
  local oc_pid="${7:-}"
  local ireason="${8:-}"
  STATUS_FILE_PATH="$STATUS_FILE" CORPUS_DIR_PATH="$CORPUS_DIR" \
  DETAIL="$detail" STAGE_LOG="$stage_log" MODEL="$model" OC_PID="$oc_pid" \
  IREASON="$ireason" PIPE_PID="$$" STAGE_NAME="$stage" CYCLE_N="$cycle" \
  VERDICT_N="$verdict" TYPE_N="$TYPE" BATCH_N="$BATCH_TAG" RUN_N="$RUN_ID" \
  python3 - <<'PY'
import json, os
from pathlib import Path
from datetime import datetime, timezone
p = Path(os.environ["STATUS_FILE_PATH"])
prev = {}
if p.exists():
    try:
        prev = json.loads(p.read_text())
    except Exception:
        pass
stage = os.environ.get("STAGE_NAME") or "queued"
data = {
    **prev,
    "type": os.environ.get("TYPE_N"),
    "batch": os.environ.get("BATCH_N"),
    "runId": os.environ.get("RUN_N"),
    "stage": stage,
    "cycle": int(os.environ.get("CYCLE_N") or 0),
    "verdict": (os.environ.get("VERDICT_N") or None) or None,
    "detail": os.environ.get("DETAIL") or None,
    "pipelinePid": int(os.environ.get("PIPE_PID") or 0) or None,
    "pid": int(os.environ.get("PIPE_PID") or 0) or None,
    "updatedAt": datetime.now(timezone.utc).isoformat(),
}
sl = os.environ.get("STAGE_LOG") or ""
if sl:
    data["stageLog"] = sl
elif stage in ("pass", "fail", "partial", "skipped", "queued", "interrupted", "implement-waitout"):
    if stage not in ("implement-waitout",):
        data["opencodePid"] = None
m = os.environ.get("MODEL") or ""
if m:
    data["model"] = m
oc = os.environ.get("OC_PID") or ""
if oc.isdigit():
    data["opencodePid"] = int(oc)
ireason = os.environ.get("IREASON") or ""
if ireason:
    data["interruptReason"] = ireason
    data["interruptMessage"] = os.environ.get("DETAIL") or ireason
elif stage not in ("interrupted", "implement-waitout"):
    data.pop("interruptReason", None)
    data.pop("interruptMessage", None)
corpus = os.environ.get("CORPUS_DIR_PATH") or ""
data["corpusPath"] = corpus if corpus and Path(corpus).exists() else None
p.write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({k: data.get(k) for k in (
    "type", "stage", "cycle", "verdict", "detail", "interruptReason", "model"
)}))
PY
  echo "$$" >"$JOB_ROOT/pipeline.pid"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$HEARTBEAT_FILE" 2>/dev/null || true
}

wipe_corpus() {
  case "$CORPUS_DIR" in
    /tmp/openflow-factory-*|/var/tmp/openflow-factory-*)
      rm -rf "$CORPUS_DIR" 2>/dev/null || true
      ;;
  esac
}

# Run opencode with timeout; prompt via stdin-friendly temp is already in file.
# Prefer short CLI message + --file for the prompt body when supported.
run_opencode() {
  local model="$1" title="$2" prompt_file="$3" message="$4" out_log="$5" limit_s="$6"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] opencode run --model $model --title $title timeout=${limit_s}s" | tee "$out_log"
    return 0
  fi
  command -v opencode >/dev/null || { echo "opencode not found" >&2; return 127; }
  [[ -f "$prompt_file" ]] || { echo "missing prompt $prompt_file" >&2; return 2; }

  # Compact message; full instructions live in --file
  local short_msg="$message"

  # Append resume banner rather than truncate when continuing
  if [[ "$CONTINUE_MODE" -ne 1 || ! -f "$out_log" ]]; then
    : >"$out_log"
  fi
  set +e
  # Heartbeat + log activity (bps / silent) while OpenCode runs
  (
    prev_sz=0
    prev_ts=$(date +%s)
    last_grow=$prev_ts
    [[ -f "$out_log" ]] && prev_sz=$(wc -c <"$out_log" 2>/dev/null || echo 0)
    while true; do
      now=$(date +%s)
      date -u +%Y-%m-%dT%H:%M:%SZ >"$HEARTBEAT_FILE" 2>/dev/null || true
      sz=0
      [[ -f "$out_log" ]] && sz=$(wc -c <"$out_log" 2>/dev/null || echo 0)
      dt=$((now - prev_ts))
      [[ "$dt" -lt 1 ]] && dt=1
      delta=$((sz - prev_sz))
      [[ "$delta" -lt 0 ]] && delta=0
      bps=$((delta / dt))
      # rough token estimate ~ 4 bytes/token when streaming
      tps=$(( (bps + 3) / 4 ))
      if [[ "$delta" -gt 0 ]]; then
        last_grow=$now
      fi
      silent=$((now - last_grow))
      STATUS_FILE_PATH="$STATUS_FILE" OUT_LOG="$out_log" \
      BPS="$bps" TPS="$tps" SILENT="$silent" SZ="$sz" \
      python3 - <<'PY' 2>/dev/null || true
import json, os
from pathlib import Path
from datetime import datetime, timezone
p = Path(os.environ["STATUS_FILE_PATH"])
if not p.exists():
    raise SystemExit
d = json.loads(p.read_text())
bps = int(os.environ.get("BPS") or 0)
tps = int(os.environ.get("TPS") or 0)
silent = int(os.environ.get("SILENT") or 0)
sz = int(os.environ.get("SZ") or 0)
act = d.get("activity") or {}
act.update({
    "logBytes": sz,
    "logBytesPerSec": bps,
    "estTokensPerSec": tps,
    "silentSec": silent,
    "lastSampleAt": datetime.now(timezone.utc).isoformat(),
    "note": "est tok/s from log growth (~4 B/tok); 0 during quiet reasoning",
})
if silent >= 90 and bps == 0:
    act["state"] = "quiet"
elif bps > 0:
    act["state"] = "streaming"
else:
    act["state"] = "idle"
d["activity"] = act
# keep detail useful without wiping lock messages
if d.get("stage") in ("spec", "implement", "validate-llm"):
    tag = act["state"]
    d["detail"] = f"model={d.get('model') or '?'} · {tag} ~{tps} tok/s · log {bps} B/s · silent {silent}s"
p.write_text(json.dumps(d, indent=2) + "\n")
PY
      prev_sz=$sz
      prev_ts=$now
      sleep 5
    done
  ) &
  local hb_pid=$!

  # Line-buffered so TUI live-tail sees tool lines promptly
  local runner=(opencode run --dir "$ROOT" --auto --model "$model" --title "$title" --file "$prompt_file" -- "$short_msg")
  if command -v stdbuf >/dev/null 2>&1; then
    runner=(stdbuf -oL -eL "${runner[@]}")
  fi
  if command -v timeout >/dev/null 2>&1; then
    runner=(timeout --signal=TERM --kill-after=45 "${limit_s}" "${runner[@]}")
  fi

  # Launch in background to record opencode pid for kill/live status
  if [[ "$CONTINUE_MODE" -eq 1 && -f "$out_log" ]]; then
    echo "" >>"$out_log"
    echo "=== RESUME $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >>"$out_log"
    "${runner[@]}" >>"$out_log" 2>&1 &
  else
    "${runner[@]}" >"$out_log" 2>&1 &
  fi
  local oc_pid=$!
  echo "$oc_pid" >"$JOB_ROOT/opencode.pid"
  # patch status with opencode pid + stage log (best-effort)
  python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
p = Path("$STATUS_FILE")
if p.exists():
    d = json.loads(p.read_text())
    d["opencodePid"] = int("$oc_pid")
    d["stageLog"] = "$out_log"
    d["model"] = "$model"
    p.write_text(json.dumps(d, indent=2) + "\n")
PY

  wait "$oc_pid"
  local rc=$?
  rm -f "$JOB_ROOT/opencode.pid"
  kill "$hb_pid" 2>/dev/null || true
  wait "$hb_pid" 2>/dev/null || true
  set -e

  if [[ "$rc" -eq 124 ]]; then
    echo "[factory] TIMEOUT after ${limit_s}s model=$model title=$title" | tee -a "$out_log"
    return 124
  fi
  return $rc
}

parse_verdict() {
  local logf="$1"
  python3 - <<'PY' "$logf"
import json, re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
# Strip ANSI
text = re.sub(r"\x1b\[[0-9;]*m", "", text)

def emit(v, hints):
    print("pass" if str(v).lower() == "pass" else "fail")
    if isinstance(hints, list):
        print("\n".join(str(h) for h in hints))
    elif hints:
        print(str(hints))

# 1) Prefer last JSON object containing "verdict"
candidates = []
# balanced-ish scan for {...}
stack = []
start = None
for i, ch in enumerate(text):
    if ch == "{":
        if not stack:
            start = i
        stack.append(ch)
    elif ch == "}" and stack:
        stack.pop()
        if not stack and start is not None:
            chunk = text[start : i + 1]
            if "verdict" in chunk:
                candidates.append(chunk)
            start = None

for raw in reversed(candidates):
    try:
        data = json.loads(raw)
    except Exception:
        # try to extract smaller verdict-only object
        m = re.search(r'"verdict"\s*:\s*"(pass|fail)"', raw, re.I)
        if m:
            emit(m.group(1), ["partial JSON parse"])
            raise SystemExit(0)
        continue
    if "verdict" in data:
        hints = data.get("fix_hints") or data.get("reasons") or []
        emit(data.get("verdict"), hints)
        raise SystemExit(0)

m = re.search(r'"verdict"\s*:\s*"(pass|fail)"', text, re.I)
if m:
    emit(m.group(1), ["verdict string match only"])
    raise SystemExit(0)

print("fail")
print("no JSON verdict in validate output")
PY
}

acquire_impl_lock() {
  # Returns: 0=got lock, 1=waitout (re-queue), 2=interrupted (give up)
  mkdir -p "$(dirname "$LOCK")"
  exec 9>"$LOCK"
  if ! command -v flock >/dev/null 2>&1; then
    return 0
  fi
  local holder=""
  [[ -f "$LOCK_META" ]] && holder=$(cut -d' ' -f1 "$LOCK_META" 2>/dev/null || true)
  local rounds
  rounds=$(python3 -c "import json;from pathlib import Path;p=Path('$STATUS_FILE');print(int(json.load(open(p)).get('waitoutRounds') or 0) if p.exists() else 0)" 2>/dev/null || echo 0)

  write_status "implement-wait" "$cycle" "" \
    "waiting impl.lock max=${LOCK_WAIT}s holder=${holder:-?} policy=${LOCK_WAIT_POLICY} rounds=${rounds} (L=bypass)"
  echo "[factory] $TYPE waiting impl.lock max=${LOCK_WAIT}s holder=${holder:-?} policy=$LOCK_WAIT_POLICY rounds=$rounds" >&2

  (
    local elapsed=0
    while true; do
      sleep 10
      elapsed=$((elapsed + 10))
      h=""
      [[ -f "$LOCK_META" ]] && h=$(cut -d' ' -f1 "$LOCK_META" 2>/dev/null || true)
      DETAIL="waiting impl.lock ${elapsed}s/${LOCK_WAIT}s holder=${h:-?} · L=bypass" \
      STATUS_FILE_PATH="$STATUS_FILE" HEARTBEAT_FILE="$HEARTBEAT_FILE" python3 - <<'PY' 2>/dev/null || true
import json, os
from pathlib import Path
from datetime import datetime, timezone
p = Path(os.environ["STATUS_FILE_PATH"])
if p.exists():
    d = json.loads(p.read_text())
    if d.get("stage") != "implement-wait":
        raise SystemExit
    d["detail"] = os.environ.get("DETAIL")
    d["lockHolder"] = (d.get("detail") or "").split("holder=")[-1].split()[0] if "holder=" in (d.get("detail") or "") else d.get("lockHolder")
    d["updatedAt"] = datetime.now(timezone.utc).isoformat()
    p.write_text(json.dumps(d, indent=2) + "\n")
Path(os.environ["HEARTBEAT_FILE"]).write_text(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "\n")
PY
    done
  ) &
  local wait_hb=$!

  if ! flock -w "$LOCK_WAIT" -x 9; then
    kill "$wait_hb" 2>/dev/null || true
    wait "$wait_hb" 2>/dev/null || true
    rounds=$((rounds + 1))
    local msg="impl.lock busy after ${LOCK_WAIT}s; holder=${holder:-?}; round=${rounds}"
    echo "[factory] $TYPE $msg policy=$LOCK_WAIT_POLICY" >&2

    if [[ "$LOCK_WAIT_POLICY" == "interrupt" ]]; then
      write_status "interrupted" "$cycle" "" "$msg · press y/L to continue" "" "" "" "impl_lock_timeout"
      # stash lastStage for continue
      python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
p=Path("$STATUS_FILE")
d=json.loads(p.read_text())
d["lastStage"]="implement-wait"
d["lockHolder"]="$holder"
d["lockWaitSec"]=int("$LOCK_WAIT")
d["waitoutRounds"]=int("$rounds")
p.write_text(json.dumps(d, indent=2)+"\n")
PY
      return 2
    fi

    # waitout: stay queued — exit cleanly so worker re-schedules
    if [[ "$MAX_WAITOUT_ROUNDS" -gt 0 && "$rounds" -ge "$MAX_WAITOUT_ROUNDS" ]]; then
      write_status "interrupted" "$cycle" "" \
        "$msg; max waitout rounds ($MAX_WAITOUT_ROUNDS) reached" "" "" "" "impl_lock_timeout"
      python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
p=Path("$STATUS_FILE")
d=json.loads(p.read_text())
d["lastStage"]="implement-wait"
d["lockHolder"]="$holder"
d["waitoutRounds"]=int("$rounds")
p.write_text(json.dumps(d, indent=2)+"\n")
PY
      return 2
    fi

    write_status "implement-waitout" "$cycle" "" \
      "$msg · still queued (waitout); will retry" "" "" "" "impl_lock_waitout"
    python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
from datetime import datetime, timezone
p=Path("$STATUS_FILE")
d=json.loads(p.read_text())
d["stage"]="implement-waitout"
d["lastStage"]="implement-wait"
d["lockHolder"]="$holder"
d["lockWaitSec"]=int("$LOCK_WAIT")
d["waitoutRounds"]=int("$rounds")
d["interruptReason"]="impl_lock_waitout"
d["interruptMessage"]=d.get("detail")
d["pipelinePid"]=None
d["pid"]=None
d["opencodePid"]=None
d["updatedAt"]=datetime.now(timezone.utc).isoformat()
p.write_text(json.dumps(d, indent=2)+"\n")
PY
    if [[ "${WAITOUT_BACKOFF}" -gt 0 ]]; then
      echo "[factory] waitout backoff ${WAITOUT_BACKOFF}s before re-queue"
      sleep "$WAITOUT_BACKOFF"
    fi
    return 1
  fi
  kill "$wait_hb" 2>/dev/null || true
  wait "$wait_hb" 2>/dev/null || true
  echo "$TYPE $$ $(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$LOCK_META"
  # clear waitout counters on success
  python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
p=Path("$STATUS_FILE")
if p.exists():
    d=json.loads(p.read_text())
    d.pop("waitoutRounds", None)
    d.pop("interruptReason", None)
    d.pop("interruptMessage", None)
    p.write_text(json.dumps(d, indent=2)+"\n")
PY
  return 0
}

release_impl_lock() {
  if [[ -f "$LOCK_META" ]]; then
    # only clear if we own it
    if grep -q " $ $$ " "$LOCK_META" 2>/dev/null || grep -q "^$TYPE $$" "$LOCK_META" 2>/dev/null; then
      rm -f "$LOCK_META"
    fi
  fi
  # fd 9 closed on process exit; unlock explicitly when possible
  if command -v flock >/dev/null 2>&1; then
    flock -u 9 2>/dev/null || true
  fi
}

python3 "$ROOT/scripts/factory/lib/run_state.py" mark "$TYPE" --bucket active 2>/dev/null || true
echo "$$" >"$JOB_ROOT/pipeline.pid"
trap 'rm -f "$JOB_ROOT/pipeline.pid" "$JOB_ROOT/opencode.pid" 2>/dev/null || true' EXIT

# Honor skip
if [[ -f "$STATUS_FILE" ]]; then
  if python3 -c "import json;print(json.load(open('$STATUS_FILE')).get('stage')=='skipped')" 2>/dev/null | grep -q True; then
    echo "SKIPPED $TYPE"
    exit 0
  fi
fi

# Starting cycle
if [[ "$START_CYCLE" -gt 0 ]]; then
  cycle="$START_CYCLE"
elif [[ -f "$STATUS_FILE" ]]; then
  cycle=$(python3 -c "import json;print(int(json.load(open('$STATUS_FILE')).get('cycle') or 1))" 2>/dev/null || echo 1)
  [[ "$cycle" -lt 1 ]] && cycle=1
else
  cycle=1
fi
# For full runs (not continue), always start at 1 unless --start-cycle set
if [[ "$CONTINUE_MODE" -eq 0 && "$START_CYCLE" -eq 0 ]]; then
  cycle=1
  FROM_STAGE="spec"
fi

# When continuing to implement/validate, require existing spec if skipping SPEC
SPEC_FILE="docs/specs/nodes/${TYPE}.md"
if [[ "$FROM_STAGE" != "spec" && ! -f "$SPEC_FILE" ]]; then
  echo "[factory] no spec at $SPEC_FILE — forcing FROM_STAGE=spec"
  FROM_STAGE="spec"
fi

final="partial"
STAGE_CURSOR="$FROM_STAGE"
echo "[factory] start type=$TYPE cycle=$cycle/$MAX_CYCLES from=$STAGE_CURSOR once=$ONCE continue=$CONTINUE_MODE"

while [[ "$cycle" -le "$MAX_CYCLES" ]]; do
  echo "======== $TYPE cycle $cycle/$MAX_CYCLES run=$RUN_ID from=$STAGE_CURSOR ========"
  CYCLE_DIR="$JOB_ROOT/cycle-${cycle}"
  mkdir -p "$CYCLE_DIR"
  FIX_HINTS="$(cat "$FIX_HINTS_FILE" 2>/dev/null || true)"
  {
    echo ""
    echo "=== CONTINUE $(date -u +%Y-%m-%dT%H:%M:%SZ) from=$STAGE_CURSOR cycle=$cycle ==="
  } >>"$CYCLE_DIR/continue.log" 2>/dev/null || true

  # ── 1. SPEC (optional skip on continue) ─────────────────────────
  if [[ "$STAGE_CURSOR" == "spec" ]]; then
  write_status "spec-corpus" "$cycle" "" "continue=$CONTINUE_MODE"
  wipe_corpus
  if [[ "$DRY_RUN" -eq 1 ]]; then
    mkdir -p "$CORPUS_DIR"
    echo "# dry-run corpus for $TYPE" >"$CORPUS_DIR/INDEX.md"
  else
    bash "$ROOT/scripts/factory/lib/fetch_spec_corpus.sh" "$TYPE" "$CORPUS_DIR" \
      >"$CYCLE_DIR/corpus.fetch.log" 2>&1 || {
        echo "corpus fetch failed; continuing SPEC with docs-only if any" | tee -a "$CYCLE_DIR/corpus.fetch.log"
      }
  fi

  # ── 1b. SPEC ────────────────────────────────────────────────────
  write_status "spec" "$cycle" "" "model=$MODEL_SPEC" \
    "$CYCLE_DIR/01-spec.out.log" "$MODEL_SPEC"
  python3 "$ROOT/scripts/factory/lib/assemble_prompt.py" 01-spec-node.md \
    --type "$TYPE" --batch "$BATCH_TAG" --cycle "$cycle" --max-cycles "$MAX_CYCLES" \
    --fix-hints "$FIX_HINTS" \
    -o "$CYCLE_DIR/01-spec.prompt.md"

  {
    echo ""
    echo "## SPEC research corpus (TEMPORARY — under /tmp only)"
    echo ""
    echo "CORPUS_DIR=\`${CORPUS_DIR}\`"
    echo ""
    echo "If this directory exists, read \`INDEX.md\`, \`docs/page.md\` (if present), and JSON descriptors under extract/."
    echo "**ISOLATION:** This corpus must never be copied into the OpenFlow git repository."
    echo "**CLEAN-ROOM:** Use it only to discover parameter names/enums/defaults. Do not copy implementation source into the repo or the spec."
    echo "Write the finished spec only to \`docs/specs/nodes/${TYPE}.md\`."
  } >>"$CYCLE_DIR/01-spec.prompt.md"

  # Append resume banner rather than wiping prior SPEC log when continuing
  if [[ "$CONTINUE_MODE" -eq 1 && -f "$CYCLE_DIR/01-spec.out.log" ]]; then
    echo "" >>"$CYCLE_DIR/01-spec.out.log"
    echo "=== RESUME SPEC $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >>"$CYCLE_DIR/01-spec.out.log"
  fi

  set +e
  run_opencode "$MODEL_SPEC" "factory SPEC $TYPE c$cycle" \
    "$CYCLE_DIR/01-spec.prompt.md" \
    "Execute the SPEC job for $TYPE. Use CORPUS_DIR only if present under /tmp. Write docs/specs/nodes/${TYPE}.md. Never copy n8n package files into the repo. Stop when done." \
    "$CYCLE_DIR/01-spec.out.log" \
    "$TIMEOUT_SPEC"
  SPEC_OC_RC=$?
  set -e

  wipe_corpus
  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" \
    >"$CYCLE_DIR/leak-after-spec.log" 2>&1 || {
      echo "LEAK DETECTED after SPEC" >&2
      cat "$CYCLE_DIR/leak-after-spec.log" >&2 || true
    }

  # ── SPEC acceptance gate (do not advance without a real spec) ───
  if [[ "$DRY_RUN" -eq 1 ]]; then
    # ensure a stub spec exists for dry-run progression
    if [[ ! -f "docs/specs/nodes/${TYPE}.md" ]]; then
      mkdir -p "docs/specs/nodes"
      printf '# %s\n\n## Purpose\nDry-run stub.\n\n## Behavior\nStub.\n\n## Acceptance\nStub.\n' "$TYPE" \
        >"docs/specs/nodes/${TYPE}.md"
    fi
    SPEC_GATE_RC=0
  else
    set +e
    bash "$ROOT/scripts/factory/lib/gate_spec.sh" "$TYPE" \
      "$CYCLE_DIR/01-spec.out.log" "$SPEC_OC_RC" \
      >"$CYCLE_DIR/gate-spec.log" 2>&1
    SPEC_GATE_RC=$?
    set -e
  fi
  if [[ "$SPEC_GATE_RC" -ne 0 ]]; then
    primary=$(grep '^PRIMARY ' "$CYCLE_DIR/gate-spec.log" 2>/dev/null | awk '{print $2}' || echo spec_gate_fail)
    reasons=$(grep '^REASON ' "$CYCLE_DIR/gate-spec.log" 2>/dev/null | sed 's/^REASON //' | head -5 | tr '\n' '; ' || true)
    echo "[factory] SPEC GATE FAIL $TYPE: $primary — $reasons" | tee -a "$CYCLE_DIR/gate-spec.log"
    echo "SPEC gate failed ($primary): $reasons" >"$FIX_HINTS_FILE"
    write_status "fail" "$cycle" "fail" "SPEC gate: $primary — $reasons" \
      "" "" "" "$primary"
    python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
from datetime import datetime, timezone
p=Path("$STATUS_FILE")
d=json.loads(p.read_text()) if p.exists() else {}
d.update({
  "failedStage": "spec",
  "failReason": "$primary",
  "lastStage": "spec",
  "interruptMessage": d.get("detail"),
  "updatedAt": datetime.now(timezone.utc).isoformat(),
})
p.write_text(json.dumps(d, indent=2)+"\n")
PY
    if [[ "$ONCE" -eq 1 ]]; then
      final="fail"
      break
    fi
    # retryable rate limits: stay on SPEC next cycle
    STAGE_CURSOR="spec"
    cycle=$((cycle + 1))
    continue
  fi
  STAGE_CURSOR="implement"
  fi  # end SPEC block

  # ── 2. IMPLEMENT ────────────────────────────────────────────────
  if [[ "$STAGE_CURSOR" == "implement" || "$STAGE_CURSOR" == "spec" ]]; then
  # (spec path already advanced cursor to implement)
  :
  fi
  if [[ "$STAGE_CURSOR" == "implement" ]]; then
  python3 "$ROOT/scripts/factory/lib/assemble_prompt.py" 02-implement-node.md \
    --type "$TYPE" --batch "$BATCH_TAG" --cycle "$cycle" --max-cycles "$MAX_CYCLES" \
    --fix-hints "$FIX_HINTS" \
    -o "$CYCLE_DIR/02-implement.prompt.md"
  {
    echo ""
    echo "## Isolation"
    echo "You do NOT have access to any n8n npm package or /tmp corpus."
    echo "Implement only from docs/specs/nodes/${TYPE}.md and src/sdk."
    echo ""
    echo "## Speed"
    echo "Edit only what is required. Do not re-read the entire repo. Stop as soon as executor+tests+registration are done."
  } >>"$CYCLE_DIR/02-implement.prompt.md"

  if [[ "$CONTINUE_MODE" -eq 1 && -f "$CYCLE_DIR/02-implement.out.log" ]]; then
    echo "" >>"$CYCLE_DIR/02-implement.out.log"
    echo "=== RESUME IMPL $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >>"$CYCLE_DIR/02-implement.out.log"
  fi

  # Hard require spec before implement (even on continue)
  if [[ "$DRY_RUN" -eq 0 && ! -f "docs/specs/nodes/${TYPE}.md" ]]; then
    echo "[factory] IMPL blocked: missing spec for $TYPE"
    write_status "fail" "$cycle" "fail" "IMPLEMENT blocked: missing spec" \
      "" "" "" "spec_missing"
    echo "Missing spec — cannot implement. Re-run SPEC." >"$FIX_HINTS_FILE"
    if [[ "$ONCE" -eq 1 ]]; then final="fail"; break; fi
    STAGE_CURSOR="spec"
    cycle=$((cycle + 1))
    continue
  fi

  IMPL_OC_RC=0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    write_status "implement" "$cycle" "" "dry-run model=$MODEL_IMPL" \
      "$CYCLE_DIR/02-implement.out.log" "$MODEL_IMPL"
    run_opencode "$MODEL_IMPL" "factory IMPL $TYPE c$cycle" \
      "$CYCLE_DIR/02-implement.prompt.md" \
      "dry-run" \
      "$CYCLE_DIR/02-implement.out.log" \
      1 || true
    IMPL_OC_RC=0
  else
    if [[ "$IMPL_LOCK" == "1" || "$IMPL_LOCK" == "true" ]]; then
      set +e
      acquire_impl_lock
      lock_rc=$?
      set -e
      if [[ "$lock_rc" -eq 1 ]]; then
        echo "RESULT waitout $TYPE"
        exit 75
      fi
      if [[ "$lock_rc" -eq 2 ]]; then
        final="interrupted"
        break
      fi
      trap 'release_impl_lock' EXIT
      write_status "implement" "$cycle" "" "model=$MODEL_IMPL lock=held" \
        "$CYCLE_DIR/02-implement.out.log" "$MODEL_IMPL"
    else
      write_status "implement" "$cycle" "" "model=$MODEL_IMPL lock=bypassed" \
        "$CYCLE_DIR/02-implement.out.log" "$MODEL_IMPL"
    fi

    set +e
    run_opencode "$MODEL_IMPL" "factory IMPL $TYPE c$cycle" \
      "$CYCLE_DIR/02-implement.prompt.md" \
      "Implement $TYPE from its spec and SDK only. No n8n packages. Register + tests. Stop when done." \
      "$CYCLE_DIR/02-implement.out.log" \
      "$TIMEOUT_IMPL"
    IMPL_OC_RC=$?
    set -e

    if [[ "$IMPL_LOCK" == "1" || "$IMPL_LOCK" == "true" ]]; then
      release_impl_lock
      trap - EXIT
    fi
  fi

  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" \
    >"$CYCLE_DIR/leak-after-impl.log" 2>&1 || true

  # ── IMPL acceptance gate (do not validate without registration) ─
  if [[ "$DRY_RUN" -eq 1 ]]; then
    IMPL_GATE_RC=0
  else
    set +e
    bash "$ROOT/scripts/factory/lib/gate_impl.sh" "$TYPE" \
      "$CYCLE_DIR/02-implement.out.log" "$IMPL_OC_RC" \
      >"$CYCLE_DIR/gate-impl.log" 2>&1
    IMPL_GATE_RC=$?
    set -e
  fi
  if [[ "$IMPL_GATE_RC" -ne 0 ]]; then
    primary=$(grep '^PRIMARY ' "$CYCLE_DIR/gate-impl.log" 2>/dev/null | awk '{print $2}' || echo impl_gate_fail)
    reasons=$(grep '^REASON ' "$CYCLE_DIR/gate-impl.log" 2>/dev/null | sed 's/^REASON //' | head -5 | tr '\n' '; ' || true)
    echo "[factory] IMPL GATE FAIL $TYPE: $primary — $reasons" | tee -a "$CYCLE_DIR/gate-impl.log"
    echo "IMPLEMENT gate failed ($primary): $reasons" >"$FIX_HINTS_FILE"
    write_status "fail" "$cycle" "fail" "IMPL gate: $primary — $reasons" \
      "" "" "" "$primary"
    python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
from datetime import datetime, timezone
p=Path("$STATUS_FILE")
d=json.loads(p.read_text()) if p.exists() else {}
d.update({
  "failedStage": "implement",
  "failReason": "$primary",
  "lastStage": "implement",
  "updatedAt": datetime.now(timezone.utc).isoformat(),
})
p.write_text(json.dumps(d, indent=2)+"\n")
PY
    if [[ "$ONCE" -eq 1 ]]; then
      final="fail"
      break
    fi
    # Next cycle: if agent/rate-limit, retry IMPL; if no spec, go SPEC
    if [[ "$primary" == "spec_missing" ]]; then
      STAGE_CURSOR="spec"
    else
      STAGE_CURSOR="implement"
    fi
    cycle=$((cycle + 1))
    continue
  fi
  STAGE_CURSOR="validate"
  fi  # end IMPLEMENT block

  # ── 3. Deterministic gates ──────────────────────────────────────
  if [[ "$STAGE_CURSOR" != "validate" ]]; then
    STAGE_CURSOR="validate"
  fi
  write_status "validate-gates" "$cycle"
  set +e
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] skip validate_node.sh" >"$CYCLE_DIR/gate.log"
    echo "=== summary ok=1 fail=0 ===" >>"$CYCLE_DIR/gate.log"
    GATE_RC=0
    LEAK_RC=0
  else
    bash "$ROOT/scripts/factory/lib/validate_node.sh" "$TYPE" "" \
      >"$CYCLE_DIR/gate.log" 2>&1
    GATE_RC=$?
    bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" >>"$CYCLE_DIR/gate.log" 2>&1
    LEAK_RC=$?
  fi
  set -e
  if [[ "$LEAK_RC" -ne 0 ]]; then GATE_RC=1; fi
  cp "$CYCLE_DIR/gate.log" "$JOB_ROOT/gate-latest.log" 2>/dev/null || true

  # Skip expensive VAL LLM when deterministic gates already failed
  if [[ "$GATE_RC" -ne 0 && "$DRY_RUN" -eq 0 ]]; then
    echo "[factory] skipping VAL LLM — deterministic gates failed"
    VERDICT="fail"
    HINTS="Deterministic gates failed before VAL LLM. See gate.log."
    echo "$HINTS" >"$FIX_HINTS_FILE"
    echo "$VERDICT" >"$CYCLE_DIR/verdict.txt"
    write_status "fail" "$cycle" "fail" "validate gates failed" \
      "" "" "" "validate_gates"
    python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
from datetime import datetime, timezone
p=Path("$STATUS_FILE")
d=json.loads(p.read_text()) if p.exists() else {}
d.update({"failedStage":"validate","failReason":"validate_gates","lastStage":"validate-gates",
          "updatedAt":datetime.now(timezone.utc).isoformat()})
p.write_text(json.dumps(d, indent=2)+"\n")
PY
    if [[ "$ONCE" -eq 1 ]]; then final="fail"; break; fi
    STAGE_CURSOR="implement"
    cycle=$((cycle + 1))
    continue
  fi

  # ── 4. VALIDATE LLM ─────────────────────────────────────────────
  write_status "validate-llm" "$cycle" "" "model=$MODEL_VAL" \
    "$CYCLE_DIR/03-validate.out.log" "$MODEL_VAL"
  python3 "$ROOT/scripts/factory/lib/assemble_prompt.py" 03-validate-node.md \
    --type "$TYPE" --batch "$BATCH_TAG" --cycle "$cycle" --max-cycles "$MAX_CYCLES" \
    --fix-hints "$FIX_HINTS" \
    --gate-log-file "$CYCLE_DIR/gate.log" \
    -o "$CYCLE_DIR/03-validate.prompt.md"
  {
    echo ""
    echo "## Isolation check"
    echo "FAIL if any n8n package tarball or extracted package was committed or copied into the OpenFlow repo."
    echo ""
    echo "## Output"
    echo "Reply with ONE JSON object only, e.g. {\"type\":\"$TYPE\",\"verdict\":\"pass\",\"reasons\":[\"...\"],\"fix_hints\":[]}"
  } >>"$CYCLE_DIR/03-validate.prompt.md"

  set +e
  run_opencode "$MODEL_VAL" "factory VAL $TYPE c$cycle" \
    "$CYCLE_DIR/03-validate.prompt.md" \
    "Return a single JSON object with verdict pass or fail for $TYPE. Then stop." \
    "$CYCLE_DIR/03-validate.out.log" \
    "$TIMEOUT_VAL"
  VAL_OC_RC=$?
  set -e

  if [[ "$DRY_RUN" -eq 1 ]]; then
    VERDICT="pass"
    HINTS=""
  else
    PARSED=$(parse_verdict "$CYCLE_DIR/03-validate.out.log" || true)
    VERDICT=$(echo "$PARSED" | head -1)
    HINTS=$(echo "$PARSED" | tail -n +2)
    if [[ "$GATE_RC" -ne 0 ]]; then
      VERDICT="fail"
      HINTS="Deterministic gates and/or leak guard failed. See gate.log.
$HINTS"
    fi
    if [[ "$GATE_RC" -eq 0 && "$VERDICT" != "pass" ]]; then
      if grep -q 'TIMEOUT after' "$CYCLE_DIR/03-validate.out.log" 2>/dev/null \
        || grep -q 'no JSON verdict' <<<"$HINTS" 2>/dev/null; then
        if grep -q 'summary ok=' "$CYCLE_DIR/gate.log" 2>/dev/null \
          && ! grep -q 'fail=[1-9]' "$CYCLE_DIR/gate.log" 2>/dev/null; then
          VERDICT="pass"
          HINTS="Validator mute/timeout; deterministic gates passed."
        fi
      fi
    fi
  fi

  echo "$HINTS" >"$FIX_HINTS_FILE"
  echo "$VERDICT" >"$CYCLE_DIR/verdict.txt"
  wipe_corpus

  if [[ "$VERDICT" == "pass" ]]; then
    write_status "pass" "$cycle" "pass"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      python3 "$ROOT/scripts/factory/lib/catalog.py" set-status "$TYPE" \
        --executor implemented --spec specced --factory pass 2>/dev/null || true
    fi
    python3 "$ROOT/scripts/factory/lib/run_state.py" mark "$TYPE" --bucket completed 2>/dev/null || true
    final="pass"
    break
  fi

  write_status "fail" "$cycle" "fail" "cycle $cycle validate failed" \
    "" "" "" "validate_fail"
  python3 - <<PY 2>/dev/null || true
import json
from pathlib import Path
from datetime import datetime, timezone
p=Path("$STATUS_FILE")
d=json.loads(p.read_text()) if p.exists() else {}
d.update({"failedStage":"validate","failReason":"validate_fail","lastStage":"validate-llm",
          "updatedAt":datetime.now(timezone.utc).isoformat()})
p.write_text(json.dumps(d, indent=2)+"\n")
PY
  if [[ "$ONCE" -eq 1 ]]; then
    echo "[factory] --once: stopping after single cycle attempt"
    break
  fi
  # next full cycle restarts at SPEC
  STAGE_CURSOR="spec"
  cycle=$((cycle + 1))
done

wipe_corpus
bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" >/dev/null 2>&1 || true
release_impl_lock 2>/dev/null || true

if [[ "$final" != "pass" ]]; then
  pc="$cycle"
  [[ "$pc" -lt 1 ]] && pc=1
  # Don't clobber interrupted (lock timeout) status
  cur_stage=$(python3 -c "import json;print(json.load(open('$STATUS_FILE')).get('stage',''))" 2>/dev/null || true)
  if [[ "$final" == "interrupted" || "$cur_stage" == "interrupted" ]]; then
    python3 "$ROOT/scripts/factory/lib/run_state.py" mark "$TYPE" --bucket partial 2>/dev/null || true
    echo "RESULT interrupted $TYPE (use TUI y/L to continue)"
    exit 1
  fi
  write_status "partial" "$pc" "fail" "max cycles, once-stop, or lock timeout"
  python3 "$ROOT/scripts/factory/lib/catalog.py" set-status "$TYPE" --factory partial 2>/dev/null || true
  python3 "$ROOT/scripts/factory/lib/run_state.py" mark "$TYPE" --bucket partial 2>/dev/null || true
  echo "RESULT partial $TYPE"
  exit 1
fi

echo "RESULT pass $TYPE"
exit 0
