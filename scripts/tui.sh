#!/usr/bin/env bash
# OpenFlow interactive manager + multi-step install wizard.
#   npm run tui
#   bash scripts/tui.sh
set -uo pipefail

OPENFLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$OPENFLOW_DIR"
cd "$OPENFLOW_DIR"

# shellcheck source=lib/setup-common.sh
source "$OPENFLOW_DIR/scripts/lib/setup-common.sh"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

caught_int=0
trap 'caught_int=1' INT

info()  { of_info "$@"; }
ok()    { of_ok "$@"; }
warn()  { of_warn "$@"; }
fail()  { echo -e "${RED}✘${NC}  $*"; }
print() { echo -e "$1"; }

has_node()   { of_has_cmd node; }
has_npm()    { of_has_cmd npm; }
has_docker() { of_has_cmd docker; }

compose_cmd() { of_compose_cmd; }
dc() { of_dc "$@"; }

show_stack_urls() {
  print ""
  info "Services:"
  print "  ${BOLD}Frontend + API${NC}  →  http://localhost:3000"
  print "  ${BOLD}PostgreSQL${NC}       →  localhost:15432"
  print "  ${BOLD}Redis${NC}            →  localhost:6379"
  print "  ${DIM}Worker runs inside the API container (RUN_WORKER=true)${NC}"
}

needs_node() {
  if ! has_node; then
    fail "Node.js is not installed."
    print "  Install from: ${BOLD}https://nodejs.org${NC}"
    print "  Or via: ${DIM}apt install nodejs${NC} / ${DIM}brew install node${NC}"
    return 1
  fi
  if ! has_npm; then
    fail "npm not found (should come with Node.js)."
    return 1
  fi
  return 0
}

needs_docker() {
  if compose_cmd &>/dev/null; then return 0; fi
  fail "Docker / docker-compose not found."
  print "  Install: ${BOLD}https://docs.docker.com/engine/install/${NC}"
  return 1
}

check_deps() {
  if [[ ! -d node_modules ]]; then
    warn "Dependencies not installed yet (run Install wizard first)."
    local yn
    read -r -p "  Continue anyway? [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]]
  fi
}

press_any_key() {
  read -n 1 -s -r -p $'  Press any key to return to menu\u2026'
  echo
}

run_quick() {
  local cmd="$1" label="$2"
  local skip_pause="${3:-}"
  caught_int=0
  print ""
  print "  ${BOLD}${cmd}${NC}"
  print "  ${DIM}──────────────────────────────────────${NC}"
  print ""
  eval "$cmd"
  local rc=$?
  if [[ $caught_int -eq 1 ]]; then
    caught_int=0
    print ""
    ok "$label stopped."
  elif [[ $rc -ne 0 ]]; then
    print ""
    fail "$label failed (exit $rc)."
  else
    print ""
    ok "$label done."
  fi
  if [[ "$skip_pause" != "nopause" ]]; then
    press_any_key
  fi
  return $rc
}

run_foreground() {
  local cmd="$1" label="$2"
  caught_int=0
  print ""
  info "Starting ${BOLD}$label${NC}"
  print "  ${DIM}Press Ctrl+C to stop and return to menu${NC}"
  print "  ${DIM}──────────────────────────────────────${NC}"
  print ""
  eval "$cmd"
  local rc=$?
  if [[ $caught_int -eq 1 ]]; then
    caught_int=0
    print ""
    ok "$label stopped."
  elif [[ $rc -ne 0 ]]; then
    print ""
    fail "$label exited with code $rc."
  else
    print ""
    ok "$label done."
  fi
  press_any_key
}

# ── Install wizard ────────────────────────────────────────

wizard_step_header() {
  local n="$1" total="$2" title="$3"
  print ""
  print "  ${BOLD}${CYAN}Step ${n}/${total}${NC}  ${BOLD}${title}${NC}"
  print "  ${DIM}──────────────────────────────────────${NC}"
  print ""
}

wizard_ask() {
  # usage: wizard_ask VAR "prompt" "default"
  local __var="$1" __prompt="$2" __default="${3:-}"
  local __ans
  if [[ -n "$__default" ]]; then
    read -r -p "  ${__prompt} [${__default}]: " __ans || true
    __ans="${__ans:-$__default}"
  else
    read -r -p "  ${__prompt}: " __ans || true
  fi
  printf -v "$__var" '%s' "$__ans"
}

wizard_yes_no() {
  # returns 0 for yes, 1 for no. default N unless second arg is Y
  local prompt="$1" default="${2:-N}" ans
  if [[ "$default" == "Y" || "$default" == "y" ]]; then
    read -r -p "  ${prompt} [Y/n] " ans || true
    [[ -z "$ans" || "$ans" =~ ^[Yy]$ ]]
  else
    read -r -p "  ${prompt} [y/N] " ans || true
    [[ "$ans" =~ ^[Yy]$ ]]
  fi
}

wizard_install() {
  clear
  print ""
  print "${BOLD}${CYAN}  OpenFlow — Install wizard${NC}"
  print "${DIM}  Guided setup so you are ready to rock.${NC}"
  print ""
  of_readiness_strip
  print ""

  local total=8
  local path_choice=""

  # Step 1 — path
  wizard_step_header 1 "$total" "Choose install path"
  print "  ${BOLD}A${NC}  Docker try-out     — only Docker; full stack in containers"
  print "  ${BOLD}B${NC}  Local development  — Node app on host + Postgres/Redis in Docker"
  print "  ${BOLD}C${NC}  Both               — same as B (recommended for contributors)"
  print ""
  print "  ${DIM}Docs: docs/onboarding.md · docs/install.md${NC}"
  print ""
  while true; do
    wizard_ask path_choice "Path (A/B/C)" "B"
    path_choice="$(echo "$path_choice" | tr '[:lower:]' '[:upper:]')"
    case "$path_choice" in
      A|B|C) break ;;
      *) warn "Enter A, B, or C." ;;
    esac
  done
  # B and C are the same operationally for host+docker infra
  if [[ "$path_choice" == "C" ]]; then path_choice="B"; fi

  # Step 2 — prereqs
  wizard_step_header 2 "$total" "Check prerequisites"
  if [[ "$path_choice" == "A" ]]; then
    if ! of_check_prereqs_docker; then
      press_any_key
      return 1
    fi
  else
    if ! of_check_prereqs_dev; then
      press_any_key
      return 1
    fi
  fi

  # Step 3 — env
  wizard_step_header 3 "$total" "Environment file"
  if [[ "$path_choice" == "A" ]]; then
    # Docker path: optional .env; still helpful for CREDENTIALS_KEY / auth
    if of_has_env_file; then
      of_info ".env already exists"
    else
      if wizard_yes_no "Create .env from .env.example?" "Y"; then
        of_ensure_env || { press_any_key; return 1; }
      else
        of_info "Skipping .env — Docker entrypoint can generate CREDENTIALS_KEY"
      fi
    fi
    if of_has_env_file; then
      of_ensure_credentials_key || true
      of_show_env_summary
    fi
  else
    of_ensure_env || { press_any_key; return 1; }
    of_ensure_credentials_key || { press_any_key; return 1; }
    of_show_env_summary
  fi

  # Step 4 — optional config
  wizard_step_header 4 "$total" "Optional configuration"
  print "  Press Enter to keep defaults. Secrets are written to .env only."
  print ""

  if of_has_env_file; then
    local auth_ans key_ans
    local cur_auth
    cur_auth="$(of_env_get AUTH_DISABLED 2>/dev/null || echo true)"
    print "  Auth is currently ${BOLD}AUTH_DISABLED=${cur_auth}${NC}"
    print "  ${DIM}(true = open local try-out; false = require login — use for real deploys)${NC}"
    if wizard_yes_no "Enable authentication now (AUTH_DISABLED=false)?" "N"; then
      of_env_set AUTH_DISABLED "false"
      of_ok "AUTH_DISABLED=false"
    else
      of_info "Leaving AUTH_DISABLED as-is (default true for local)"
    fi

    print ""
    print "  Assistant (editor AI) needs an OpenAI-compatible API key to chat."
    print "  ${DIM}Providers: OpenRouter, OpenAI, etc. Leave blank to skip.${NC}"
    # Read without echoing if terminal supports it for long keys
    read -r -p "  OPENFLOW_ASSISTANT_API_KEY (optional): " key_ans || true
    if [[ -n "${key_ans// }" ]]; then
      of_env_set OPENFLOW_ASSISTANT_API_KEY "$key_ans"
      of_ok "Assistant API key saved to .env"
    else
      of_info "No assistant key set (you can add it later in .env)"
    fi
  else
    of_info "No .env — skipping optional config"
  fi

  # Step 5 — dependencies
  wizard_step_header 5 "$total" "Install dependencies"
  if [[ "$path_choice" == "A" ]]; then
    of_info "Docker path: host npm deps not required"
    of_ok "Skipped"
  else
    if of_has_node_modules; then
      of_info "node_modules already present"
      if wizard_yes_no "Reinstall dependencies (npm ci)?" "N"; then
        of_install_deps || { press_any_key; return 1; }
      else
        of_ok "Using existing node_modules"
        # still ensure prisma client
        if needs_node; then
          of_info "Ensuring Prisma client…"
          npx prisma generate && of_ok "Prisma client ready" || of_warn "prisma generate failed"
        fi
      fi
    else
      of_install_deps || { press_any_key; return 1; }
    fi
  fi

  # Step 6 — infrastructure
  wizard_step_header 6 "$total" "Start infrastructure"
  if [[ "$path_choice" == "A" ]]; then
    of_start_full_stack || { press_any_key; return 1; }
  else
    of_start_db_redis || { press_any_key; return 1; }
    of_wait_postgres || { press_any_key; return 1; }
  fi

  # Step 7 — migrations
  wizard_step_header 7 "$total" "Database migrations"
  if [[ "$path_choice" == "A" ]]; then
    of_info "Docker entrypoint runs prisma migrate deploy on boot"
    of_ok "Handled by container"
  else
    of_migrate || { press_any_key; return 1; }
  fi

  # Step 8 — verify
  wizard_step_header 8 "$total" "Verify"
  if [[ "$path_choice" == "A" ]]; then
    of_wait_api || true
    show_stack_urls
    print ""
    echo -e "${GREEN}${BOLD}  Ready to rock.${NC}"
    print ""
    print "  Open:     ${BOLD}http://localhost:3000${NC}"
    print "  Logs:     ${BOLD}docker compose logs -f api${NC}"
    print "  Stop:     ${BOLD}docker compose down${NC}"
    print "  Security: ${DIM}AUTH_DISABLED defaults true — not for public internet${NC}"
  else
    print "  Stack pieces:"
    of_db_ready && of_ok "Postgres ready" || of_warn "Postgres not ready"
    of_redis_ready && of_ok "Redis ready" || of_warn "Redis not ready (optional for some execute paths)"
    of_has_node_modules && of_ok "Dependencies installed" || of_warn "Dependencies missing"
    of_has_credentials_key && of_ok "CREDENTIALS_KEY set" || of_warn "CREDENTIALS_KEY missing"
    print ""
    echo -e "${GREEN}${BOLD}  Ready to rock.${NC}"
    print ""
    print "  Start the app:  ${BOLD}npm run dev${NC}"
    print "  Or from this menu: ${BOLD}Run Dev Server${NC}"
    print "  Open:           ${BOLD}http://localhost:3000${NC}"
    print "  Full Docker:    ${BOLD}docker compose up -d${NC}"
    print "  Docs:           ${BOLD}docs/onboarding.md${NC}"
    print ""
    if wizard_yes_no "Start the dev server now?" "Y"; then
      press_any_key
      run_foreground "npm run dev" "Dev Server"
      return 0
    fi
  fi

  print ""
  press_any_key
}

show_help_docs() {
  clear
  print ""
  print "${BOLD}${CYAN}  OpenFlow — Help & docs${NC}"
  print "  ${DIM}──────────────────────────────────────${NC}"
  print ""
  print "  ${BOLD}Getting started${NC}"
  print "    README.md"
  print "    docs/onboarding.md     — new developer path"
  print "    docs/install.md        — Docker, prod, config reference"
  print ""
  print "  ${BOLD}Security${NC}"
  print "    SECURITY.md            — secrets, rotation, reporting"
  print "    bash scripts/check-no-secrets.sh"
  print ""
  print "  ${BOLD}Contributing${NC}"
  print "    CONTRIBUTING.md"
  print "    docs/clean-room.md     — node spec/implement pipeline"
  print "    docs/sdk/OVERVIEW.md   — Plugin SDK"
  print ""
  print "  ${BOLD}Default URLs (local)${NC}"
  print "    App:      http://localhost:3000"
  print "    Health:   http://localhost:3000/health"
  print "    Ready:    http://localhost:3000/health/ready"
  print "    Postgres: localhost:15432  (user/db: openflow)"
  print "    Redis:    localhost:6379"
  print ""
  print "  ${BOLD}One-shot setup (no TUI)${NC}"
  print "    npm run setup"
  print "    docker compose up -d"
  print ""
  of_readiness_strip
  print ""
  press_any_key
}

# ── Menu ──────────────────────────────────────────────────

menu_labels=()
menu_actions=()

add_item() {
  menu_actions+=("$1")
  menu_labels+=("$2")
}

add_sep() {
  menu_actions+=("__sep__")
  menu_labels+=("$1")
}

init_menu() {
  menu_labels=()
  menu_actions=()

  add_item wizard        "🚀  Install wizard (multi-step)"
  add_item setup         "⚡  Quick setup (all-in-one)"
  add_sep  "── Run ──"
  add_item dev           "▶   Run Dev Server"
  add_item api-dev       "⚡  Run API Only (dev)"
  add_item build         "🔨  Build Project"
  add_item preview       "▶️   Preview Build"
  add_sep  "── Docker ──"
  add_item docker-start  "🐳  Start Stack"
  add_item docker-update "🔄  Update Stack (rebuild + restart)"
  add_item docker-restart "🔁  Restart Stack"
  add_item docker-stop   "🛑  Stop Stack"
  add_item docker-status "📋  Stack Status"
  add_item docker-logs   "📜  Stack Logs (follow)"
  add_sep  "── Database ──"
  add_item db-migrate    "🗄️   Database Migrate"
  add_item db-studio     "🗄️   Database Studio"
  add_item db-generate   "🔧  Generate Prisma Client"
  add_sep  "── Quality ──"
  add_item test          "🧪  Run Tests"
  add_item lint          "📐  Lint Code"
  add_item format        "✨  Format Code"
  add_item secrets-check "🔒  Check no secrets committed"
  add_item git-update    "🔄  Git Update (pull + install)"
  add_sep  "── Help ──"
  add_item help          "📚  Help & docs"
  add_item exit          "🚪  Exit"
}

cols() {
  tput cols 2>/dev/null || echo 80
}

show_menu() {
  clear
  print ""
  print "${BOLD}${CYAN}  ██████╗ ██████╗ ███████╗███╗   ██╗███████╗██╗      ██████╗ ██╗    ██╗${NC}"
  print "${BOLD}${CYAN} ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██║     ██╔═══██╗██║    ██║${NC}"
  print "${BOLD}${CYAN} ██║   ██║██████╔╝█████╗  ██╔██╗ ██║█████╗  ██║     ██║   ██║██║ █╗ ██║${NC}"
  print "${BOLD}${CYAN} ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══╝  ██║     ██║   ██║██║███╗██║${NC}"
  print "${BOLD}${CYAN} ╚██████╔╝██║     ███████╗██║ ╚████║██║     ███████╗╚██████╔╝╚███╔███╔╝${NC}"
  print "${BOLD}${CYAN}  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ ${NC}"
  print "${BOLD}${CYAN}                          Manager${NC}"
  print ""

  if has_node; then print "  ${DIM}$(node -v)  node${NC}"; fi
  if has_docker; then
    local dv; dv="$(docker --version 2>/dev/null | awk '{print $3}')"
    print "  ${DIM}${dv}  docker${NC}"
  fi
  of_readiness_strip
  print ""

  # Render menu: separators are not numbered; only actionable items get numbers
  local i label action display_num=0
  local -a num_to_action=()
  for (( i=0; i<${#menu_labels[@]}; i++ )); do
    label="${menu_labels[$i]}"
    action="${menu_actions[$i]}"
    if [[ "$action" == "__sep__" ]]; then
      print ""
      print "  ${DIM}${label}${NC}"
    else
      display_num=$((display_num + 1))
      num_to_action+=("$action")
      printf "  %-2s %s\n" "${display_num}." "$label"
    fi
  done
  # stash for dispatch resolution
  MENU_ACTION_MAP=("${num_to_action[@]}")

  print ""
  print "  ${DIM}Enter a number (0 to quit)${NC}"
}

# populated each show_menu
MENU_ACTION_MAP=()

dispatch() {
  local id="$1"
  case "$id" in
    wizard)      wizard_install ;;
    setup)       run_foreground "bash scripts/setup.sh" "Quick setup" ;;
    help)        show_help_docs ;;
    secrets-check) run_quick "bash scripts/check-no-secrets.sh" "Secret hygiene check" ;;

    install)     needs_node   || return 1; run_quick      "npm install"                  "Dependency installation"    ;;
    dev)         needs_node   || return 1; check_deps     || return 1; run_foreground "npm run dev"                  "Dev Server"                 ;;
    api-dev)     needs_node   || return 1; check_deps     || return 1; run_foreground "npm run dev:api"              "API Dev Server"             ;;
    build)       needs_node   || return 1; check_deps     || return 1; run_quick      "npm run build"                "Build"                      ;;
    preview)     needs_node   || return 1; check_deps     || return 1; run_foreground "npm run preview"              "Preview"                    ;;

    docker-start)
      needs_docker || return 1
      if run_quick "dc up -d --remove-orphans" "Start Stack" nopause; then
        show_stack_urls
      fi
      press_any_key
      ;;

    docker-update)
      needs_docker || return 1
      print ""
      info "Rebuilding images and recreating containers…"
      print "  ${DIM}This applies local code changes to the running stack.${NC}"
      print ""
      if ! run_quick "dc build" "Build images" nopause; then
        press_any_key
        return 1
      fi
      if run_quick "dc up -d --force-recreate --remove-orphans" "Update Stack" nopause; then
        show_stack_urls
        print ""
        info "Container status:"
        dc ps 2>/dev/null || true
      fi
      press_any_key
      ;;

    docker-restart)
      needs_docker || return 1
      if run_quick "dc up -d --force-recreate --remove-orphans" "Restart Stack" nopause; then
        show_stack_urls
      fi
      press_any_key
      ;;

    docker-stop)
      needs_docker || return 1
      run_quick "dc down --remove-orphans" "Stop Stack"
      ;;

    docker-status)
      needs_docker || return 1
      print ""
      info "Stack status"
      print "  ${DIM}──────────────────────────────────────${NC}"
      print ""
      dc ps
      print ""
      show_stack_urls
      of_readiness_strip
      press_any_key
      ;;

    docker-logs)
      needs_docker || return 1
      run_foreground "dc logs -f --tail=100" "Stack Logs"
      ;;

    db-migrate)  needs_node   || return 1; check_deps     || return 1; run_quick      "npm run db:migrate"           "Database migration"         ;;
    db-studio)   needs_node   || return 1; check_deps     || return 1; run_foreground "npm run db:studio"           "Prisma Studio"              ;;
    db-generate) needs_node   || return 1; check_deps     || return 1; run_quick      "npm run db:generate"          "Prisma client generation"   ;;
    test)        needs_node   || return 1; check_deps     || return 1; run_quick      "npm test"                     "Tests"                      ;;
    lint)        needs_node   || return 1; check_deps     || return 1; run_quick      "npm run lint"                 "Lint"                       ;;
    format)      needs_node   || return 1; check_deps     || return 1; run_quick      "npm run format"               "Formatting"                 ;;
    git-update)  needs_node   || return 1;                  run_quick      "git pull && npm install"        "Git update"                 ;;
    exit)        print ""; ok "Goodbye!"; exit 0 ;;
    *)           warn "Unknown action: $id"; press_any_key ;;
  esac
}

main() {
  init_menu
  while true; do
    if [[ $caught_int -eq 1 ]]; then
      caught_int=0; print ""; ok "Goodbye!"; exit 0
    fi
    show_menu
    local choice
    read -r -p "  ● " choice || true
    if [[ $caught_int -eq 1 ]]; then continue; fi
    if [[ -z "$choice" ]]; then continue; fi
    if [[ "$choice" == "0" ]]; then print ""; ok "Goodbye!"; exit 0; fi
    if ! [[ "$choice" =~ ^[0-9]+$ ]]; then
      warn "Invalid input."; press_any_key; continue
    fi
    local idx=$((choice - 1))
    if (( idx < 0 || idx >= ${#MENU_ACTION_MAP[@]} )); then
      warn "Invalid choice."; press_any_key; continue
    fi
    dispatch "${MENU_ACTION_MAP[$idx]}"
  done
}

main "$@"
