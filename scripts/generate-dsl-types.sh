#!/bin/bash
set -e

# Script runs from packages/api directory
echo "🔄 Generating DSL type definitions..."

# Generate database DSL
echo "  📦 Generating database DSL..."
npx dts-bundle-generator dsl/database.ts \
  --project dsl/tsconfig.dts.json \
  --no-check \
  --out-file ../packages/renderer/src/core/types/database-dsl.d.ts \
  --inline-declare-global \
  --inline-declare-externals \
  --export-referenced-types \
  --umd-module-name DatabaseDSL \
  --silent

# Generate action DSL
echo "  📦 Generating action DSL..."
npx dts-bundle-generator dsl/action.ts \
  --project dsl/tsconfig.dts.json \
  --no-check \
  --out-file ../packages/renderer/src/core/types/action-dsl.d.ts \
  --inline-declare-global \
  --inline-declare-externals \
  --export-referenced-types \
  --umd-module-name ActionDSL \
  --silent

# Generate prompt DSL
echo "  📦 Generating prompt DSL..."
npx dts-bundle-generator dsl/prompt.ts \
  --project dsl/tsconfig.dts.json \
  --no-check \
  --out-file ../packages/renderer/src/core/types/prompt-dsl.d.ts \
  --inline-declare-global \
  --inline-declare-externals \
  --export-referenced-types \
  --umd-module-name PromptDSL \
  --silent

echo "✅ DSL types generated successfully"

# Convert to ambient declarations
node ../../scripts/convert-dsl-to-ambient.mjs