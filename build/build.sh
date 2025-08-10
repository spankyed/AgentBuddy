#!/bin/bash

# Final Production Build Script for AgentBuddy
# Simple, reliable, no unnecessary complexity

set -e  # Exit on error

# Get the directory where this script is located and move to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "🚀 AgentBuddy Production Build"
echo "=========================================="
echo ""

# Step 1: Clean previous builds
echo -e "${BLUE}[1/6]${NC} Cleaning previous builds..."
rm -rf dist/ packages/*/dist/
rm -rf packages/api/node_modules packages/api/package-lock.json
echo -e "${GREEN}✓${NC} Clean complete"
echo ""

# Step 2: Install root dependencies
echo -e "${BLUE}[2/6]${NC} Installing dependencies..."
npm install --silent
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Build TypeScript/Vite packages
echo -e "${BLUE}[3/6]${NC} Building packages..."
npm run build
echo -e "${GREEN}✓${NC} Packages built"
echo ""

# Step 4: Setup API dependencies and rebuild native modules
echo -e "${BLUE}[4/6]${NC} Setting up API with native modules..."
cd packages/api

# Install without workspace hoisting
npm install --no-workspaces --silent

# Rebuild native modules for Electron
npx @electron/rebuild --force --module-dir . --electron-version 37.2.4 --arch arm64

# Verify native modules
for module in better-sqlite3 node-pty usearch; do
  if [ -d "node_modules/$module" ]; then
    echo -e "  ${GREEN}✓${NC} $module"
  fi
done

cd ../..
echo -e "${GREEN}✓${NC} Native modules ready"
echo ""

# Step 5: Package with electron-builder
echo -e "${BLUE}[5/6]${NC} Packaging application..."
npx electron-builder build --config electron-builder.mjs --mac --arm64
echo -e "${GREEN}✓${NC} Application packaged"
echo ""

# Step 6: Copy snapshots to user data directory (for first-time setup)
echo -e "${BLUE}[6/6]${NC} Setting up initial data..."
SNAPSHOT_SOURCE="packages/api/src/core/data/snapshots"
USER_DATA_DIR="$HOME/Library/Application Support/abuddy"

if [ -d "$SNAPSHOT_SOURCE" ] && [ "$(ls -A $SNAPSHOT_SOURCE 2>/dev/null)" ]; then
  mkdir -p "$USER_DATA_DIR/snapshots"
  cp -n "$SNAPSHOT_SOURCE"/*.json "$USER_DATA_DIR/snapshots/" 2>/dev/null || true
  echo -e "${GREEN}✓${NC} Initial data prepared"
else
  echo -e "  ℹ️  No snapshots found to copy"
fi
echo ""

echo "=========================================="
echo "✅ Build Complete!"
echo "=========================================="
echo ""
echo "📁 Output:"
echo "  • App: dist/mac-arm64/abuddy.app"
echo "  • DMG: dist/abuddy-*.dmg"
echo "  • ZIP: dist/abuddy-*.zip"
echo ""
echo "🧪 Test with: ./build/run_with_logs.sh"
echo ""
echo "⚠️  Note: Native modules were rebuilt for Electron."
echo "   To run development mode again, rebuild for system Node:"
echo "   cd packages/api && npm rebuild"
echo ""