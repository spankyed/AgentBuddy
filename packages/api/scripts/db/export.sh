#!/bin/bash
# Clean JSON export script - outputs only JSON without npm/console noise
exec npx tsx "$(dirname "$0")/export-json.ts" "$@" 2>/dev/null