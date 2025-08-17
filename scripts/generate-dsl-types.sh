#!/bin/bash
set -e

# Script runs from packages/api directory
echo "🔄 Generating DSL type definitions in parallel..."

# Run all three generations in parallel and capture their PIDs
(
  npx dts-bundle-generator dsl/database.ts \
    --project dsl/tsconfig.dts.json \
    --no-check \
    --out-file ../renderer/src/core/types/database-dsl.d.ts \
    --inline-declare-global \
    --inline-declare-externals \
    --export-referenced-types \
    --umd-module-name DatabaseDSL \
    --silent && echo "  ✅ Database DSL generated"
) &
PID1=$!

(
  npx dts-bundle-generator dsl/action.ts \
    --project dsl/tsconfig.dts.json \
    --no-check \
    --out-file ../renderer/src/core/types/action-dsl.d.ts \
    --inline-declare-global \
    --inline-declare-externals \
    --export-referenced-types \
    --umd-module-name ActionDSL \
    --silent && echo "  ✅ Action DSL generated"
) &
PID2=$!

(
  npx dts-bundle-generator dsl/prompt.ts \
    --project dsl/tsconfig.dts.json \
    --no-check \
    --out-file ../renderer/src/core/types/prompt-dsl.d.ts \
    --inline-declare-global \
    --inline-declare-externals \
    --export-referenced-types \
    --umd-module-name PromptDSL \
    --silent && echo "  ✅ Prompt DSL generated"
) &
PID3=$!

# Wait for all background processes to complete
wait $PID1 $PID2 $PID3

# Check if all processes succeeded
if [ $? -eq 0 ]; then
  echo "✅ All DSL types generated successfully"
else
  echo "❌ One or more DSL generations failed"
  exit 1
fi

# Convert to ambient declarations using ts-morph
node ../../scripts/convert-to-ambient-ts-morph.mjs