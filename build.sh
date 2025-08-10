#!/bin/bash

# Final Production Build Script for AgentBuddy
# Simple, reliable, no unnecessary complexity

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "🚀 AgentBuddy Production Build"
echo "=========================================="
echo ""

# Step 1: Clean previous builds
echo -e "${BLUE}[1/5]${NC} Cleaning previous builds..."
rm -rf dist/ packages/*/dist/
rm -rf packages/api/node_modules packages/api/package-lock.json
echo -e "${GREEN}✓${NC} Clean complete"
echo ""

# Step 2: Install root dependencies
echo -e "${BLUE}[2/5]${NC} Installing dependencies..."
npm install --silent
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Build TypeScript/Vite packages
echo -e "${BLUE}[3/5]${NC} Building packages..."
npm run build
echo -e "${GREEN}✓${NC} Packages built"
echo ""

# Step 4: Setup API dependencies and rebuild native modules
echo -e "${BLUE}[4/5]${NC} Setting up API with native modules..."
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
echo -e "${BLUE}[5/5]${NC} Packaging application..."
npx electron-builder build --config electron-builder.mjs --mac --arm64
echo -e "${GREEN}✓${NC} Application packaged"
echo ""

echo "=========================================="
echo "✅ Build Complete!"
echo "=========================================="
echo ""
echo "📁 Output:"
echo "  • App: dist/mac-arm64/root.app"
echo "  • DMG: dist/root-*.dmg"
echo "  • ZIP: dist/root-*.zip"
echo ""
echo "🧪 Test with: ./run_with_logs.sh"
echo ""