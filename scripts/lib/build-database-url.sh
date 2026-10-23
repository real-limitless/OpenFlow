#!/bin/sh
# Build DATABASE_URL from POSTGRES_* and refuse default passwords in production.
# Sourced by the API entrypoint and the toolbox entrypoint.
# Never reads CREDENTIALS_KEY. Call openflow_prepare_database_url after exporting env.

openflow_prepare_database_url() {
  # Entrypoints run with set -e. Keep it on so a rejected password stops boot
  # even if a caller sourced this file without set -e.
  set -e
  if [ "${OPENFLOW_BUILD_DATABASE_URL:-}" = "1" ]; then
    if [ -z "${POSTGRES_PASSWORD:-}" ]; then
      if [ "${NODE_ENV:-}" = "production" ]; then
        echo "[openflow] Refusing to boot: POSTGRES_PASSWORD is required in production. Set a dedicated password. Do not reuse CREDENTIALS_KEY." >&2
        exit 1
      fi
      POSTGRES_PASSWORD=openflow
      export POSTGRES_PASSWORD
      echo "[openflow] POSTGRES_PASSWORD unset; using the dev-only default." >&2
    fi
    : "${POSTGRES_USER:=openflow}"
    : "${POSTGRES_DB:=openflow}"
    : "${POSTGRES_HOST:=db}"
    : "${POSTGRES_PORT:=5432}"
    export POSTGRES_USER POSTGRES_DB POSTGRES_HOST POSTGRES_PORT

    DATABASE_URL="$(node <<'JS'
const user = (process.env.POSTGRES_USER || "openflow").trim() || "openflow";
const password = process.env.POSTGRES_PASSWORD ?? "";
const database = (process.env.POSTGRES_DB || "openflow").trim() || "openflow";
const host = (process.env.POSTGRES_HOST || "db").trim() || "db";
const port = (process.env.POSTGRES_PORT || "5432").trim() || "5432";
process.stdout.write(
  "postgresql://" +
    encodeURIComponent(user) +
    ":" +
    encodeURIComponent(password) +
    "@" +
    host +
    ":" +
    port +
    "/" +
    encodeURIComponent(database),
);
JS
)"
    export DATABASE_URL
    echo "[openflow] DATABASE_URL built from POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB." >&2
  fi

  if [ "${NODE_ENV:-}" != "production" ]; then
    return 0
  fi

  node <<'JS'
const weak = new Set([
  "",
  "openflow",
  "postgres",
  "password",
  "secret",
  "changeme",
  "change-me",
  "replace-me",
  "replace-with",
]);

function isWeak(value) {
  if (value == null) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  if (weak.has(trimmed.toLowerCase())) return true;
  return /^(replace-me|replace-with|changeme|change-me)/i.test(trimmed);
}

const explicit = process.env.POSTGRES_PASSWORD;
if (explicit != null && String(explicit).length > 0 && isWeak(explicit)) {
  console.error(
    "[openflow] Refusing to boot: POSTGRES_PASSWORD is missing or still a default. Set a dedicated password. Do not reuse CREDENTIALS_KEY.",
  );
  process.exit(1);
}

let fromUrl = "";
const rawUrl = process.env.DATABASE_URL || "";
try {
  fromUrl = decodeURIComponent(new URL(rawUrl).password);
} catch {
  console.error("[openflow] Refusing to boot: DATABASE_URL is invalid.");
  process.exit(1);
}

if (isWeak(fromUrl)) {
  console.error(
    "[openflow] Refusing to boot: DATABASE_URL uses a missing or placeholder database password. Set POSTGRES_PASSWORD and build DATABASE_URL from it. Do not reuse CREDENTIALS_KEY.",
  );
  process.exit(1);
}
JS
}

# Build REDIS_URL from REDIS_PASSWORD. No default password. Production rejects
# placeholder values. Never reads CREDENTIALS_KEY.
openflow_prepare_redis_url() {
  set -e
  if [ "${OPENFLOW_BUILD_REDIS_URL:-}" != "1" ]; then
    return 0
  fi
  if [ -z "${REDIS_PASSWORD:-}" ]; then
    echo "[openflow] Refusing to boot: REDIS_PASSWORD is required. No default is set." >&2
    exit 1
  fi
  if [ "${NODE_ENV:-}" = "production" ]; then
    pw=$(printf '%s' "$REDIS_PASSWORD" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
    case "$pw" in
      ""|openflow|redis|password|secret|changeme|change-me|replace-me|replace-with*)
        echo "[openflow] Refusing to boot: REDIS_PASSWORD is missing or still a default." >&2
        exit 1
        ;;
    esac
  fi
  : "${REDIS_HOST:=redis}"
  : "${REDIS_PORT:=6379}"
  export REDIS_HOST REDIS_PORT
  REDIS_URL="$(node <<'JS'
const password = process.env.REDIS_PASSWORD ?? "";
const host = (process.env.REDIS_HOST || "redis").trim() || "redis";
const port = (process.env.REDIS_PORT || "6379").trim() || "6379";
process.stdout.write("redis://:" + encodeURIComponent(password) + "@" + host + ":" + port);
JS
)"
  export REDIS_URL
  echo "[openflow] REDIS_URL built from REDIS_PASSWORD." >&2
}
