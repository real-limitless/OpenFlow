#!/usr/bin/env bash
set -uo pipefail

OPENFLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$OPENFLOW_DIR"

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

info()  { echo -e "${BLUE}ℹ${NC}  $1"; }
ok()    { echo -e "${GREEN}✔${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()  { echo -e "${RED}✘${NC}  $1"; }
print() { echo -e "$1"; }

has_node()   { command -v node &>/dev/null; }
has_npm()    { command -v npm  &>/dev/null; }
has_docker() { command -v docker &>/dev/null; }
compose_v2() { docker compose version &>/dev/null 2>&1; }
compose_v1() { command -v docker-compose &>/dev/null; }

# Resolve docker compose command (v2 preferred, then podman-compose via docker shim, then v1)
compose_cmd() {
  if has_docker && compose_v2; then
    echo "docker compose"
  elif compose_v1; then
    echo "docker-compose"
  else
    return 1
  fi
}

dc() {
  local cmd
  cmd="$(compose_cmd)" || return 1
  # shellcheck disable=SC2086
  $cmd "$@"
}

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
    warn "Dependencies not installed yet (run option 1 first)."
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

menu_labels=()
menu_actions=()

add_item() {
  menu_actions+=("$1")
  menu_labels+=("$2")
}

init_menu() {
  menu_labels=()
  menu_actions=()
  add_item setup          "⚡  First-time Setup"
  add_item install        "📦  Install Dependencies"
  add_item dev            "🚀  Run Dev Server"
  add_item api-dev        "⚡  Run API Only (dev)"
  add_item build          "🔨  Build Project"
  add_item preview        "▶️   Preview Build"
  add_item docker-start   "🐳  Start Stack"
  add_item docker-update  "🔄  Update Stack (rebuild + restart)"
  add_item docker-restart "🔁  Restart Stack"
  add_item docker-stop    "🛑  Stop Stack"
  add_item docker-status  "📋  Stack Status"
  add_item docker-logs    "📜  Stack Logs (follow)"
  add_item db-migrate     "🗄️   Database Migrate"
  add_item db-studio      "🗄️   Database Studio"
  add_item db-generate    "🔧  Generate Prisma Client"
  add_item test           "🧪  Run Tests"
  add_item lint           "📐  Lint Code"
  add_item format         "✨  Format Code"
  add_item git-update     "🔄  Git Update (pull + install)"
  add_item exit           "🚪  Exit"
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
  print ""

  local n="${#menu_labels[@]}"
  local tw
  tw="$(cols)"

  if (( tw >= 72 )); then
    local half=$(( (n + 1) / 2 ))
    for (( i=0; i<half; i++ )); do
      local j=$(( i + half ))
      if (( j < n )); then
        printf "  %-2s %s    %-2s %s\n" \
          "$((i+1))." "${menu_labels[$i]}" \
          "$((j+1))." "${menu_labels[$j]}"
      else
        printf "  %-2s %s\n" "$((i+1))." "${menu_labels[$i]}"
      fi
    done
  else
    for (( i=0; i<n; i++ )); do
      printf "  %-2s %s\n" "$((i+1))." "${menu_labels[$i]}"
    done
  fi

  print ""
  print "  ${DIM}Enter a number (0 to quit)${NC}"
}

dispatch() {
  local id="$1"
  case "$id" in
    setup)       run_foreground "bash scripts/setup.sh" "First-time Setup" ;;
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
    if (( idx < 0 || idx >= ${#menu_actions[@]} )); then
      warn "Invalid choice."; press_any_key; continue
    fi
    dispatch "${menu_actions[$idx]}"
  done
}
main "$@"

