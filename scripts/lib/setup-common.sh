#!/usr/bin/env bash
# Shared setup helpers for setup.sh and the TUI install wizard.
# Source from repo root context:
#   ROOT=...; source "$ROOT/scripts/lib/setup-common.sh"
#
# shellcheck disable=SC2034

if [[ -z "${OPENFLOW_SETUP_COMMON_LOADED:-}" ]]; then
  OPENFLOW_SETUP_COMMON_LOADED=1
fi

# ── colors (safe if already set) ──────────────────────────
: "${BOLD:=\033[1m}"
: "${DIM:=\033[2m}"
: "${GREEN:=\033[0;32m}"
: "${YELLOW:=\033[1;33m}"
: "${RED:=\033[0;31m}"
: "${BLUE:=\033[0;34m}"
: "${CYAN:=\033[0;36m}"
: "${NC:=\033[0m}"

of_info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
of_ok()    { echo -e "${GREEN}✔${NC}  $*"; }
of_warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
of_fail()  { echo -e "${RED}✘${NC}  $*"; return 1; }
of_die()   { of_fail "$@"; exit 1; }

of_root() {
  if [[ -n "${ROOT:-}" ]]; then
    echo "$ROOT"
  else
    cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
  fi
}

of_has_cmd() { command -v "$1" &>/dev/null; }

of_compose_cmd() {
  if of_has_cmd docker && docker compose version &>/dev/null 2>&1; then
    echo "docker compose"
  elif of_has_cmd docker-compose; then
    echo "docker-compose"
  else
    return 1
  fi
}

of_dc() {
  local cmd
  cmd="$(of_compose_cmd)" || return 1
  # shellcheck disable=SC2086
  $cmd "$@"
}

# ── readiness probes ──────────────────────────────────────

of_has_env_file() {
  [[ -f "$(of_root)/.env" ]]
}

of_has_credentials_key() {
  local envf
  envf="$(of_root)/.env"
  [[ -f "$envf" ]] && grep -qE '^CREDENTIALS_KEY=["'\'']?[0-9a-fA-F]{64}' "$envf" 2>/dev/null
}

of_has_node_modules() {
  [[ -d "$(of_root)/node_modules" ]]
}

of_node_version_ok() {
  of_has_cmd node || return 1
  local major
  major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  (( major >= 22 ))
}

of_db_ready() {
  of_compose_cmd &>/dev/null || return 1
  of_dc exec -T db pg_isready -U openflow -d openflow &>/dev/null 2>&1
}

of_redis_ready() {
  of_compose_cmd &>/dev/null || return 1
  of_dc exec -T redis redis-cli ping 2>/dev/null | grep -qi pong
}

of_stack_running() {
  of_compose_cmd &>/dev/null || return 1
  # any service up
  of_dc ps --status running 2>/dev/null | grep -qE 'api|db|redis' || return 1
}

of_api_healthy() {
  local url="${1:-http://127.0.0.1:3000/health}"
  if of_has_cmd curl; then
    curl -fsS --max-time 3 "$url" &>/dev/null
  elif of_has_cmd node; then
    node -e "fetch('$url').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null
  else
    return 1
  fi
}

of_api_ready() {
  local url="${1:-http://127.0.0.1:3000/health/ready}"
  of_api_healthy "$url"
}

# Print readiness strip: env · deps · docker · db · api
of_readiness_strip() {
  local e d c b a
  of_has_env_file && of_has_credentials_key && e="${GREEN}env✔${NC}" || e="${DIM}env·${NC}"
  of_has_node_modules && d="${GREEN}deps✔${NC}" || d="${DIM}deps·${NC}"
  of_compose_cmd &>/dev/null && c="${GREEN}docker✔${NC}" || c="${DIM}docker·${NC}"
  of_db_ready && b="${GREEN}db✔${NC}" || b="${DIM}db·${NC}"
  of_api_healthy && a="${GREEN}api✔${NC}" || a="${DIM}api·${NC}"
  echo -e "  ${DIM}status:${NC} ${e}  ${d}  ${c}  ${b}  ${a}"
}

# ── setup steps ───────────────────────────────────────────

of_check_prereqs_dev() {
  of_has_cmd node || { of_fail "Node.js is required. Install 22+ from https://nodejs.org"; return 1; }
  of_has_cmd npm  || { of_fail "npm not found (ships with Node.js)"; return 1; }
  if ! of_node_version_ok; then
    of_warn "Node $(node -v) detected; OpenFlow expects Node >= 22."
  else
    of_ok "Node $(node -v)"
  fi
  of_compose_cmd &>/dev/null || {
    of_fail "Docker Compose is required for Postgres + Redis. Install: https://docs.docker.com/engine/install/"
    return 1
  }
  of_ok "Compose: $(of_compose_cmd)"
  return 0
}

of_check_prereqs_docker() {
  of_compose_cmd &>/dev/null || {
    of_fail "Docker Compose is required. Install: https://docs.docker.com/engine/install/"
    return 1
  }
  of_ok "Compose: $(of_compose_cmd)"
  return 0
}

of_ensure_env() {
  local root envf
  root="$(of_root)"
  envf="$root/.env"
  if [[ ! -f "$envf" ]]; then
    if [[ ! -f "$root/.env.example" ]]; then
      of_fail ".env.example missing — cannot create .env"
      return 1
    fi
    cp "$root/.env.example" "$envf"
    of_ok "Created .env from .env.example"
  else
    of_info ".env already exists (left unchanged)"
  fi
  return 0
}

of_ensure_credentials_key() {
  local root envf key tmp
  root="$(of_root)"
  envf="$root/.env"
  [[ -f "$envf" ]] || { of_fail ".env missing — run of_ensure_env first"; return 1; }

  if grep -qE '^CREDENTIALS_KEY=["'\'']?[0-9a-fA-F]{64}' "$envf" 2>/dev/null; then
    of_info "CREDENTIALS_KEY already set"
    return 0
  fi

  if ! of_has_cmd node; then
    of_fail "Node.js required to generate CREDENTIALS_KEY"
    return 1
  fi

  key="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  if grep -qE '^CREDENTIALS_KEY=' "$envf" 2>/dev/null; then
    tmp="$(mktemp)"
    sed "s|^CREDENTIALS_KEY=.*|CREDENTIALS_KEY=\"${key}\"|" "$envf" > "$tmp"
    mv "$tmp" "$envf"
  else
    printf '\nCREDENTIALS_KEY="%s"\n' "$key" >> "$envf"
  fi
  of_ok "Generated CREDENTIALS_KEY in .env"
  return 0
}

# Set a key=value in .env (creates line if missing). Value is double-quoted.
# Does not print the value. Safe for special characters in values.
of_env_set() {
  local key="$1" value="$2"
  local envf tmp escaped
  envf="$(of_root)/.env"
  [[ -f "$envf" ]] || { of_fail ".env missing"; return 1; }
  # Escape for double-quoted .env value
  escaped="${value//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  tmp="$(mktemp)"
  if grep -qE "^${key}=" "$envf" 2>/dev/null; then
    # Rewrite line-by-line without sed delimiters (API keys can contain /|&)
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" == "${key}="* ]]; then
        printf '%s="%s"\n' "$key" "$escaped"
      else
        printf '%s\n' "$line"
      fi
    done < "$envf" > "$tmp"
    mv "$tmp" "$envf"
  else
    printf '\n%s="%s"\n' "$key" "$escaped" >> "$envf"
    rm -f "$tmp"
  fi
}

of_env_get() {
  local key="$1" envf line val
  envf="$(of_root)/.env"
  [[ -f "$envf" ]] || return 1
  line="$(grep -E "^${key}=" "$envf" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  printf '%s' "$val"
}

of_show_env_summary() {
  local auth backend
  auth="$(of_env_get AUTH_DISABLED 2>/dev/null || echo true)"
  backend="$(of_env_get OPENFLOW_ASSISTANT_BACKEND 2>/dev/null || echo builtin)"
  of_info "Env summary (non-secret):"
  echo -e "    AUTH_DISABLED=${BOLD}${auth}${NC}"
  echo -e "    CREDENTIALS_KEY=${BOLD}$(of_has_credentials_key && echo set || echo missing)${NC}"
  echo -e "    OPENFLOW_ASSISTANT_BACKEND=${BOLD}${backend}${NC}"
  echo -e "    App URL (default): ${BOLD}http://localhost:3000${NC}"
  echo -e "    Postgres (host dev): ${BOLD}localhost:15432${NC}"
  echo -e "    Redis (host dev):    ${BOLD}localhost:6379${NC}"
}

of_install_deps() {
  local root
  root="$(of_root)"
  cd "$root"
  of_has_cmd npm || { of_fail "npm required"; return 1; }
  of_info "Installing npm dependencies…"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  of_ok "Dependencies installed"
  of_info "Generating Prisma client…"
  npx prisma generate
  of_ok "Prisma client ready"
  return 0
}

of_start_db_redis() {
  of_compose_cmd &>/dev/null || { of_fail "Docker Compose required"; return 1; }
  of_info "Starting Postgres + Redis…"
  of_dc up -d db redis
  of_ok "db + redis are up"
  return 0
}

of_wait_postgres() {
  local i
  of_info "Waiting for Postgres…"
  for i in $(seq 1 30); do
    if of_db_ready; then
      of_ok "Postgres ready"
      return 0
    fi
    sleep 1
  done
  of_fail "Postgres did not become ready in time"
  return 1
}

of_migrate() {
  local root
  root="$(of_root)"
  cd "$root"
  of_has_cmd npx || { of_fail "npx required"; return 1; }
  of_info "Applying migrations…"
  npx prisma migrate deploy
  of_ok "Migrations applied"
  return 0
}

of_start_full_stack() {
  of_compose_cmd &>/dev/null || { of_fail "Docker Compose required"; return 1; }
  of_info "Starting full Docker stack…"
  of_dc up -d --remove-orphans
  of_ok "Stack starting"
  return 0
}

of_wait_api() {
  local i
  of_info "Waiting for API health…"
  for i in $(seq 1 60); do
    if of_api_healthy; then
      of_ok "API healthy at http://localhost:3000"
      return 0
    fi
    sleep 2
  done
  of_warn "API did not report healthy yet — check: docker compose logs -f api"
  return 1
}

# Non-interactive full local-dev setup (used by npm run setup)
of_setup_all_dev() {
  local root
  root="$(of_root)"
  cd "$root"

  echo ""
  echo -e "${BOLD}OpenFlow setup${NC}"
  echo -e "${DIM}──────────────────────────────────────${NC}"

  of_check_prereqs_dev || return 1
  of_ensure_env || return 1
  of_ensure_credentials_key || return 1
  of_install_deps || return 1
  of_start_db_redis || return 1
  of_wait_postgres || return 1
  of_migrate || return 1

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
  return 0
}
