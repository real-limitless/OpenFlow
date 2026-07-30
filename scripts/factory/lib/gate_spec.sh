#!/usr/bin/env bash
# Gate: SPEC stage produced a usable clean-room spec.
# Usage: gate_spec.sh <type> [agent-log] [agent-exit-code]
# Exit 0 = pass, 1 = fail (prints reason lines to stdout)
set -euo pipefail

TYPE="${1:?type}"
AGENT_LOG="${2:-}"
AGENT_EXIT="${3:-0}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

SPEC="docs/specs/nodes/${TYPE}.md"
MIN_BYTES="${FACTORY_MIN_SPEC_BYTES:-500}"
reasons=()

if [[ -n "$AGENT_LOG" && -f "$AGENT_LOG" ]]; then
  set +e
  # classify exits 1 on fail — still capture JSON stdout
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

if [[ ! -f "$SPEC" ]]; then
  reasons+=("spec_missing:missing $SPEC")
else
  bytes=$(wc -c <"$SPEC" | tr -d ' ')
  if [[ "$bytes" -lt "$MIN_BYTES" ]]; then
    reasons+=("spec_too_short:${bytes}b < ${MIN_BYTES}b minimum")
  fi
  # Required-ish sections (flexible match)
  missing=()
  for sec in "Purpose" "Behavior" "Acceptance"; do
    if ! grep -qiE "^#+[[:space:]]*${sec}|^##+.*${sec}" "$SPEC" 2>/dev/null; then
      # also allow without heading if keyword appears
      if ! grep -qi "$sec" "$SPEC" 2>/dev/null; then
        missing+=("$sec")
      fi
    fi
  done
  if [[ "${#missing[@]}" -ge 2 ]]; then
    reasons+=("spec_thin:missing sections ${missing[*]}")
  fi
  if grep -qiE 'github\.com/n8n-io|n8n-workflow|from ['\''"]n8n' "$SPEC" 2>/dev/null; then
    reasons+=("spec_forbidden:cites n8n source paths")
  fi
fi

if [[ "${#reasons[@]}" -eq 0 ]]; then
  echo "GATE_SPEC_OK type=$TYPE"
  exit 0
fi

echo "GATE_SPEC_FAIL type=$TYPE"
for r in "${reasons[@]}"; do
  echo "REASON $r"
done
# primary reason code (first token before :)
primary="${reasons[0]%%:*}"
echo "PRIMARY $primary"
echo "CLASS ${agent_class:-hard_fail}"
exit 1
