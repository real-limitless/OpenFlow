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

# vitest output goes to $LOG, but only this script's stdout is captured into the
# cycle's gate.log, which is the sole thing distilled into fix_hints.txt. So a
# test failure reached IMPLEMENT as the bare line "vitest on referencing files
# failed" -- nothing about which assertion broke. The agent would then re-verify
# wiring, find it correct, conclude "no changes needed", and the node would fail
# the identical gate every cycle. Echo the failing assertions so the hint is
# actionable.
emit_test_failures() {
  local detail
  detail=$(
    sed -E "s/$(printf '\033')\[[0-9;]*[a-zA-Z]//g" "$LOG" 2>/dev/null \
      | grep -E '^[[:space:]]*×|^[[:space:]]*(AssertionError|Error|TypeError|ReferenceError|SyntaxError):|^[[:space:]]*❯[[:space:]].*\.tsx?:[0-9]+|^[[:space:]]*(Test Files|Tests)[[:space:]]' \
      | sed -E 's/^[[:space:]]+//' \
      | awk '!seen[$0]++' \
      | head -30
  ) || true
  [[ -n "$detail" ]] || return 0
  while IFS= read -r line; do
    log "TESTFAIL $line"
  done <<<"$detail"
}

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
# Third convention: the fully-qualified type as the filename, with the @n8n/
# scope prefix dropped on disk (see node-runtime.ts modulePath entries).
BARE="${TYPE#@n8n/}"
EXEC_CANDIDATES=(
  "src/lib/engine/executors/${KEBAB}.ts"
  "src/lib/engine/executors/${SUFFIX}.ts"
  "src/lib/engine/executors/${BARE}.ts"
)
FOUND_EXEC=""
for f in "${EXEC_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then FOUND_EXEC="$f"; break; fi
done
# also search by type string inside executors (single or double quotes)
if [[ -z "$FOUND_EXEC" ]]; then
  hit=$(grep -rlE "['\"]${TYPE}['\"]" src/lib/engine/executors 2>/dev/null | head -1 || true)
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

# 3. Registration. BUILTIN_EXECUTOR_MODULES is the only seed list; executors/index.ts
# is a self-maintaining barrel that eagerly globs it and must stay free of node names.
type_re="['\"]${TYPE}['\"]"
if grep -qE "${type_re}" src/lib/engine/node-runtime.ts 2>/dev/null; then
  pass "listed in node-runtime BUILTIN_EXECUTOR_MODULES"
else
  bad "not in node-runtime BUILTIN_EXECUTOR_MODULES"
fi
if grep -qE "${type_re}" src/lib/engine/executors/index.ts 2>/dev/null; then
  bad "executors/index.ts must not mention ${TYPE} (barrel is generic; register in node-runtime only)"
else
  pass "executors/index.ts left generic"
fi
if grep -qE "${type_re}" src/lib/nodes/registry.ts 2>/dev/null; then
  bad "registry.ts must not mention ${TYPE} (descriptions seed from definitions/ automatically)"
else
  pass "registry.ts left generic"
fi

# 4. Runtime registration via ESM .mts (tsx -e is CJS; breaks top-level await)
#
# register-builtins.ts is generated from BUILTIN_EXECUTOR_MODULES and is what the
# check below imports, but nothing in the factory pipeline runs the generator --
# it is wired into `npm run build` only. A job that correctly added its entry to
# node-runtime.ts would still report `hasExecutor false` whenever the generated
# file happened to be stale, so regenerate first. This is deterministic and reads
# node-runtime.ts as its only input, so it cannot mask a missing manifest entry.
# Retry once: these gates run unlocked, so a concurrent IMPLEMENT agent may be
# mid-write to node-runtime.ts, leaving the manifest parser with a truncated
# array. A genuine parser bug still fails both attempts.
if node "$ROOT/scripts/generate-executor-register.mjs" >>"$LOG" 2>&1 \
  || { sleep 3; node "$ROOT/scripts/generate-executor-register.mjs" >>"$LOG" 2>&1; }; then
  pass "register-builtins.ts in sync with BUILTIN_EXECUTOR_MODULES"
else
  bad "register-builtins.ts generation failed (see log)"
fi

REG_TS_ROOT="$ROOT/scripts/factory/.jobs/tmp/reg-check-${SAFE_TYPE}.mts"
mkdir -p "$(dirname "$REG_TS_ROOT")"
# Write checker next to src/ so relative imports resolve under tsx ESM
cat >"$REG_TS_ROOT" <<EOF
import { hasExecutor } from "${ROOT}/src/lib/engine/node-runtime.ts";
// register-builtins.ts has an eager side effect that populates the executor
// map via the real seedBuiltinExecutors(); reloadBuiltinExecutors() in
// node-runtime.ts is a no-op stub.
import "${ROOT}/src/lib/engine/executors/register-builtins.ts";
import {
  seedBuiltinDescriptions,
  getNodeType,
} from "${ROOT}/src/lib/nodes/registry.ts";

const t = ${TYPE@Q};
seedBuiltinDescriptions();
if (!hasExecutor(t)) {
  console.error("hasExecutor false for", t);
  process.exit(2);
}
const d = getNodeType(t);
if (!d || (d as { placeholder?: boolean }).placeholder) {
  console.error("placeholder or missing description", t, d);
  process.exit(3);
}
console.log("runtime ok", t, d.displayName);
EOF

if (cd "$ROOT" && npx --yes tsx "$REG_TS_ROOT") >>"$LOG" 2>&1; then
  pass "runtime hasExecutor + non-placeholder description"
else
  bad "runtime registration check failed (see log)"
fi
rm -f "$REG_TS_ROOT" 2>/dev/null || true

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
      emit_test_failures
    fi
  else
    # run matching test files
    if npx vitest run $TEST_HITS >>"$LOG" 2>&1; then
      pass "vitest on referencing files green"
    else
      bad "vitest on referencing files failed"
      emit_test_failures
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
