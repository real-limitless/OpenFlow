#!/usr/bin/env bash
# Gate: IMPLEMENT produced registration + executor (lighter than full validate).
# Usage: gate_impl.sh <type> [agent-log] [agent-exit-code]
#
# Policy: ARTIFACT WINS. If executor + registrations are present and clean,
# pass even when the agent log has false-positive provider/rate-limit noise.
# Agent classify only fails the gate when artifacts are missing/bad.
set -euo pipefail

TYPE="${1:?type}"
AGENT_LOG="${2:-}"
AGENT_EXIT="${3:-0}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

artifact_reasons=()
agent_ok=1
agent_reason="ok"
agent_message=""
agent_class="ok"

if [[ -n "$AGENT_LOG" && -f "$AGENT_LOG" ]]; then
  set +e
  clf=$(python3 "$ROOT/scripts/factory/lib/classify_agent.py" --log "$AGENT_LOG" --exit-code "$AGENT_EXIT" --json 2>/dev/null)
  set -e
  [[ -z "$clf" ]] && clf='{"ok":true,"class":"ok","reason":"ok","message":""}'
  agent_ok=$(python3 -c "import json,sys;print('1' if json.loads(sys.argv[1]).get('ok') else '0')" "$clf" 2>/dev/null || echo 1)
  agent_reason=$(python3 -c "import json,sys;print(json.loads(sys.argv[1]).get('reason') or 'ok')" "$clf" 2>/dev/null || echo ok)
  agent_message=$(python3 -c "import json,sys;print(json.loads(sys.argv[1]).get('message') or '')" "$clf" 2>/dev/null || echo "")
  agent_class=$(python3 -c "import json,sys;print(json.loads(sys.argv[1]).get('class') or 'ok')" "$clf" 2>/dev/null || echo ok)
fi

# Spec must still exist (do not implement into void)
SPEC="docs/specs/nodes/${TYPE}.md"
if [[ ! -f "$SPEC" ]]; then
  artifact_reasons+=("spec_missing:no spec for implement gate")
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
  # single or double quotes around type string
  hit=$(grep -rlE "['\"]${TYPE}['\"]" src/lib/engine/executors 2>/dev/null | head -1 || true)
  [[ -n "$hit" ]] && FOUND_EXEC="$hit"
fi
if [[ -z "$FOUND_EXEC" ]]; then
  artifact_reasons+=("impl_no_executor:no executor file for $TYPE")
else
  if grep -qE "from ['\"]n8n|n8n-workflow|n8n-core" "$FOUND_EXEC" 2>/dev/null; then
    artifact_reasons+=("impl_n8n_import:executor imports n8n packages")
  fi
fi

# Registration: BUILTIN_EXECUTOR_MODULES in node-runtime.ts is the ONLY seed list.
# executors/index.ts is a self-maintaining barrel that eagerly globs that list; jobs
# must not edit it, so it is not consulted here.
type_re="['\"]${TYPE}['\"]"
if ! grep -qE "${type_re}" src/lib/engine/node-runtime.ts 2>/dev/null; then
  artifact_reasons+=("impl_not_in_runtime:not in node-runtime.ts BUILTIN_EXECUTOR_MODULES")
fi

# The barrel must stay generic. A job that hand-registers its type there has
# reintroduced the per-node edit the glob exists to remove.
if grep -qE "${type_re}" src/lib/engine/executors/index.ts 2>/dev/null; then
  artifact_reasons+=("impl_edited_barrel:executors/index.ts must not mention ${TYPE}")
fi
if grep -qE "${type_re}" src/lib/nodes/registry.ts 2>/dev/null; then
  artifact_reasons+=("impl_edited_registry:registry.ts must not mention ${TYPE}")
fi

# Artifact OK → pass
if [[ "${#artifact_reasons[@]}" -eq 0 ]]; then
  echo "GATE_IMPL_OK type=$TYPE exec=${FOUND_EXEC}"
  if [[ "$agent_ok" != "1" ]]; then
    echo "NOTE agent_noise ignored reason=${agent_reason} class=${agent_class} (artifact acceptable)"
  fi
  echo "CLASS ok"
  exit 0
fi

reasons=("${artifact_reasons[@]}")
if [[ "$agent_ok" != "1" ]]; then
  reasons+=("agent:${agent_reason}:${agent_message}")
fi

echo "GATE_IMPL_FAIL type=$TYPE"
for r in "${reasons[@]}"; do
  echo "REASON $r"
done
primary="${reasons[0]%%:*}"
echo "PRIMARY $primary"
if [[ "$agent_ok" != "1" && "$primary" == "agent" ]]; then
  echo "CLASS ${agent_class:-retryable}"
elif [[ "$agent_ok" != "1" ]]; then
  # artifact failed; still surface agent class for retry policy
  echo "CLASS ${agent_class:-hard_fail}"
else
  echo "CLASS hard_fail"
fi
exit 1
