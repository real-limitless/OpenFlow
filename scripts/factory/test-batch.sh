#!/usr/bin/env bash
# Usage: ./scripts/factory/test-batch.sh [NN]
# Example: ./scripts/factory/test-batch.sh 00
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NN="${1:-00}"
cd "$ROOT"
shopt -s nullglob
files=(src/lib/engine/__tests__/batches/batch-${NN}*.test.ts src/lib/engine/__tests__/batches/batch-${NN}/)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No batch-${NN} tests yet (ok if factory has not implemented this batch)."
  exit 0
fi
npx vitest run "src/lib/engine/__tests__/batches/batch-${NN}"
