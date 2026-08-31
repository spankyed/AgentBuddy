#!/bin/bash
set -e

# Script runs from packages/api directory
echo "🔄 Generating DSL type definitions using Rollup..."

# Type-check the entry files (rollup-plugin-dts resolves source directly, so no emit needed)
echo "📦 Type-checking defs entry files..."
npx tsc -p defs/tsconfig.json --noEmit

# Run rollup to bundle the declarations into modules
echo "🎯 Bundling declarations with Rollup..."
npx rollup -c rollup-defs.config.mjs

# Check if rollup succeeded
if [ $? -eq 0 ]; then
  echo "✅ All DSL module types generated successfully"
else
  echo "❌ DSL module generation failed"
  exit 1
fi

echo "✨ DSL modules ready for Monaco Editor!"