#!/usr/bin/env bash
# Background worker: drain pending queue with concurrency.
# Per-job model overrides via resolve_models.py
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
JOBS="$ROOT/scripts/factory/.jobs"
STATE="$JOBS/run-state.json"
PIDFILE="$JOBS/factory.pid"
RESOLVE="$ROOT/scripts/factory/lib/resolve_models.py"

echo $$ >"$PIDFILE"
python3 "$ROOT/scripts/factory/lib/run_state.py" set-status running --pid $$ --pgid $$

# Factory-wide settings (concurrency / cycles / impl lock)
eval "$(python3 "$RESOLVE" resolve --shell 2>/dev/null || true)"
export FACTORY_MAX_CYCLES="${FACTORY_MAX_CYCLES:-3}"
export FACTORY_IMPL_LOCK="${FACTORY_IMPL_LOCK:-1}"
export FACTORY_RUN_ID
FACTORY_RUN_ID=$(python3 -c "import json;print(json.load(open('$STATE')).get('runId') or 'run-unknown')")
CONC=$(python3 -c "import json;print(int(json.load(open('$STATE')).get('concurrency') or 2))")
# prefer settings.json if present
CONC=$(python3 -c "
import sys
from pathlib import Path
sys.path.insert(0, str(Path('scripts/factory/lib').resolve()))
from resolve_models import load_settings
import json
s=load_settings()
st=json.load(open('$STATE'))
print(int(st.get('concurrency') or s.get('concurrency') or 2))
" 2>/dev/null || echo "$CONC")
DRY_RUN="${FACTORY_DRY_RUN:-0}"

echo "[queue_worker] runId=$FACTORY_RUN_ID concurrency=$CONC dry=$DRY_RUN max_cycles=$FACTORY_MAX_CYCLES impl_lock=$FACTORY_IMPL_LOCK"
echo "[queue_worker] global defaults SPEC=${FACTORY_MODEL_SPEC:-?} IMPL=${FACTORY_MODEL_IMPL:-?} VAL=${FACTORY_MODEL_VAL:-?}"

cleanup() {
  python3 "$ROOT/scripts/factory/lib/run_state.py" set-status idle 2>/dev/null || true
  rm -f "$PIDFILE"
  case "$FACTORY_RUN_ID" in
    run-*) rm -rf "/tmp/openflow-factory-${FACTORY_RUN_ID}" 2>/dev/null || true ;;
  esac
  bash "$ROOT/scripts/factory/lib/assert_no_n8n_in_repo.sh" >/dev/null 2>&1 || true
}
trap cleanup EXIT

while true; do
  mapfile -t PENDING < <(python3 "$ROOT/scripts/factory/lib/run_state.py" pending)
  if [[ "${#PENDING[@]}" -eq 0 || -z "${PENDING[0]:-}" ]]; then
    echo "[queue_worker] queue empty"
    break
  fi

  pids=()
  started=0
  for t in "${PENDING[@]}"; do
    [[ -z "$t" ]] && continue
    [[ "$started" -ge "$CONC" ]] && break
    extra=()
    [[ "$DRY_RUN" == "1" ]] && extra+=(--dry-run)
    python3 "$ROOT/scripts/factory/lib/run_state.py" mark "$t" --bucket active || true
    (
      # Per-job model resolution (job override > global)
      eval "$(python3 "$RESOLVE" resolve --type "$t" --shell)"
      export FACTORY_MAX_CYCLES FACTORY_IMPL_LOCK
      echo "[queue_worker] start $t SPEC=$FACTORY_MODEL_SPEC IMPL=$FACTORY_MODEL_IMPL VAL=$FACTORY_MODEL_VAL"
      bash "$ROOT/scripts/factory/lib/run_node_pipeline.sh" \
        --type "$t" \
        --run-id "$FACTORY_RUN_ID" \
        --batch queue \
        "${extra[@]}"
    ) >>"$JOBS/factory.log" 2>&1 &
    pids+=("$!")
    started=$((started + 1))
  done

  for pid in "${pids[@]}"; do
    wait "$pid" || true
  done

  python3 - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, str(Path("scripts/factory/lib").resolve()))
from run_state import load_state, save_state, build_pending
s = load_state()
s["pending"] = build_pending(include_partial=True)
s["active"] = []
save_state(s)
print("[queue_worker] pending left", len(s["pending"]))
PY
done

echo "[queue_worker] done"
