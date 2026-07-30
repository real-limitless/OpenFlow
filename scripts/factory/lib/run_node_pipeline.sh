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
LOCK_WAIT="${FACTORY_IMPL_LOCK_WAIT:-1800}"      # 30m max wait for impl lock
IMPL_LOCK="${FACTORY_IMPL_LOCK:-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type) TYPE="$2"; shift 2 ;;
    --batch) BATCH_TAG="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --max-cycles) MAX_CYCLES="$2"; shift 2 ;;
    --run-id) RUN_ID="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$TYPE" ]] || { echo "need --type" >&2; exit 2; }

# Fill models from job override / global if env not already set by parent
if [[ -z "${FACTORY_MODEL_SPEC:-}" || -z "${FACTORY_MODEL_IMPL:-}" || -z "${FACTORY_MODEL_VAL:-}" ]]; then
  eval "$(python3 "$ROOT/scripts/factory/lib/resolve_models.py" resolve --type "$TYPE" --shell 2>/dev/null || true)"
  MODEL_SPEC="${FACTORY_MODEL_SPEC:-$MODEL_SPEC}"
  MODEL_IMPL="${FACTORY_MODEL_IMPL:-$MODEL_IMPL}"
  MODEL_VAL="${FACTORY_MODEL_VAL:-$MODEL_VAL}"
  MAX_CYCLES="${FACTORY_MAX_CYCLES:-$MAX_CYCLES}"
  IMPL_LOCK="${FACTORY_IMPL_LOCK:-$IMPL_LOCK}"
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

write_status() {
  local stage="$1" cycle="$2" verdict="${3:-}" detail="${4:-}"
  local stage_log="${5:-}"
  local model="${6:-}"
  local oc_pid="${7:-}"
  DETAIL="$detail" STAGE_LOG="$stage_log" MODEL="$model" OC_PID="$oc_pid" \
  PIPE_PID="$$" python3 - <<PY
import json, os
from pathlib import Path
from datetime import datetime, timezone
p = Path("$STATUS_FILE")
prev = {}
if p.exists():
    try: prev = json.loads(p.read_text())
    except Exception: pass
data = {
  **prev,
  "type": "$TYPE",
  "batch": "$BATCH_TAG",
  "runId": "$RUN_ID",
  "stage": "$stage",
  "cycle": int("$cycle"),
  "verdict": ("""$verdict""" or None) or None,
  "detail": os.environ.get("DETAIL") or None,
  "pipelinePid": int(os.environ.get("PIPE_PID") or 0) or None,
  "pid": int(os.environ.get("PIPE_PID") or 0) or None,
  "updatedAt": datetime.now(timezone.utc).isoformat(),
}
sl = os.environ.get("STAGE_LOG") or ""
if sl:
    data["stageLog"] = sl
elif "$stage" in ("pass", "fail", "partial", "skipped", "queued", "interrupted"):
    data["stageLog"] = None
    data["opencodePid"] = None
m = os.environ.get("MODEL") or ""
if m:
    data["model"] = m
oc = os.environ.get("OC_PID") or ""
if oc.isdigit():
    data["opencodePid"] = int(oc)
if Path("$CORPUS_DIR").exists():
    data["corpusPath"] = "$CORPUS_DIR"
else:
    data["corpusPath"] = None
p.write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({k: data.get(k) for k in ("type","stage","cycle","verdict","detail","model","stageLog","pipelinePid","opencodePid")}))
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

  : >"$out_log"
  set +e
  # Heartbeat while running
  (
    while true; do
      date -u +%Y-%m-%dT%H:%M:%SZ >"$HEARTBEAT_FILE" 2>/dev/null || true
      sleep 10
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
  "${runner[@]}" >"$out_log" 2>&1 &
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
  mkdir -p "$(dirname "$LOCK")"
  exec 9>"$LOCK"
  if ! command -v flock >/dev/null 2>&1; then
    return 0
  fi
  write_status "implement-wait" "$cycle" "" "waiting for impl.lock (shared registry files)"
  echo "[factory] $TYPE waiting for impl.lock (max ${LOCK_WAIT}s)" >&2
  if ! flock -w "$LOCK_WAIT" -x 9; then
    echo "[factory] $TYPE failed to acquire impl.lock within ${LOCK_WAIT}s" >&2
    write_status "fail" "$cycle" "fail" "impl.lock timeout"
    return 1
  fi
  echo "$TYPE $$ $(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$LOCK_META"
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

cycle=1
final="partial"
while [[ "$cycle" -le "$MAX_CYCLES" ]]; do
  echo "======== $TYPE cycle $cycle/$MAX_CYCLES run=$RUN_ID ========"
  CYCLE_DIR="$JOB_ROOT/cycle-${cycle}"
  mkdir -p "$CYCLE_DIR"
  FIX_HINTS="$(cat "$FIX_HINTS_FILE" 2>/dev/null || true)"

  # ── 1. SPEC corpus (tmp only) ───────────────────────────────────
  write_status "spec-corpus" "$cycle"
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

  run_opencode "$MODEL_SPEC" "factory SPEC $TYPE c$cycle" \
    "$CYCLE_DIR/01-spec.prompt.md" \
    "Execute the SPEC job for $TYPE. Use CORPUS_DIR only if present under /tmp. Write docs/specs/nodes/${TYPE}.md. Never copy n8n package files into the repo. Stop when done." \
    "$CYCLE_DIR/01-spec.out.log" \
    "$TIMEOUT_SPEC" || true

  wipe_corpus
  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" \
    >"$CYCLE_DIR/leak-after-spec.log" 2>&1 || {
      echo "LEAK DETECTED after SPEC" >&2
      cat "$CYCLE_DIR/leak-after-spec.log" >&2 || true
    }

  # ── 2. IMPLEMENT (serialized via lock — shared registry files) ──
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

  if [[ "$DRY_RUN" -eq 1 ]]; then
    write_status "implement" "$cycle" "" "dry-run model=$MODEL_IMPL" \
      "$CYCLE_DIR/02-implement.out.log" "$MODEL_IMPL"
    run_opencode "$MODEL_IMPL" "factory IMPL $TYPE c$cycle" \
      "$CYCLE_DIR/02-implement.prompt.md" \
      "dry-run" \
      "$CYCLE_DIR/02-implement.out.log" \
      1 || true
  else
    if [[ "$IMPL_LOCK" == "1" || "$IMPL_LOCK" == "true" ]]; then
      write_status "implement-wait" "$cycle" "" "waiting for impl.lock"
      if ! acquire_impl_lock; then
        final="partial"
        break
      fi
      trap 'release_impl_lock' EXIT
      write_status "implement" "$cycle" "" "model=$MODEL_IMPL lock=held" \
        "$CYCLE_DIR/02-implement.out.log" "$MODEL_IMPL"
    else
      write_status "implement" "$cycle" "" "model=$MODEL_IMPL lock=off" \
        "$CYCLE_DIR/02-implement.out.log" "$MODEL_IMPL"
    fi

    run_opencode "$MODEL_IMPL" "factory IMPL $TYPE c$cycle" \
      "$CYCLE_DIR/02-implement.prompt.md" \
      "Implement $TYPE from its spec and SDK only. No n8n packages. Register + tests. Stop when done." \
      "$CYCLE_DIR/02-implement.out.log" \
      "$TIMEOUT_IMPL" || true

    if [[ "$IMPL_LOCK" == "1" || "$IMPL_LOCK" == "true" ]]; then
      release_impl_lock
      trap - EXIT
    fi
  fi

  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" \
    >"$CYCLE_DIR/leak-after-impl.log" 2>&1 || true

  # ── 3. Deterministic gates ──────────────────────────────────────
  write_status "validate-gates" "$cycle"
  set +e
  bash "$ROOT/scripts/factory/lib/validate_node.sh" "$TYPE" "" \
    >"$CYCLE_DIR/gate.log" 2>&1
  GATE_RC=$?
  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" >>"$CYCLE_DIR/gate.log" 2>&1
  LEAK_RC=$?
  set -e
  if [[ "$LEAK_RC" -ne 0 ]]; then GATE_RC=1; fi
  cp "$CYCLE_DIR/gate.log" "$JOB_ROOT/gate-latest.log" 2>/dev/null || true

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

  run_opencode "$MODEL_VAL" "factory VAL $TYPE c$cycle" \
    "$CYCLE_DIR/03-validate.prompt.md" \
    "Return a single JSON object with verdict pass or fail for $TYPE. Then stop." \
    "$CYCLE_DIR/03-validate.out.log" \
    "$TIMEOUT_VAL" || true

  if [[ "$DRY_RUN" -eq 1 ]]; then
    VERDICT="pass"
    HINTS=""
  else
    PARSED=$(parse_verdict "$CYCLE_DIR/03-validate.out.log" || true)
    VERDICT=$(echo "$PARSED" | head -1)
    HINTS=$(echo "$PARSED" | tail -n +2)
    # If gates green and LLM said pass → pass. If gates red → fail.
    if [[ "$GATE_RC" -ne 0 ]]; then
      VERDICT="fail"
      HINTS="Deterministic gates and/or leak guard failed. See gate.log.
$HINTS"
    fi
    # If gates green and LLM timed out / no verdict, trust gates
    if [[ "$GATE_RC" -eq 0 && "$VERDICT" != "pass" ]]; then
      if grep -q 'TIMEOUT after' "$CYCLE_DIR/03-validate.out.log" 2>/dev/null \
        || grep -q 'no JSON verdict' <<<"$HINTS" 2>/dev/null; then
        # Prefer gate success when validator is mute/timeout
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

  write_status "fail" "$cycle" "fail" "cycle $cycle failed"
  cycle=$((cycle + 1))
done

wipe_corpus
bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" >/dev/null 2>&1 || true
release_impl_lock 2>/dev/null || true

if [[ "$final" != "pass" ]]; then
  write_status "partial" "$((cycle - 1))" "fail" "max cycles or lock timeout"
  python3 "$ROOT/scripts/factory/lib/catalog.py" set-status "$TYPE" --factory partial 2>/dev/null || true
  python3 "$ROOT/scripts/factory/lib/run_state.py" mark "$TYPE" --bucket partial 2>/dev/null || true
  echo "RESULT partial $TYPE"
  exit 1
fi

echo "RESULT pass $TYPE"
exit 0
