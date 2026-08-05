#!/usr/bin/env bash
# Back-compat installer entrypoint.
# Prefer the full TUI installer:
#   curl -fsSL …/scripts/get-openflow.sh | bash
#
# This wrapper runs get-openflow.sh in non-interactive mode (--yes).
# All flags are forwarded (e.g. --prod --port 3001).
set -euo pipefail

REPO_RAW="${OPENFLOW_REPO_RAW:-https://raw.githubusercontent.com/real-limitless/OpenFlow/main}"
GET_URL="${OPENFLOW_GET_URL:-${REPO_RAW}/scripts/get-openflow.sh}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"

if [[ -n "${DIR:-}" && -f "${DIR}/get-openflow.sh" ]]; then
  exec bash "${DIR}/get-openflow.sh" --yes "$@"
fi

# Standalone curl|bash of install.sh — fetch the full installer
if command -v curl &>/dev/null; then
  exec bash -c "$(curl -fsSL "$GET_URL")" -- --yes "$@"
elif command -v wget &>/dev/null; then
  exec bash -c "$(wget -qO- "$GET_URL")" -- --yes "$@"
else
  echo "curl or wget is required to download get-openflow.sh" >&2
  exit 1
fi
