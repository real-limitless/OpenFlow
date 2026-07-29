#!/usr/bin/env bash
# Usage: ./scripts/factory/test-batch.sh [NN]
# Example: ./scripts/factory/test-batch.sh 00
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NN="${1:-00}"
cd "$ROOT"
npx vitest run "src/lib/engine/__tests__/batches/batch-${NN}"
