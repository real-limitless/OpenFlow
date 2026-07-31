#!/usr/bin/env bash
# Fetch SPEC-only research corpus into /tmp (NEVER into the git repo).
#
# Usage: fetch_spec_corpus.sh <node-type> <out-dir>
# out-dir MUST be under /tmp or /var/tmp.
set -euo pipefail

TYPE="${1:?node type required}"
OUT="${2:?output dir required}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REAL_ROOT="$(cd "$ROOT" && pwd -P)"

# ── Absolute isolation ──────────────────────────────────────────────
case "$OUT" in
  /tmp/*|/var/tmp/*) ;;
  *)
    echo "REFUSED: corpus out-dir must be under /tmp or /var/tmp (got: $OUT)" >&2
    exit 3
    ;;
esac

mkdir -p "$OUT"
REAL_OUT="$(cd "$OUT" && pwd -P)"
case "$REAL_OUT" in
  "$REAL_ROOT"|"$REAL_ROOT"/*)
    echo "REFUSED: corpus path resolves inside the git repo: $REAL_OUT" >&2
    exit 3
    ;;
esac

# Derive npm package from wire type unless FACTORY_NPM_PACKAGE is set.
#   n8n-nodes-base.foo              → n8n-nodes-base
#   @n8n/n8n-nodes-langchain.foo    → @n8n/n8n-nodes-langchain
#   n8n-nodes-mcp.mcpClientTool     → n8n-nodes-mcp
if [[ -n "${FACTORY_NPM_PACKAGE:-}" ]]; then
  PKG="$FACTORY_NPM_PACKAGE"
elif [[ "$TYPE" == @*/* ]]; then
  # scoped: @scope/pkg.name → @scope/pkg
  PKG="${TYPE%.*}"
elif [[ "$TYPE" == *.* ]]; then
  PKG="${TYPE%%.*}"
else
  PKG="n8n-nodes-base"
fi
VER="${FACTORY_NPM_VERSION:-latest}"

mkdir -p "$OUT/npm" "$OUT/extract" "$OUT/docs"
cd "$OUT/npm"

echo "Fetching npm pack ${PKG}@${VER} into $OUT (SPEC only, tmp isolation)…"
if ! npm pack "${PKG}@${VER}" --silent >"$OUT/npm/pack-name.txt" 2>"$OUT/npm/pack.err"; then
  echo "npm pack failed:" >&2
  cat "$OUT/npm/pack.err" >&2 || true
  exit 1
fi
TGZ="$(ls -1 "$OUT/npm"/*.tgz 2>/dev/null | head -1 || true)"
if [[ -z "$TGZ" ]]; then
  echo "No tarball produced under $OUT/npm" >&2
  exit 1
fi

tar -xzf "$TGZ" -C "$OUT/extract"
PKG_ROOT="$OUT/extract/package"
[[ -d "$PKG_ROOT" ]] || PKG_ROOT="$OUT/extract"

{
  echo "# SPEC corpus index for $TYPE"
  echo "# Generated $(date -Iseconds)"
  echo "# Package: ${PKG}@${VER}"
  echo "# ISOLATION: This directory is under /tmp and must NEVER be copied into OpenFlow git."
  echo "# IMPLEMENT agents must NOT receive this path."
  echo
  echo "## package.json (metadata only)"
  if [[ -f "$PKG_ROOT/package.json" ]]; then
    python3 - <<PY
import json
from pathlib import Path
p = Path("$PKG_ROOT/package.json")
d = json.loads(p.read_text())
keep = {k: d[k] for k in ("name", "version", "description", "n8n") if k in d}
print(json.dumps(keep, indent=2)[:12000])
PY
  fi
  echo
  echo "## candidate descriptor / schema files (paths under this corpus)"
  find "$PKG_ROOT" -type f \( \
      -name '*.node.json' -o -name '*Description*' -o -name 'package.json' -o -name '*.json' \
    \) 2>/dev/null | sed "s|^$OUT/||" | head -300 || true
  echo
  echo "## CLEAN-ROOM INSTRUCTIONS FOR SPEC AGENT"
  echo "1. Use this corpus ONLY to discover public type strings, parameter names, defaults, and option enums."
  echo "2. Do NOT copy TypeScript/JavaScript implementation algorithms into OpenFlow."
  echo "3. Do NOT copy large source files verbatim into the repo or the spec markdown."
  echo "4. Write an independent behavioral spec under docs/specs/nodes/ only."
  echo "5. This corpus must never leave /tmp into the git working tree."
} >"$OUT/INDEX.md"

# Public docs (also only under /tmp)
TYPE_LOWER="$(echo "$TYPE" | tr '[:upper:]' '[:lower:]')"
for u in \
  "https://docs.n8n.io/integrations/builtin/core-nodes/${TYPE}.md" \
  "https://docs.n8n.io/integrations/builtin/core-nodes/${TYPE_LOWER}.md"
do
  if curl -fsSL --max-time 25 "$u" -o "$OUT/docs/page.md" 2>/dev/null; then
    echo "$u" >"$OUT/docs/source-url.txt"
    break
  fi
done

python3 - <<PY
import json, hashlib
from pathlib import Path
out = Path("$OUT")
files = []
for p in out.rglob("*"):
    if p.is_file():
        try:
            h = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
            files.append({"path": str(p.relative_to(out)), "sha256_16": h, "bytes": p.stat().st_size})
        except Exception:
            pass
manifest = {
    "type": "$TYPE",
    "package": "${PKG}@${VER}",
    "isolation": "tmp-only-never-copy-to-repo",
    "root": str(out),
    "files": files[:800],
}
(out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(out)
PY

# Final leak check: nothing under repo
if find "$REAL_ROOT" \( -name 'n8n-nodes-base*.tgz' -o -name 'n8n-nodes-base-*.tgz' \) 2>/dev/null | grep -q .; then
  echo "REFUSED: tarball leaked into repo; deleting" >&2
  find "$REAL_ROOT" \( -name 'n8n-nodes-base*.tgz' -o -name 'n8n-nodes-base-*.tgz' \) -delete 2>/dev/null || true
  exit 3
fi

echo "CORPUS_OK=$REAL_OUT"
