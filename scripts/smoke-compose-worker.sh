#!/usr/bin/env bash
# Smoke-check the single compose layout (issues #134 and #135).
#
#   bash scripts/smoke-compose-worker.sh
#       Render compose config. Try-out must schedule a worker. Production
#       compose must refuse to render without POSTGRES_PASSWORD, and must
#       not render the dev password.
#
#   bash scripts/smoke-compose-worker.sh --up
#       docker compose up -d --build for db, redis, api, and worker, then
#       assert the worker is running and a queued webhook execution succeeds.
#
# Config checks need Docker Compose v2. --up also builds the app image.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "smoke: $*" >&2; exit 1; }

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  fail "docker compose is required for this smoke check"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Isolate interpolation from a developer .env in the repo.
tryout_env="$TMP/tryout.env"
printf 'AUTH_DISABLED=true\n' >"$tryout_env"

echo "smoke: rendering try-out compose"
tryout="$(docker compose --env-file "$tryout_env" -f docker-compose.yml config)"
printf '%s\n' "$tryout" | grep -q 'openflow_role: worker\|OPENFLOW_ROLE: worker' \
  || fail "try-out config is missing OPENFLOW_ROLE=worker"
# compose config lowercases keys
printf '%s\n' "$tryout" | grep -q 'run_worker: "true"\|RUN_WORKER: "true"' \
  || fail "try-out worker is not set to run"
printf '%s\n' "$tryout" | grep -q 'restart: unless-stopped' \
  || fail "try-out stack is missing restart: unless-stopped"
if printf '%s\n' "$tryout" | awk '
  $0 ~ /^  worker:/ { in_worker=1; next }
  in_worker && $0 ~ /^  [a-zA-Z0-9-]+:/ { in_worker=0 }
  in_worker && $0 ~ /^      api:/ { found=1 }
  END { exit found ? 0 : 1 }
'; then
  fail "worker still depends on api (that gate left the container Created)"
fi
printf '%s\n' "$tryout" | grep -q 'node_env: development\|NODE_ENV: development' \
  || fail "try-out API/worker must set NODE_ENV=development so the dev DB password can boot"
printf '%s\n' "$tryout" | grep -q 'postgres_password: openflow\|POSTGRES_PASSWORD: openflow' \
  || fail "try-out is missing the dev-only Postgres password"

echo "smoke: production compose without POSTGRES_PASSWORD must fail"
prod_missing="$TMP/prod-missing.env"
printf 'CREDENTIALS_KEY=%s\n' "0123456789abcdef0123456789abcdef" >"$prod_missing"
if docker compose --env-file "$prod_missing" -f docker-compose.yml -f docker-compose.prod.yml config >/dev/null 2>"$TMP/prod-missing.err"; then
  fail "production compose rendered without POSTGRES_PASSWORD"
fi
grep -q 'POSTGRES_PASSWORD' "$TMP/prod-missing.err" \
  || fail "production compose failed without mentioning POSTGRES_PASSWORD: $(cat "$TMP/prod-missing.err")"

echo "smoke: production compose must not keep the dev password"
prod_default="$TMP/prod-default.env"
printf 'CREDENTIALS_KEY=%s\nPOSTGRES_PASSWORD=openflow\n' "0123456789abcdef0123456789abcdef" >"$prod_default"
prod_default_cfg="$(docker compose --env-file "$prod_default" -f docker-compose.yml -f docker-compose.prod.yml config)"
# Rendering succeeds; the db command refuses the value before Postgres starts.
printf '%s\n' "$prod_default_cfg" | grep -q 'Refusing to start Postgres' \
  || fail "production db entrypoint does not refuse the default password"
printf '%s\n' "$prod_default_cfg" | grep -q 'node_env: production\|NODE_ENV: production' \
  || fail "production overlay did not set NODE_ENV=production"

echo "smoke: production compose renders a dedicated password into DATABASE_URL"
prod_ok="$TMP/prod-ok.env"
printf 'CREDENTIALS_KEY=%s\nPOSTGRES_PASSWORD=%s\nPOSTGRES_USER=openflow\nPOSTGRES_DB=openflow\n' \
  "0123456789abcdef0123456789abcdef" "c8f1e0a9b7d64e21aa0099ff" >"$prod_ok"
prod_ok_cfg="$(docker compose --env-file "$prod_ok" -f docker-compose.yml -f docker-compose.prod.yml config)"
printf '%s\n' "$prod_ok_cfg" | grep -q 'c8f1e0a9b7d64e21aa0099ff' \
  || fail "production DATABASE_URL was not built from POSTGRES_PASSWORD"
if printf '%s\n' "$prod_ok_cfg" | grep -q 'postgres_password: openflow\|POSTGRES_PASSWORD: openflow'; then
  fail "production config still contains the dev Postgres password"
fi

echo "smoke: compose config ok"

if [[ "${1:-}" != "--up" ]]; then
  exit 0
fi

echo "smoke: building and starting db, redis, api, worker"
docker compose --env-file "$tryout_env" -f docker-compose.yml up -d --build db redis api worker

echo "smoke: waiting for the worker to be running"
ready=0
for _ in $(seq 1 60); do
  worker_id="$(docker compose --env-file "$tryout_env" -f docker-compose.yml ps -q worker || true)"
  if [[ -n "$worker_id" ]]; then
    state="$(docker inspect -f '{{.State.Status}}' "$worker_id" 2>/dev/null || true)"
    if [[ "$state" == "running" ]]; then
      ready=1
      break
    fi
  fi
  sleep 5
done
if [[ "$ready" != 1 ]]; then
  docker compose --env-file "$tryout_env" -f docker-compose.yml ps || true
  docker compose --env-file "$tryout_env" -f docker-compose.yml logs --tail=80 api worker || true
  fail "worker did not reach running"
fi
echo "smoke: worker is running"

echo "smoke: waiting for API health"
api_ready=0
for _ in $(seq 1 36); do
  if docker compose --env-file "$tryout_env" -f docker-compose.yml exec -T api \
    node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    api_ready=1
    break
  fi
  sleep 5
done
if [[ "$api_ready" != 1 ]]; then
  docker compose --env-file "$tryout_env" -f docker-compose.yml logs --tail=80 api worker || true
  fail "API /health did not succeed"
fi

echo "smoke: enqueueing a webhook run for the worker"
docker compose --env-file "$tryout_env" -f docker-compose.yml cp scripts/smoke-compose-job.mjs api:/tmp/smoke-compose-job.mjs
if ! docker compose --env-file "$tryout_env" -f docker-compose.yml exec -T api node /tmp/smoke-compose-job.mjs; then
  docker compose --env-file "$tryout_env" -f docker-compose.yml logs --tail=120 api worker || true
  fail "webhook execution did not reach success"
fi

echo "smoke: worker is running and processed a webhook job"
