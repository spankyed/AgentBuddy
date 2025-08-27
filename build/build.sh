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
rm -rf dist/ 
rm -rf packages/*/dist/
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
for module in lmdb node-pty usearch; do
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

# Quick validation
APP_PATH="dist/mac-arm64/AgentBuddy.app/Contents/Resources/app"
if [ ! -f "$APP_PATH/packages/api/dist/server.js" ]; then
  echo -e "  ❌ Build validation failed: API server not found"
  exit 1
fi
echo -e "${GREEN}✓${NC} Application packaged"
echo ""

# Step 6: Copy LMDB databases to user data directory (for first-time setup)
echo -e "${BLUE}[6/6]${NC} Setting up initial databases..."
LMDB_SOURCE="packages/api/src/persistence/data/untracked"
USER_DATA_DIR="$HOME/Library/Application Support/abuddy"

# Copy LMDB database directories
DATABASES=("ears-db" "ears-trace" "secrets-db")
DB_COPIED=0

for DB in "${DATABASES[@]}"; do
  if [ -d "$LMDB_SOURCE/$DB" ]; then
    mkdir -p "$USER_DATA_DIR/$DB"
    # Copy database files (overwrite to ensure they're updated)
    cp -f "$LMDB_SOURCE/$DB"/*.mdb "$USER_DATA_DIR/$DB/" 2>/dev/null || true
    if [ $? -eq 0 ]; then
      ((DB_COPIED++))
      echo -e "  ${GREEN}✓${NC} Copied $DB database"
    fi
  else
    echo -e "  ⚠️  $DB not found in development"
  fi
done

if [ $DB_COPIED -gt 0 ]; then
  echo -e "${GREEN}✓${NC} Copied $DB_COPIED database(s) to user data"
else
  echo -e "  ❌ No databases found to copy"
  echo -e "  This will cause initialization errors!"
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