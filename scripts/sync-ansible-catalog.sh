#!/usr/bin/env bash
# Sync ansible-flow-mcp catalog → OpenFlow data/ansible-catalog (lazy-loaded by API).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ANSIBLE_FLOW_MCP_CATALOG:-$ROOT/../ansible-flow-mcp/catalog}"
DST="${OPENFLOW_ANSIBLE_CATALOG_DIR:-$ROOT/data/ansible-catalog}"
if [[ ! -d "$SRC" ]]; then
  echo "Source catalog not found: $SRC" >&2
  echo "Set ANSIBLE_FLOW_MCP_CATALOG to the MCP catalog directory." >&2
  exit 1
fi
mkdir -p "$DST"
rsync -a --delete "$SRC/" "$DST/"
echo "Synced $SRC → $DST"
echo "gallery: $(python3 -c "import json;print(len(json.load(open('$DST/gallery.json'))))" 2>/dev/null || echo '?') entries"
echo "schemas: $(find "$DST/schemas" -name '*.json' 2>/dev/null | wc -l)"
