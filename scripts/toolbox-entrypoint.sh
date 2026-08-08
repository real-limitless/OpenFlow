#!/usr/bin/env bash
# OpenFlow toolbox entrypoint.
# Usage:
#   openflow-toolbox wait              # stay up for docker compose exec
#   openflow-toolbox bash              # interactive shell
#   openflow-toolbox catalog-reindex   # npm run catalog:reindex
#   openflow-toolbox catalog-reindex-hash
#   openflow-toolbox catalog-eval
#   openflow-toolbox help

set -euo pipefail

WORKSPACE="${OPENFLOW_WORKSPACE_DIR:-/data/workspace}"
mkdir -p "$WORKSPACE" /data/catalog 2>/dev/null || true

banner() {
  cat <<EOF
OpenFlow toolbox
  workspace : ${WORKSPACE}
  cwd       : $(pwd)
  database  : ${DATABASE_URL:-"(unset)"}
  catalog   : OPENFLOW_CATALOG_RAG_ENABLED=${OPENFLOW_CATALOG_RAG_ENABLED:-on}

Commands:
  wait | sleep          Keep container alive (compose default)
  bash | sh             Interactive shell
  catalog-reindex       Embed + upsert node catalog (API embeddings when key set)
  catalog-reindex-hash  Offline hash embeddings (CI / no API key)
  catalog-eval          Golden-intent ranking checks
  npm … / npx …         Forward to package scripts when /workspace is the app
  help                  This text
EOF
}

run_in_app() {
  if [[ ! -f /workspace/package.json ]]; then
    echo "error: /workspace/package.json missing — mount the OpenFlow repo:" >&2
    echo "  docker compose run --rm -v \"\$PWD:/workspace\" toolbox $*" >&2
    exit 1
  fi
  if [[ ! -d /workspace/node_modules ]]; then
    echo "[toolbox] node_modules missing — running npm ci (first run may take a while)…"
    (cd /workspace && npm ci)
  fi
  (cd /workspace && "$@")
}

cmd="${1:-wait}"
shift || true

case "$cmd" in
  help|-h|--help)
    banner
    ;;
  wait|sleep|idle)
    banner
    echo "[toolbox] idle — docker compose exec toolbox bash"
    exec sleep infinity
    ;;
  bash|sh)
    banner
    exec bash "$@"
    ;;
  catalog-reindex|reindex)
    run_in_app npx tsx scripts/catalog-reindex.ts "$@"
    ;;
  catalog-reindex-hash|reindex-hash)
    run_in_app npx tsx scripts/catalog-reindex.ts --hash "$@"
    ;;
  catalog-eval|eval)
    run_in_app npx tsx scripts/catalog-eval.ts "$@"
    ;;
  npm|npx|node|python|python3|git|jq|rg|curl)
    # Allow common tools as the command itself
    exec "$cmd" "$@"
    ;;
  *)
    # Arbitrary command (compose run toolbox <cmd>)
    exec "$cmd" "$@"
    ;;
esac
