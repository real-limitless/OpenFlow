#!/usr/bin/env bash
# Gate: SPEC stage produced a usable clean-room spec.
# Usage: gate_spec.sh <type> [agent-log] [agent-exit-code]
# Exit 0 = pass, 1 = fail (prints reason lines to stdout)
#
# Policy: ARTIFACT WINS. If the spec file is acceptable, pass even when the
# agent log contains false-positive "502" / "rate_limit" noise from corpus dumps.
# Agent classify only fails the gate when the artifact is missing/bad.
set -euo pipefail

TYPE="${1:?type}"
AGENT_LOG="${2:-}"
AGENT_EXIT="${3:-0}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

SPEC="docs/specs/nodes/${TYPE}.md"
MIN_BYTES="${FACTORY_MIN_SPEC_BYTES:-500}"
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

# ── Artifact checks (source of truth) ─────────────────────────────
if [[ ! -f "$SPEC" ]]; then
  artifact_reasons+=("spec_missing:missing $SPEC")
else
  bytes=$(wc -c <"$SPEC" | tr -d ' ')
  if [[ "$bytes" -lt "$MIN_BYTES" ]]; then
    artifact_reasons+=("spec_too_short:${bytes}b < ${MIN_BYTES}b minimum")
  fi
  missing=()
  for sec in "Purpose" "Behavior" "Acceptance"; do
    if ! grep -qiE "^#+[[:space:]]*${sec}|^##+.*${sec}" "$SPEC" 2>/dev/null; then
      if ! grep -qi "$sec" "$SPEC" 2>/dev/null; then
        missing+=("$sec")
      fi
    fi
  done
  if [[ "${#missing[@]}" -ge 2 ]]; then
    artifact_reasons+=("spec_thin:missing sections ${missing[*]}")
  fi
  if grep -qiE 'github\.com/n8n-io|n8n-workflow|from ['\''"]n8n' "$SPEC" 2>/dev/null; then
    artifact_reasons+=("spec_forbidden:cites n8n source paths")
  fi
fi

# Artifact OK → pass (agent log noise is ignored)
if [[ "${#artifact_reasons[@]}" -eq 0 ]]; then
  echo "GATE_SPEC_OK type=$TYPE bytes=$(wc -c <"$SPEC" 2>/dev/null | tr -d ' ' || echo 0)"
  if [[ "$agent_ok" != "1" ]]; then
    echo "NOTE agent_noise ignored reason=${agent_reason} class=${agent_class} (artifact acceptable)"
  fi
  echo "CLASS ok"
  exit 0
fi

# Artifact bad — include agent reason as secondary context
reasons=("${artifact_reasons[@]}")
if [[ "$agent_ok" != "1" ]]; then
  reasons+=("agent:${agent_reason}:${agent_message}")
fi

echo "GATE_SPEC_FAIL type=$TYPE"
for r in "${reasons[@]}"; do
  echo "REASON $r"
done
primary="${reasons[0]%%:*}"
echo "PRIMARY $primary"
# Prefer agent class when agent failed; else hard_fail for thin/missing artifact
if [[ "$agent_ok" != "1" ]]; then
  echo "CLASS ${agent_class:-retryable}"
else
  echo "CLASS hard_fail"
fi
exit 1
