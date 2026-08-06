#!/usr/bin/env bash
# First-time local development setup (non-interactive).
#   ./scripts/setup.sh
#   npm run setup
#
# For a guided multi-step install, use: npm run tui → Install wizard
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/setup-common.sh
source "$ROOT/scripts/lib/setup-common.sh"

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

# ── templates (optional; default library) ─────────────────
# OPENFLOW_SKIP_TEMPLATE_SYNC=1 skips network clone of n8n-workflow-library
if [[ "${OPENFLOW_SKIP_TEMPLATE_SYNC:-}" != "1" ]]; then
  info "Seeding template marketplace from n8n-workflow-library (default source)…"
  info "  (set OPENFLOW_SKIP_TEMPLATE_SYNC=1 to skip; add more repos later in Settings → Templates)"
  set +e
  # shellcheck disable=SC1091
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
  npx tsx scripts/templates/sync-from-library.ts --source n8n-community
  sync_rc=$?
  set -e
  if [[ $sync_rc -eq 0 ]]; then
    ok "Template library synced"
  else
    warn "Template sync skipped or failed (network/git). Run later: npm run templates:sync"
  fi
else
  info "Skipping template sync (OPENFLOW_SKIP_TEMPLATE_SYNC=1)"
fi

echo ""
echo -e "${GREEN}${BOLD}Setup complete.${NC}"
echo ""
echo -e "  Start the app:   ${BOLD}npm run dev${NC}"
echo -e "  Open:            ${BOLD}http://localhost:3000${NC}"
echo -e "  Templates:       ${BOLD}http://localhost:3000/templates${NC}"
echo -e "  Full stack:      ${BOLD}docker compose up -d${NC}"
echo -e "  Menu:            ${BOLD}npm run tui${NC}"
echo ""
echo -e "${BOLD}Next steps${NC}"
echo -e "  1. Run ${BOLD}npm run dev${NC} and open the UI"
echo -e "  2. Choose ${BOLD}Run sample workflow${NC} on the home page"
echo -e "  3. Click ${BOLD}Execute${NC} for your first successful run"
echo -e "  4. Browse ${BOLD}/templates${NC} or add libraries in ${BOLD}Settings → Templates${NC}"
echo ""
echo -e "${DIM}Auth is disabled by default (AUTH_DISABLED=true). Not for public internet.${NC}"
echo -e "${DIM}For auth-on local prod: set AUTH_DISABLED=false — first open uses /setup for the owner account.${NC}"
echo -e "${DIM}Default template pack: https://github.com/real-limitless/n8n-workflow-library${NC}"
echo ""
