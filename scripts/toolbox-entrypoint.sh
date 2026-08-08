#!/usr/bin/env bash
# OpenFlow toolbox entrypoint.
#   catalog-reindex | catalog-reindex-hash | catalog-eval | bash | wait | help
#
# App code lives in OPENFLOW_APP_DIR (/app) baked into the image.
# OPENFLOW_WORKSPACE_DIR (/data/workspace) is shared agent scratch (starts empty).

set -euo pipefail

APP_DIR="${OPENFLOW_APP_DIR:-/app}"
WORKSPACE="${OPENFLOW_WORKSPACE_DIR:-/data/workspace}"
mkdir -p "$WORKSPACE" /data/catalog 2>/dev/null || true

# Prefer baked-in app; fall back to /workspace bind-mount (local compose override)
resolve_app_dir() {
  if [[ -f "${APP_DIR}/package.json" && -d "${APP_DIR}/src/lib/catalog" ]]; then
    echo "$APP_DIR"
    return
  fi
  if [[ -f /workspace/package.json && -d /workspace/src/lib/catalog ]]; then
    echo /workspace
    return
  fi
  echo ""
}

banner() {
  local app
  app="$(resolve_app_dir)"
  cat <<EOF
OpenFlow toolbox
  app       : ${app:-"(missing — rebuild toolbox image)"}
  workspace : ${WORKSPACE}   ← agent clones/scripts (often empty until used)
  cwd       : $(pwd)
  database  : ${DATABASE_URL:-"(unset)"}
  catalog   : OPENFLOW_CATALOG_RAG_ENABLED=${OPENFLOW_CATALOG_RAG_ENABLED:-on}

Commands:
  wait | sleep              Keep container alive
  bash | sh                 Interactive shell (starts in app dir)
  catalog-reindex           Embed + upsert node catalog
  catalog-reindex-hash      Offline hash embeddings
  catalog-eval              Golden-intent checks
  help

Note: /data/workspace is NOT the OpenFlow source tree.
      Catalog scripts run from the baked-in app at /app.
EOF
}

run_in_app() {
  local app
  app="$(resolve_app_dir)"
  if [[ -z "$app" ]]; then
    echo "error: OpenFlow app not found in ${APP_DIR} or /workspace" >&2
    echo "Rebuild the toolbox image (includes src + scripts + node_modules)." >&2
    exit 1
  fi
  if [[ ! -d "${app}/node_modules" ]]; then
    echo "[toolbox] node_modules missing in ${app} — running npm ci…"
    (cd "$app" && npm ci && npx prisma generate)
  fi
  echo "[toolbox] running in ${app}: $*"
  (cd "$app" && "$@")
}

cmd="${1:-wait}"
shift || true

case "$cmd" in
  help|-h|--help)
    banner
    ;;
  wait|sleep|idle)
    banner
    echo "[toolbox] idle — exec: docker compose exec toolbox bash"
    echo "[toolbox] reindex: docker compose exec toolbox catalog-reindex-hash"
    exec sleep infinity
    ;;
  bash|sh)
    banner
    app="$(resolve_app_dir)"
    if [[ -n "$app" ]]; then
      cd "$app"
    fi
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
    app="$(resolve_app_dir)"
    if [[ -n "$app" && -d "$app" ]]; then
      cd "$app"
    fi
    exec "$cmd" "$@"
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
