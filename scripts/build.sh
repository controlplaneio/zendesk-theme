#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for centre in external internal; do
  { cat shared/base.css; echo; grep -v '^@import' "$centre/overrides.css"; } > "$centre/style.css"
  echo "Built $centre/style.css"
done
