#!/bin/bash
# Clean JSON export script - outputs only JSON without npm/console noise
exec node "$(dirname "$0")/../../../../scripts/with-source.mjs" npx tsx "$(dirname "$0")/export-json.ts" "$@" 2>/dev/null