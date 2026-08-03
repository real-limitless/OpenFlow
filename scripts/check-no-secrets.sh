#!/usr/bin/env bash
# Lightweight guard: fail if secrets look committed or staged.
#   bash scripts/check-no-secrets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail() { echo -e "${RED}✘${NC}  $*"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
ok()   { echo -e "${GREEN}✔${NC}  $*"; }

errors=0

# 1) .env must never be tracked
if git ls-files --error-unmatch .env &>/dev/null; then
  echo -e "${RED}✘${NC}  .env is tracked by git — untrack it and rotate CREDENTIALS_KEY"
  errors=$((errors + 1))
fi

# 2) No other env files tracked except .env.example
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if [[ "$f" != ".env.example" ]]; then
    echo -e "${RED}✘${NC}  Unexpected env file tracked: $f"
    errors=$((errors + 1))
  fi
done < <(git ls-files | grep -E '(^|/)\.env(\.|$)' || true)

# 3) CREDENTIALS_KEY with a real 64-hex value must not appear outside .env (untracked)
#    Check tracked content only.
if git grep -nE 'CREDENTIALS_KEY=["'\'']?[0-9a-fA-F]{64}' -- \
  ':!.env.example' ':!docs/**' ':!SECURITY.md' ':!scripts/check-no-secrets.sh' &>/dev/null; then
  echo -e "${RED}✘${NC}  Tracked file contains a filled CREDENTIALS_KEY"
  git grep -nE 'CREDENTIALS_KEY=["'\'']?[0-9a-fA-F]{64}' -- \
    ':!.env.example' ':!docs/**' ':!SECURITY.md' ':!scripts/check-no-secrets.sh' || true
  errors=$((errors + 1))
fi

# 4) Private key material in tracked files
if git grep -nE 'BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY' -- \
  ':!**/__tests__/**' ':!docs/**' &>/dev/null; then
  echo -e "${RED}✘${NC}  Tracked private key material found"
  errors=$((errors + 1))
fi

# 5) Remind about local-only defaults (not a failure)
if git grep -q 'POSTGRES_PASSWORD: openflow' -- docker-compose.yml 2>/dev/null; then
  warn "Compose uses local-only Postgres password 'openflow' (documented; not production)."
fi

if [[ $errors -gt 0 ]]; then
  fail "$errors secret hygiene check(s) failed. See SECURITY.md."
fi

ok "No committed secrets detected."
exit 0
