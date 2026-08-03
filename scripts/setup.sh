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

of_setup_all_dev
