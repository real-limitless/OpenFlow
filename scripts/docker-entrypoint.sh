#!/usr/bin/env sh
set -eu

SECRETS_DIR="${OPENFLOW_SECRETS_DIR:-/data/secrets}"
KEY_FILE="${SECRETS_DIR}/credentials.key"

is_placeholder_key() {
  key="${1:-}"
  case "$key" in
    ""|replace-me*|replace-with*|changeme*|change-me*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_credentials_key() {
  if ! is_placeholder_key "${CREDENTIALS_KEY:-}"; then
    return 0
  fi

  if [ -f "$KEY_FILE" ] && [ -s "$KEY_FILE" ]; then
    CREDENTIALS_KEY="$(cat "$KEY_FILE")"
    export CREDENTIALS_KEY
    echo "[openflow] Loaded CREDENTIALS_KEY from ${KEY_FILE}"
    return 0
  fi

  CREDENTIALS_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  export CREDENTIALS_KEY

  mkdir -p "$SECRETS_DIR"
  umask 077
  printf '%s' "$CREDENTIALS_KEY" > "$KEY_FILE"
  echo "[openflow] Generated CREDENTIALS_KEY and saved to ${KEY_FILE}"
  echo "[openflow] Persist the secrets volume (or set CREDENTIALS_KEY) so encrypted credentials survive restarts."
}

ensure_credentials_key

echo "[openflow] Applying database migrations…"
npx prisma migrate deploy

echo "[openflow] Starting server on :3000"
exec node .output/server/index.mjs
