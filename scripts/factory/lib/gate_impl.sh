#!/usr/bin/env bash
# Gate: IMPLEMENT produced registration + executor (lighter than full validate).
# Usage: gate_impl.sh <type> [agent-log] [agent-exit-code]
set -euo pipefail

TYPE="${1:?type}"
AGENT_LOG="${2:-}"
AGENT_EXIT="${3:-0}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

reasons=()

if [[ -n "$AGENT_LOG" && -f "$AGENT_LOG" ]]; then
  set +e
  clf=$(python3 "$ROOT/scripts/factory/lib/classify_agent.py" --log "$AGENT_LOG" --exit-code "$AGENT_EXIT" --json 2>/dev/null)
  set -e
  [[ -z "$clf" ]] && clf='{"ok":true,"class":"ok","reason":"ok","message":""}'
  agent_ok=$(python3 -c "import json,sys;print('1' if json.loads(sys.argv[1]).get('ok') else '0')" "$clf" 2>/dev/null || echo 1)
  agent_reason=$(python3 -c "import json,sys;print(json.loads(sys.argv[1]).get('reason') or 'ok')" "$clf" 2>/dev/null || echo ok)
  agent_message=$(python3 -c "import json,sys;print(json.loads(sys.argv[1]).get('message') or '')" "$clf" 2>/dev/null || echo "")
  agent_class=$(python3 -c "import json,sys;print(json.loads(sys.argv[1]).get('class') or 'ok')" "$clf" 2>/dev/null || echo ok)
  if [[ "$agent_ok" != "1" ]]; then
    reasons+=("agent:${agent_reason}:${agent_message}")
  fi
fi

# Spec must still exist (do not implement into void)
SPEC="docs/specs/nodes/${TYPE}.md"
if [[ ! -f "$SPEC" ]]; then
  reasons+=("spec_missing:no spec for implement gate")
fi

SUFFIX="${TYPE##*.}"
KEBAB=$(echo "$SUFFIX" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')
FOUND_EXEC=""
for f in \
  "src/lib/engine/executors/${KEBAB}.ts" \
  "src/lib/engine/executors/${SUFFIX}.ts"; do
  if [[ -f "$f" ]]; then FOUND_EXEC="$f"; break; fi
done
if [[ -z "$FOUND_EXEC" ]]; then
  hit=$(grep -rl "\"${TYPE}\"" src/lib/engine/executors 2>/dev/null | head -1 || true)
  [[ -n "$hit" ]] && FOUND_EXEC="$hit"
fi
if [[ -z "$FOUND_EXEC" ]]; then
  reasons+=("impl_no_executor:no executor file for $TYPE")
else
  if grep -qE "from ['\"]n8n|n8n-workflow|n8n-core" "$FOUND_EXEC" 2>/dev/null; then
    reasons+=("impl_n8n_import:executor imports n8n packages")
  fi
fi

if ! grep -q "\"${TYPE}\"" src/lib/engine/executors/index.ts 2>/dev/null; then
  reasons+=("impl_not_registered:not in executors/index.ts")
fi
if ! grep -q "\"${TYPE}\"" src/lib/engine/node-runtime.ts 2>/dev/null; then
  reasons+=("impl_not_in_runtime:not in node-runtime.ts")
fi

if [[ "${#reasons[@]}" -eq 0 ]]; then
  echo "GATE_IMPL_OK type=$TYPE exec=${FOUND_EXEC}"
  exit 0
fi

echo "GATE_IMPL_FAIL type=$TYPE"
for r in "${reasons[@]}"; do
  echo "REASON $r"
done
primary="${reasons[0]%%:*}"
echo "PRIMARY $primary"
echo "CLASS ${agent_class:-hard_fail}"
exit 1
