#!/usr/bin/env bash
# First-time local development setup.
#   ./scripts/setup.sh
#   npm run setup
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✔${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
fail()  { echo -e "${RED}✘${NC}  $*"; exit 1; }

need_cmd() {
  command -v "$1" &>/dev/null || fail "$1 is required. $2"
}

compose_cmd() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose &>/dev/null; then
    echo "docker-compose"
  else
    return 1
  fi
}

echo ""
echo -e "${BOLD}OpenFlow setup${NC}"
echo -e "${DIM}──────────────────────────────────────${NC}"

need_cmd node "Install Node.js 22+ from https://nodejs.org"
need_cmd npm  "npm ships with Node.js"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 22 )); then
  warn "Node $(node -v) detected; OpenFlow expects Node >= 22."
fi
ok "Node $(node -v)"

if ! compose_cmd &>/dev/null; then
  fail "Docker Compose is required for Postgres + Redis. Install: https://docs.docker.com/engine/install/"
fi
DC="$(compose_cmd)"
ok "Compose: $DC"

# ── .env ──────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  info ".env already exists (left unchanged)"
fi

if ! grep -qE '^CREDENTIALS_KEY=[0-9a-fA-F]{64}$' .env 2>/dev/null; then
  KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  if grep -qE '^CREDENTIALS_KEY=' .env 2>/dev/null; then
    # portable in-place replace
    tmp="$(mktemp)"
    sed "s|^CREDENTIALS_KEY=.*|CREDENTIALS_KEY=\"${KEY}\"|" .env > "$tmp"
    mv "$tmp" .env
  else
    printf '\nCREDENTIALS_KEY="%s"\n' "$KEY" >> .env
  fi
  ok "Generated CREDENTIALS_KEY in .env"
else
  info "CREDENTIALS_KEY already set"
fi

# ── deps ──────────────────────────────────────────────────
info "Installing npm dependencies…"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
ok "Dependencies installed"

info "Generating Prisma client…"
npx prisma generate
ok "Prisma client ready"

# ── infra ─────────────────────────────────────────────────
info "Starting Postgres + Redis…"
# shellcheck disable=SC2086
$DC up -d db redis
ok "db + redis are up"

info "Waiting for Postgres…"
for i in $(seq 1 30); do
  if $DC exec -T db pg_isready -U openflow -d openflow &>/dev/null; then
    break
  fi
  if [[ $i -eq 30 ]]; then
    fail "Postgres did not become ready in time"
  fi
  sleep 1
done
ok "Postgres ready"

info "Applying migrations…"
npx prisma migrate deploy
ok "Migrations applied"

echo ""
echo -e "${GREEN}${BOLD}Setup complete.${NC}"
echo ""
echo -e "  Start the app:   ${BOLD}npm run dev${NC}"
echo -e "  Open:            ${BOLD}http://localhost:3000${NC}"
echo -e "  Full stack:      ${BOLD}docker compose up -d${NC}"
echo -e "  Menu:            ${BOLD}npm run tui${NC}"
echo ""
echo -e "${DIM}Auth is disabled by default (AUTH_DISABLED=true). Not for public internet.${NC}"
echo ""
