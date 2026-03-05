#!/bin/bash
set -e

# Script runs from packages/api directory
echo "🔄 Generating DSL type definitions using Rollup..."

# First, compile the TypeScript to get .d.ts files
echo "📦 Compiling TypeScript declarations..."
npx tsc -p dsl/tsconfig.json

# Run rollup to bundle the declarations into modules
echo "🎯 Bundling declarations with Rollup..."
npx rollup -c rollup-dsl.config.mjs

# Check if rollup succeeded
if [ $? -eq 0 ]; then
  echo "✅ All DSL module types generated successfully"
else
  echo "❌ DSL module generation failed"
  exit 1
fi

echo "✨ DSL modules ready for Monaco Editor!"