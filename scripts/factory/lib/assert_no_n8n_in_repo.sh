#!/usr/bin/env bash
# Fail if n8n package artifacts appear inside the git repo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

bad=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  echo "LEAK: $f" >&2
  bad=1
done < <(find . \
  \( -path ./node_modules -o -path ./.git -o -path ./scripts/factory/.jobs \) -prune -o \
  \( -name 'n8n-nodes-base*.tgz' -o -name 'n8n-nodes-base-*.tgz' -o -name 'openflow-factory-*' \) -print 2>/dev/null | head -50)

if [[ -d ./n8n-nodes-base || -d ./package/nodes ]]; then
  echo "LEAK: n8n package directory in repo root" >&2
  bad=1
fi

if grep -E '"(n8n|n8n-nodes-base|n8n-workflow|n8n-core)"' package.json 2>/dev/null | grep -q .; then
  echo "LEAK: n8n dependency in package.json" >&2
  bad=1
fi

if [[ "$bad" -ne 0 ]]; then
  exit 1
fi
echo "OK: no n8n package artifacts in repo"
