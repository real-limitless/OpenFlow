#!/usr/bin/env bash
# Deterministic gates for one node type.
# Usage: validate_node.sh <type> [batch-id]
set -euo pipefail

TYPE="${1:?type required e.g. n8n-nodes-base.summarize}"
BATCH="${2:-}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

SAFE_TYPE="${TYPE//\//_}"
SPEC="docs/specs/nodes/${TYPE}.md"
LOG_DIR="${FACTORY_JOB_DIR:-$ROOT/scripts/factory/.jobs/tmp}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/gate-${SAFE_TYPE}.log"
: >"$LOG"

ok=0
fail=0

log() { echo "$*" | tee -a "$LOG"; }

pass() { log "OK  $*"; ok=$((ok + 1)); }
bad() { log "FAIL $*"; fail=$((fail + 1)); }

log "=== validate_node $TYPE batch=${BATCH:-?} ==="
log "repo=$ROOT"
log "time=$(date -Iseconds)"

# 1. Spec exists
if [[ -f "$SPEC" ]]; then
  pass "spec exists: $SPEC"
  if grep -qiE 'github\.com/n8n-io|n8n-workflow' "$SPEC"; then
    bad "spec cites forbidden n8n source paths"
  else
    pass "spec has no forbidden n8n source URLs"
  fi
else
  bad "missing spec $SPEC"
fi

# 2. Executor source file (heuristic kebab from type suffix)
SUFFIX="${TYPE##*.}"
# camelCase to kebab rough
KEBAB=$(echo "$SUFFIX" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')
EXEC_CANDIDATES=(
  "src/lib/engine/executors/${KEBAB}.ts"
  "src/lib/engine/executors/${SUFFIX}.ts"
)
FOUND_EXEC=""
for f in "${EXEC_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then FOUND_EXEC="$f"; break; fi
done
# also search by type string inside executors
if [[ -z "$FOUND_EXEC" ]]; then
  hit=$(grep -rl "\"${TYPE}\"" src/lib/engine/executors 2>/dev/null | head -1 || true)
  if [[ -n "$hit" ]]; then FOUND_EXEC="$hit"; fi
fi
if [[ -n "$FOUND_EXEC" ]]; then
  pass "executor file: $FOUND_EXEC"
  if grep -qE "from ['\"]n8n|n8n-workflow|n8n-core" "$FOUND_EXEC" 2>/dev/null; then
    bad "executor imports n8n packages"
  else
    pass "executor has no n8n package imports"
  fi
else
  bad "no executor file found for $TYPE"
fi

# 3. Registration in seed lists
if grep -q "\"${TYPE}\"" src/lib/engine/executors/index.ts 2>/dev/null; then
  pass "registered in executors/index.ts"
else
  bad "not in executors/index.ts BUILTIN_PAIRS"
fi
if grep -q "\"${TYPE}\"" src/lib/engine/node-runtime.ts 2>/dev/null; then
  pass "listed in node-runtime BUILTIN_EXECUTOR_MODULES"
else
  bad "not in node-runtime BUILTIN_EXECUTOR_MODULES"
fi

# 4. Runtime registration via vitest one-liner
if npx vitest run src/lib/engine/__tests__/helpers.ts 2>/dev/null; then
  :
fi
REG_TEST="$LOG_DIR/reg-${SAFE_TYPE}.mjs"
cat >"$REG_TEST" <<EOF
import { createRequire } from "node:module";
// Use vitest programmatically is heavy; shell out to a tiny vitest inline instead
EOF

# Use node + tsx to import seed
if npx --yes tsx -e "
import { seedBuiltinExecutors } from './src/lib/engine/executors/index.ts';
import { hasExecutor } from './src/lib/engine/node-runtime.ts';
import { seedBuiltinDescriptions, getNodeType } from './src/lib/nodes/registry.ts';
seedBuiltinExecutors();
seedBuiltinDescriptions();
const t = process.argv[1];
if (!hasExecutor(t)) { console.error('hasExecutor false'); process.exit(2); }
const d = getNodeType(t);
if (d.placeholder) { console.error('placeholder description'); process.exit(3); }
console.log('runtime ok', t, d.displayName);
" "$TYPE" >>"$LOG" 2>&1; then
  pass "runtime hasExecutor + non-placeholder description"
else
  bad "runtime registration check failed (see log)"
fi

# 5. Tests mentioning type
TEST_HITS=$(grep -rl "$TYPE" src/lib/engine/__tests__ 2>/dev/null | head -5 || true)
if [[ -n "$TEST_HITS" ]]; then
  pass "tests reference type: $(echo "$TEST_HITS" | tr '\n' ' ')"
  # Run batch test file if batch provided
  if [[ -n "$BATCH" ]]; then
    if bash scripts/factory/test-batch.sh "$BATCH" >>"$LOG" 2>&1; then
      pass "test:batch $BATCH green"
    else
      bad "test:batch $BATCH failed"
    fi
  else
    # run matching test files
    if npx vitest run $TEST_HITS >>"$LOG" 2>&1; then
      pass "vitest on referencing files green"
    else
      bad "vitest on referencing files failed"
    fi
  fi
else
  bad "no tests under src/lib/engine/__tests__ mention $TYPE"
fi

log "=== summary ok=$ok fail=$fail ==="
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
exit 0
