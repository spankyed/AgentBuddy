#!/bin/bash
set -e

# Script to generate ambient type declarations for DSL modules
# Uses rollup for fast bundling and TypeScript API for ambientization

echo "🚀 Generating DSL type definitions..."

# Change to API directory
cd "$(dirname "$0")/../packages/api"

# Create temp directory for intermediate files
mkdir -p temp

# Step 1: Bundle with rollup (parallel for speed)
echo "📦 Bundling type definitions with rollup..."

rollup -c rollup.database.config.js &
PID1=$!

rollup -c rollup.action.config.js &
PID2=$!

rollup -c rollup.prompt.config.js &
PID3=$!

# Wait for all rollup processes
wait $PID1 $PID2 $PID3

if [ $? -eq 0 ]; then
  echo "✅ All DSL types bundled successfully"
else
  echo "❌ Rollup bundling failed"
  exit 1
fi

# Step 2: Ambientize the bundled types (parallel)
echo "🔄 Converting to ambient declarations..."

tsx ../../scripts/ambientize-dts.mts \
  temp/database.d.ts \
  ../renderer/src/core/types/database-dsl.d.ts \
  DatabaseDSL &
PID1=$!

tsx ../../scripts/ambientize-dts.mts \
  temp/action.d.ts \
  ../renderer/src/core/types/action-dsl.d.ts \
  ActionDSL &
PID2=$!

tsx ../../scripts/ambientize-dts.mts \
  temp/prompt.d.ts \
  ../renderer/src/core/types/prompt-dsl.d.ts \
  PromptDSL &
PID3=$!

# Wait for all ambientizer processes
wait $PID1 $PID2 $PID3

if [ $? -eq 0 ]; then
  echo "✨ All DSL types converted to ambient declarations"
else
  echo "❌ Ambientization failed"
  exit 1
fi

# Clean up temp files
rm -rf temp

echo "🎉 DSL type generation complete!"