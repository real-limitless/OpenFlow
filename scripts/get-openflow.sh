#!/usr/bin/env bash
# get-openflow.sh — OpenFlow installer (interactive TUI + non-interactive flags)
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/real-limitless/OpenFlow/main/scripts/get-openflow.sh | bash
#
# Non-interactive:
#   curl -fsSL …/get-openflow.sh | bash -s -- --yes --prod --port 3001
#
# Local:
#   bash scripts/get-openflow.sh
#   bash scripts/get-openflow.sh --yes --mode tryout
#
set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✔${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
fail()  { echo -e "${RED}✘${NC}  $*"; exit 1; }
print() { echo -e "$*"; }

# ── defaults ──────────────────────────────────────────────────────────
REPO_URL="${OPENFLOW_REPO_URL:-https://github.com/real-limitless/OpenFlow.git}"
REPO_RAW="${OPENFLOW_REPO_RAW:-https://raw.githubusercontent.com/real-limitless/OpenFlow/main}"
OPENFLOW_HOME="${OPENFLOW_HOME:-$HOME/openflow}"
OPENFLOW_IMAGE="${OPENFLOW_IMAGE:-ghcr.io/real-limitless/openflow:latest}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-openflow}"
OPENFLOW_PORT="${OPENFLOW_PORT:-3000}"
WAIT_SECONDS="${OPENFLOW_WAIT_SECONDS:-90}"
CLONE_DIR="${OPENFLOW_CLONE_DIR:-$HOME/src/OpenFlow}"

# tryout | production | build | develop
MODE="${OPENFLOW_MODE:-}"
PROD=false
NO_OPEN=false
SKIP_WAIT=false
YES=false          # skip TUI / confirmations
INTERACTIVE=false

# Prompt stream (works under curl | bash when a TTY is attached)
PROMPT_IN="/dev/stdin"

usage() {
  cat <<EOF
${BOLD}OpenFlow installer${NC} (get-openflow.sh)

${BOLD}One-liner${NC}
  curl -fsSL ${REPO_RAW}/scripts/get-openflow.sh | bash

${BOLD}Usage${NC}
  get-openflow.sh [options]

${BOLD}Modes${NC} (pick one, or use the TUI)
  --mode tryout       Docker prebuilt image, auth off  (default)
  --mode production   Docker prebuilt image, auth on → owner setup
  --mode build        Clone repo + docker compose up --build
  --mode develop      Clone repo + npm run setup (Node 22+)
  --prod              Shortcut for --mode production

${BOLD}Options${NC}
  --home PATH         Data / compose dir (default: ~/openflow)
  --clone-dir PATH    Git clone dir for build/develop (default: ~/src/OpenFlow)
  --port N            Host UI port (default: 3000)
  --image REF         Container image (default: ghcr.io/real-limitless/openflow:latest)
  --no-open           Do not open a browser when ready
  --skip-wait         Skip /health/ready poll
  --yes, -y           Non-interactive (no TUI, accept defaults / flags)
  --help, -h          Show this help

${BOLD}Environment${NC}
  OPENFLOW_HOME  OPENFLOW_IMAGE  OPENFLOW_PORT  OPENFLOW_MODE
  OPENFLOW_CLONE_DIR  OPENFLOW_WAIT_SECONDS  OPENFLOW_REPO_URL
EOF
}

# ── args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      [[ -n "$MODE" ]] || fail "--mode requires tryout|production|build|develop"
      shift 2
      ;;
    --prod) PROD=true; MODE="${MODE:-production}"; shift ;;
    --port)
      OPENFLOW_PORT="${2:-}"
      [[ -n "$OPENFLOW_PORT" ]] || fail "--port requires a value"
      shift 2
      ;;
    --home)
      OPENFLOW_HOME="${2:-}"
      [[ -n "$OPENFLOW_HOME" ]] || fail "--home requires a path"
      shift 2
      ;;
    --clone-dir)
      CLONE_DIR="${2:-}"
      [[ -n "$CLONE_DIR" ]] || fail "--clone-dir requires a path"
      shift 2
      ;;
    --image)
      OPENFLOW_IMAGE="${2:-}"
      [[ -n "$OPENFLOW_IMAGE" ]] || fail "--image requires a value"
      shift 2
      ;;
    --no-open) NO_OPEN=true; shift ;;
    --skip-wait) SKIP_WAIT=true; shift ;;
    --yes|-y) YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
done

# ── interactive detection ─────────────────────────────────────────────
setup_prompt_stream() {
  if [[ -t 0 ]]; then
    PROMPT_IN="/dev/stdin"
    INTERACTIVE=true
  elif [[ -r /dev/tty ]]; then
    # curl | bash — still talk to the user on the terminal
    PROMPT_IN="/dev/tty"
    INTERACTIVE=true
  else
    PROMPT_IN="/dev/null"
    INTERACTIVE=false
  fi
  if [[ "$YES" == true ]]; then
    INTERACTIVE=false
  fi
}

ask() {
  # ask "Prompt" "default" → sets REPLY
  local prompt="$1"
  local default="${2:-}"
  local hint=""
  if [[ -n "$default" ]]; then
    hint=" [${default}]"
  fi
  if [[ "$INTERACTIVE" != true ]]; then
    REPLY="$default"
    return 0
  fi
  # shellcheck disable=SC2059
  printf "${CYAN}?${NC}  %s%s: " "$prompt" "$hint" > /dev/tty 2>/dev/null || printf "${CYAN}?${NC}  %s%s: " "$prompt" "$hint"
  if ! IFS= read -r REPLY <"$PROMPT_IN"; then
    REPLY="$default"
  fi
  if [[ -z "$REPLY" ]]; then
    REPLY="$default"
  fi
}

ask_yn() {
  # ask_yn "Prompt" "Y"|"N" → returns 0 for yes
  local prompt="$1"
  local default="${2:-Y}"
  local def_hint="Y/n"
  [[ "$default" == "N" || "$default" == "n" ]] && def_hint="y/N"
  ask "$prompt ($def_hint)" ""
  local a="${REPLY:-}"
  if [[ -z "$a" ]]; then
    a="$default"
  fi
  local al
  al="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')"
  case "$al" in
    y|yes) return 0 ;;
    n|no) return 1 ;;
    *)
      local dl
      dl="$(printf '%s' "$default" | tr '[:upper:]' '[:lower:]')"
      if [[ "$dl" == "y" ]]; then return 0; else return 1; fi
      ;;
  esac
}

# ── helpers ───────────────────────────────────────────────────────────
compose_cmd() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose &>/dev/null; then
    echo "docker-compose"
  else
    return 1
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss &>/dev/null; then
    ss -ltn "( sport = :$port )" 2>/dev/null | grep -q ":$port" && return 0
    return 1
  fi
  if command -v lsof &>/dev/null; then
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P &>/dev/null && return 0
    return 1
  fi
  return 1
}

open_browser() {
  local url="$1"
  [[ "$NO_OPEN" == true ]] && return 0
  if command -v xdg-open &>/dev/null; then
    xdg-open "$url" &>/dev/null || true
  elif command -v open &>/dev/null; then
    open "$url" &>/dev/null || true
  fi
}

wait_ready() {
  local port="$1"
  local url="http://127.0.0.1:${port}/health/ready"
  local i
  info "Waiting for OpenFlow to become ready (up to ${WAIT_SECONDS}s)…"
  for i in $(seq 1 "$WAIT_SECONDS"); do
    if command -v curl &>/dev/null; then
      if curl -fsS "$url" &>/dev/null; then
        ok "Ready: ${url}"
        return 0
      fi
    elif command -v wget &>/dev/null; then
      if wget -q -O /dev/null "$url" 2>/dev/null; then
        ok "Ready: ${url}"
        return 0
      fi
    else
      sleep 5
      warn "curl/wget not found; skipped readiness probe"
      return 0
    fi
    sleep 1
  done
  return 1
}

gen_credentials_key() {
  if command -v openssl &>/dev/null; then
    openssl rand -hex 32
  elif command -v python3 &>/dev/null; then
    python3 -c 'import secrets; print(secrets.token_hex(32))'
  elif command -v node &>/dev/null; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
  else
    docker run --rm node:22-slim node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
  fi
}

need_docker() {
  if compose_cmd &>/dev/null; then
    return 0
  fi
  fail "Docker Compose is required. Install Docker: https://docs.docker.com/engine/install/"
}

need_git() {
  command -v git &>/dev/null || fail "git is required for this mode. Install git and re-run."
}

need_node() {
  command -v node &>/dev/null || fail "Node.js 22+ is required for develop mode. https://nodejs.org"
  command -v npm &>/dev/null || fail "npm is required (ships with Node.js)."
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if (( major < 22 )); then
    warn "Node $(node -v) detected; OpenFlow expects Node >= 22."
  fi
}

banner() {
  print ""
  print "${BOLD}${CYAN}"
  cat <<'ASCII'
   ___                   _____ _
  / _ \ _ __   ___ _ __ |  ___| | _____      __
 | | | | '_ \ / _ \ '_ \| |_  | |/ _ \ \ /\ / /
 | |_| | |_) |  __/ | | |  _| | | (_) \ V  V /
  \___/| .__/ \___|_| |_|_|   |_|\___/ \_/\_/
       |_|   self-hosted workflow automation
ASCII
  print "${NC}"
  print "${DIM}Installer · Docker-first · first successful run in minutes${NC}"
  print "${DIM}──────────────────────────────────────────────────────────${NC}"
  print ""
}

# ── TUI ───────────────────────────────────────────────────────────────
run_tui() {
  banner
  info "Interactive setup (Ctrl+C to abort). Flags skip this with ${BOLD}--yes${NC}."
  print ""

  print "${BOLD}Install mode${NC}"
  print "  ${BOLD}1${NC}) Try-out      ${DIM}— Docker image, auth off (recommended first run)${NC}"
  print "  ${BOLD}2${NC}) Production  ${DIM}— Docker image, auth on (create owner on first open)${NC}"
  print "  ${BOLD}3${NC}) Build       ${DIM}— clone repo + docker compose up --build${NC}"
  print "  ${BOLD}4${NC}) Develop     ${DIM}— clone repo + npm run setup (Node 22+)${NC}"
  print ""

  local choice
  while true; do
    ask "Choose mode" "1"
    choice="$REPLY"
    case "$choice" in
      1|tryout|try|t) MODE="tryout"; break ;;
      2|production|prod|p) MODE="production"; break ;;
      3|build|b) MODE="build"; break ;;
      4|develop|dev|d) MODE="develop"; break ;;
      q|quit|exit) print "Aborted."; exit 0 ;;
      *) warn "Enter 1–4 (or q to quit)" ;;
    esac
  done

  print ""
  case "$MODE" in
    tryout|production)
      ask "Install directory (compose + data)" "$OPENFLOW_HOME"
      OPENFLOW_HOME="$REPLY"
      ask "Host port" "$OPENFLOW_PORT"
      OPENFLOW_PORT="$REPLY"
      ask "Container image" "$OPENFLOW_IMAGE"
      OPENFLOW_IMAGE="$REPLY"
      ;;
    build|develop)
      ask "Clone directory" "$CLONE_DIR"
      CLONE_DIR="$REPLY"
      if [[ "$MODE" == "build" ]]; then
        ask "Host port" "$OPENFLOW_PORT"
        OPENFLOW_PORT="$REPLY"
      fi
      ;;
  esac

  if ask_yn "Open browser when ready" "Y"; then
    NO_OPEN=false
  else
    NO_OPEN=true
  fi

  print ""
  print "${BOLD}Summary${NC}"
  print "  Mode:     ${BOLD}${MODE}${NC}"
  case "$MODE" in
    tryout)
      print "  Home:     ${OPENFLOW_HOME}"
      print "  Port:     ${OPENFLOW_PORT}"
      print "  Image:    ${OPENFLOW_IMAGE}"
      print "  Auth:     ${DIM}disabled (try-out)${NC}"
      ;;
    production)
      print "  Home:     ${OPENFLOW_HOME}"
      print "  Port:     ${OPENFLOW_PORT}"
      print "  Image:    ${OPENFLOW_IMAGE}"
      print "  Auth:     ${GREEN}enabled${NC} → /setup owner account"
      ;;
    build)
      print "  Clone:    ${CLONE_DIR}"
      print "  Port:     ${OPENFLOW_PORT}"
      print "  Auth:     from compose / .env (default try-out)"
      ;;
    develop)
      print "  Clone:    ${CLONE_DIR}"
      print "  Next:     npm run setup && npm run dev"
      ;;
  esac
  print "  Browser:  $([[ "$NO_OPEN" == true ]] && echo no || echo yes)"
  print ""

  if ! ask_yn "Proceed with install" "Y"; then
    print "Aborted."
    exit 0
  fi
  print ""
}

# ── install paths ─────────────────────────────────────────────────────
write_compose_stack() {
  local auth_default="$1"
  local home="$2"
  local port="$3"
  local image="$4"

  mkdir -p "$home"
  cd "$home"

  if [[ ! -f .env ]]; then
    local key
    key="$(gen_credentials_key)"
    cat > .env <<EOF
# Generated by get-openflow.sh — $(date -u +%Y-%m-%dT%H:%MZ)
AUTH_DISABLED=${auth_default}
CREDENTIALS_KEY=${key}
OPENFLOW_ASSISTANT_ENABLED=true
EOF
    ok "Wrote ${home}/.env (CREDENTIALS_KEY generated)"
  else
    info ".env already exists (left unchanged)"
  fi

  cat > docker-compose.yml <<EOF
# Generated by OpenFlow get-openflow.sh — pin OPENFLOW_IMAGE / image: to a version in prod
services:
  api:
    image: ${image}
    ports:
      - "${port}:3000"
    env_file:
      - path: .env
        required: false
    environment:
      DATABASE_URL: postgresql://openflow:openflow@db:5432/openflow
      REDIS_URL: redis://redis:6379
      AUTH_DISABLED: \${AUTH_DISABLED:-${auth_default}}
      CREDENTIALS_KEY: \${CREDENTIALS_KEY:-}
      BINARY_STORAGE_DIR: /data/binary
      OPENFLOW_SECRETS_DIR: /data/secrets
      RUN_WORKER: \${RUN_WORKER:-true}
      WORKER_CONCURRENCY: \${WORKER_CONCURRENCY:-5}
    volumes:
      - binary-data:/data/binary
      - secrets-data:/data/secrets
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \\"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\\"",
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 40s
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: openflow
      POSTGRES_USER: openflow
      POSTGRES_PASSWORD: openflow
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openflow -d openflow"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
  binary-data:
  secrets-data:
  redis-data:
EOF
  ok "Wrote ${home}/docker-compose.yml"
}

finish_banner() {
  local ready="$1"
  local ui_url="$2"
  local data_dir="$3"
  local dc="$4"
  local auth_on="$5"

  print ""
  if [[ "$ready" == true ]]; then
    print "${GREEN}${BOLD}OpenFlow is ready.${NC}"
  else
    print "${YELLOW}${BOLD}OpenFlow is starting (not ready yet).${NC}"
  fi
  print ""
  print "  UI:       ${BOLD}${ui_url}${NC}"
  print "  Data dir: ${BOLD}${data_dir}${NC}"
  print "  Logs:     ${BOLD}cd ${data_dir} && ${dc} logs -f api${NC}"
  print "  Stop:     ${BOLD}cd ${data_dir} && ${dc} down${NC}"
  print ""
  print "${BOLD}Next steps${NC}"
  if [[ "$auth_on" == true ]]; then
    print "  1. Open ${BOLD}${ui_url}${NC} and create the ${BOLD}instance owner${NC} account"
    print "  2. On the home page, choose ${BOLD}Run sample workflow${NC}"
    print "  3. Click ${BOLD}Execute${NC} for your first successful run"
  else
    print "  1. Open ${BOLD}${ui_url}${NC}"
    print "  2. Choose ${BOLD}Run sample workflow${NC} (no account needed in try-out mode)"
    print "  3. Click ${BOLD}Execute${NC} for your first successful run"
    print ""
    print "${DIM}Auth is off. For production: re-run with --mode production or set AUTH_DISABLED=false + TLS.${NC}"
  fi
  print ""
  print "${DIM}Docs: https://github.com/real-limitless/OpenFlow/blob/main/docs/install.md${NC}"
  print ""
}

install_prebuilt() {
  local auth_default="$1" # true | false
  local auth_on=false
  [[ "$auth_default" == "false" ]] && auth_on=true

  need_docker
  local dc
  dc="$(compose_cmd)"
  ok "Compose: $dc"

  if ! [[ "$OPENFLOW_PORT" =~ ^[0-9]+$ ]] || (( OPENFLOW_PORT < 1 || OPENFLOW_PORT > 65535 )); then
    fail "Invalid port: $OPENFLOW_PORT"
  fi
  if port_in_use "$OPENFLOW_PORT"; then
    warn "Port ${OPENFLOW_PORT} looks busy. If start fails, re-run with --port 3001"
  else
    ok "Port ${OPENFLOW_PORT} available"
  fi

  write_compose_stack "$auth_default" "$OPENFLOW_HOME" "$OPENFLOW_PORT" "$OPENFLOW_IMAGE"
  export COMPOSE_PROJECT_NAME

  info "Pulling images (first run may take a few minutes)…"
  set +e
  # shellcheck disable=SC2086
  $dc pull
  local pull_rc=$?
  set -e
  if [[ $pull_rc -ne 0 ]]; then
    warn "Could not pull ${OPENFLOW_IMAGE}."
    warn "Try ${BOLD}--mode build${NC} (clone + docker compose up --build) if the image is not published yet."
  fi

  info "Starting OpenFlow…"
  # shellcheck disable=SC2086
  $dc up -d

  local ui_url="http://localhost:${OPENFLOW_PORT}"
  local ready=false
  if [[ "$SKIP_WAIT" == true ]]; then
    warn "Skipped readiness wait (--skip-wait)"
  else
    if wait_ready "$OPENFLOW_PORT"; then
      ready=true
    else
      warn "Timed out waiting for ${ui_url}/health/ready"
      warn "Recent API logs:"
      # shellcheck disable=SC2086
      $dc logs --tail=40 api 2>/dev/null || true
    fi
  fi

  # Detect auth from .env if it already existed
  if grep -qE '^AUTH_DISABLED=(false|0)' "$OPENFLOW_HOME/.env" 2>/dev/null; then
    auth_on=true
  fi

  finish_banner "$ready" "$ui_url" "$OPENFLOW_HOME" "$dc" "$auth_on"
  if [[ "$ready" == true ]]; then
    open_browser "$ui_url"
  fi
}

ensure_clone() {
  need_git
  if [[ -d "$CLONE_DIR/.git" ]]; then
    info "Repo already present at ${CLONE_DIR}"
    ok "Using existing clone"
    return 0
  fi
  if [[ -e "$CLONE_DIR" ]]; then
    fail "Path exists but is not a git repo: $CLONE_DIR"
  fi
  mkdir -p "$(dirname "$CLONE_DIR")"
  info "Cloning ${REPO_URL} → ${CLONE_DIR}"
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR"
  ok "Cloned"
}

install_build() {
  need_docker
  ensure_clone
  local dc
  dc="$(compose_cmd)"
  cd "$CLONE_DIR"

  if [[ ! -f .env ]]; then
    cp .env.example .env 2>/dev/null || true
    if [[ -f .env ]]; then
      local key
      key="$(gen_credentials_key)"
      if grep -qE '^CREDENTIALS_KEY=' .env 2>/dev/null; then
        local tmp
        tmp="$(mktemp)"
        sed "s|^CREDENTIALS_KEY=.*|CREDENTIALS_KEY=\"${key}\"|" .env >"$tmp"
        mv "$tmp" .env
      else
        printf '\nCREDENTIALS_KEY="%s"\n' "$key" >> .env
      fi
      ok "Prepared .env with CREDENTIALS_KEY"
    fi
  fi

  # Honour port via env if compose supports OPENFLOW_PORT; otherwise warn
  if grep -q '3000:3000' docker-compose.yml 2>/dev/null && [[ "$OPENFLOW_PORT" != "3000" ]]; then
    warn "Repo compose maps host 3000; requested port ${OPENFLOW_PORT} may need a manual ports edit"
  fi

  info "Building and starting stack (first build can take several minutes)…"
  # shellcheck disable=SC2086
  $dc up -d --build

  local ui_url="http://localhost:${OPENFLOW_PORT}"
  local ready=false
  if [[ "$SKIP_WAIT" != true ]] && wait_ready "$OPENFLOW_PORT"; then
    ready=true
  fi

  finish_banner "$ready" "$ui_url" "$CLONE_DIR" "$dc" false
  if [[ "$ready" == true ]]; then
    open_browser "$ui_url"
  fi
}

install_develop() {
  need_docker
  need_node
  ensure_clone
  cd "$CLONE_DIR"

  if [[ -x scripts/setup.sh ]]; then
    info "Running scripts/setup.sh…"
    bash scripts/setup.sh
  elif [[ -f package.json ]]; then
    info "Running npm run setup…"
    npm run setup
  else
    fail "No setup script found in $CLONE_DIR"
  fi

  print ""
  print "${GREEN}${BOLD}Development setup complete.${NC}"
  print ""
  print "  cd ${BOLD}${CLONE_DIR}${NC}"
  print "  ${BOLD}npm run dev${NC}     → http://localhost:3000"
  print "  ${BOLD}npm run tui${NC}     → interactive menu"
  print ""
  print "${BOLD}Next steps${NC}"
  print "  1. Start the app with ${BOLD}npm run dev${NC}"
  print "  2. Choose ${BOLD}Run sample workflow${NC} on the home page"
  print "  3. Click ${BOLD}Execute${NC} for your first successful run"
  print ""
}

# ── main ──────────────────────────────────────────────────────────────
main() {
  setup_prompt_stream

  # Default mode when non-interactive and unset
  if [[ -z "$MODE" ]]; then
    if [[ "$PROD" == true ]]; then
      MODE="production"
    elif [[ "$INTERACTIVE" == true ]]; then
      run_tui
    else
      MODE="tryout"
      banner
      info "Non-interactive try-out install (pass ${BOLD}--yes${NC} or flags; or run in a TTY for the menu)"
      print ""
    fi
  else
    banner
  fi

  # Normalize mode aliases
  local mode_l
  mode_l="$(printf '%s' "$MODE" | tr '[:upper:]' '[:lower:]')"
  case "$mode_l" in
    tryout|try|t) MODE="tryout" ;;
    production|prod|p) MODE="production" ;;
    build|b) MODE="build" ;;
    develop|dev|d) MODE="develop" ;;
    *) fail "Unknown mode: $MODE (tryout|production|build|develop)" ;;
  esac

  case "$MODE" in
    tryout)
      install_prebuilt "true"
      ;;
    production)
      install_prebuilt "false"
      ;;
    build)
      install_build
      ;;
    develop)
      install_develop
      ;;
  esac
}

main
