#!/usr/bin/env bash
# OpenFlow factory batch runner
#   ./scripts/factory/run_batch.sh 05
#   ./scripts/factory/run_batch.sh 05 --dry-run
#   ./scripts/factory/run_batch.sh 05 --concurrency 2
#
# Per node: SPEC (xai/grok-4.5) → IMPL (featherless GLM 5.2) → VAL (xai/grok-4.5)
# Batch size 5, concurrency 2 (IMPL serialized via flock).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BATCH="${1:-}"
shift || true
DRY_RUN=0
CONCURRENCY="${FACTORY_CONCURRENCY:-2}"
TYPES_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --types) TYPES_OVERRIDE="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$BATCH" ]] || { echo "Usage: $0 <batch-id> [--dry-run] [--concurrency N]" >&2; exit 2; }

export FACTORY_MODEL_SPEC="${FACTORY_MODEL_SPEC:-xai/grok-4.5}"
export FACTORY_MODEL_IMPL="${FACTORY_MODEL_IMPL:-featherless/zai-org/GLM-5.2}"
export FACTORY_MODEL_VAL="${FACTORY_MODEL_VAL:-xai/grok-4.5}"
export FACTORY_MAX_CYCLES="${FACTORY_MAX_CYCLES:-3}"

BATCH_JSON=$(python3 "$ROOT/scripts/factory/lib/catalog.py" get-batch "$BATCH")
SLUG=$(echo "$BATCH_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['slug'])")
if [[ -n "$TYPES_OVERRIDE" ]]; then
  mapfile -t TYPES < <(echo "$TYPES_OVERRIDE" | tr ',' '\n' | sed '/^$/d' | head -5)
else
  mapfile -t TYPES < <(echo "$BATCH_JSON" | python3 -c "import sys,json; print('\n'.join(json.load(sys.stdin)['types']))")
fi

if [[ "${#TYPES[@]}" -eq 0 ]]; then
  echo "No types in batch $BATCH" >&2
  exit 1
fi

JOB_ROOT="$ROOT/scripts/factory/.jobs/batch-${BATCH}"
mkdir -p "$JOB_ROOT"
echo "$BATCH_JSON" >"$JOB_ROOT/batch.json"

echo "=========================================="
echo " OpenFlow factory batch $BATCH ($SLUG)"
echo " types (${#TYPES[@]}): ${TYPES[*]}"
echo " concurrency=$CONCURRENCY max_cycles=$FACTORY_MAX_CYCLES"
echo " SPEC=$FACTORY_MODEL_SPEC"
echo " IMPL=$FACTORY_MODEL_IMPL"
echo " VAL=$FACTORY_MODEL_VAL"
echo " dry_run=$DRY_RUN"
echo "=========================================="

PIPELINE="$ROOT/scripts/factory/lib/run_node_pipeline.sh"
chmod +x "$PIPELINE" "$ROOT/scripts/factory/lib/validate_node.sh" \
  "$ROOT/scripts/factory/lib/catalog.py" 2>/dev/null || true

# GNU parallel if present; else xargs -P; else sequential
run_all() {
  local extra=()
  [[ "$DRY_RUN" -eq 1 ]] && extra+=(--dry-run)

  if command -v parallel >/dev/null 2>&1; then
    printf '%s\n' "${TYPES[@]}" | parallel -j "$CONCURRENCY" --halt soon,fail=0 \
      bash "$PIPELINE" --batch "$BATCH" --type {} "${extra[@]}"
    return 0
  fi

  # bash job pool
  local pids=()
  local running=0
  local results=()
  for t in "${TYPES[@]}"; do
    while [[ "$running" -ge "$CONCURRENCY" ]]; do
      if wait -n 2>/dev/null; then
        :
      else
        # bash without wait -n: wait for any
        for pid in "${pids[@]}"; do
          if ! kill -0 "$pid" 2>/dev/null; then
            wait "$pid" || true
            running=$((running - 1))
          fi
        done
        sleep 0.5
      fi
      # recount
      running=0
      local alive=()
      for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
          alive+=("$pid")
          running=$((running + 1))
        fi
      done
      pids=("${alive[@]}")
    done
    (
      bash "$PIPELINE" --batch "$BATCH" --type "$t" "${extra[@]}"
    ) &
    pids+=("$!")
    running=$((running + 1))
  done
  local rc=0
  for pid in "${pids[@]}"; do
    wait "$pid" || rc=1
  done
  return $rc
}

set +e
run_all
POOL_RC=$?
set -e

# Optional hot-reload
if [[ "$DRY_RUN" -eq 0 ]]; then
  curl -sS -X POST "${FACTORY_API:-http://localhost:3000}/api/v1/dev/reload-nodes" \
    >/dev/null 2>&1 || true
fi

# Batch-level test
echo "---- batch tests ----"
set +e
bash "$ROOT/scripts/factory/test-batch.sh" "$BATCH"
TEST_RC=$?
set -e

# Summary
echo "---- status summary ----"
for t in "${TYPES[@]}"; do
  SAFE="${t//\//_}"
  sf="$JOB_ROOT/$SAFE/status.json"
  if [[ -f "$sf" ]]; then
    python3 -c "import json;d=json.load(open('$sf'));print(d.get('stage'), d.get('verdict'), d.get('type'))"
  else
    echo "missing-status $t"
  fi
done

REPORT="$JOB_ROOT/report.md"
{
  echo "# Factory batch $BATCH ($SLUG)"
  echo
  echo "- concurrency: $CONCURRENCY"
  echo "- models: SPEC=\`$FACTORY_MODEL_SPEC\` IMPL=\`$FACTORY_MODEL_IMPL\` VAL=\`$FACTORY_MODEL_VAL\`"
  echo "- dry_run: $DRY_RUN"
  echo "- pool_rc: $POOL_RC test_rc: $TEST_RC"
  echo
  echo "| Type | Stage | Verdict |"
  echo "|------|-------|---------|"
  for t in "${TYPES[@]}"; do
    SAFE="${t//\//_}"
    sf="$JOB_ROOT/$SAFE/status.json"
    if [[ -f "$sf" ]]; then
      python3 -c "import json;d=json.load(open('$sf'));print(f\"| \`{d.get('type')}\` | {d.get('stage')} | {d.get('verdict')} |\")"
    else
      echo "| \`$t\` | - | missing |"
    fi
  done
} >"$REPORT"

echo "Report: $REPORT"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry-run complete."
  exit 0
fi

if [[ "$POOL_RC" -ne 0 || "$TEST_RC" -ne 0 ]]; then
  echo "Batch finished with failures (pool=$POOL_RC tests=$TEST_RC)"
  exit 1
fi
echo "Batch $BATCH complete."
exit 0
