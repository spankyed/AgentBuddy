#!/bin/bash

# Production Build Script for AgentBuddy
# Simplified build process with ASAR packaging

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
echo -e "${GREEN}✓${NC} Clean complete"
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}[2/6]${NC} Installing dependencies..."
npm install --silent
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Compile default-setup
if [ -z "$SKIP_COMPILE" ]; then
  echo -e "${BLUE}[3/6]${NC} Compiling default-setup..."
  npm run compile
  echo -e "${GREEN}✓${NC} Default-setup compiled"
else
  echo -e "${BLUE}[3/6]${NC} Skipping default-setup compilation (SKIP_COMPILE set)"
fi
echo ""

# Step 4: Build TypeScript/Vite packages
echo -e "${BLUE}[4/6]${NC} Building packages..."
SKIP_DSL_GEN=1 npm run build
echo -e "${GREEN}✓${NC} Packages built"
echo ""

# Step 5: Build native helpers
echo -e "${BLUE}[5/6]${NC} Building native helpers..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    npm run build:speech-macos
    echo -e "${GREEN}✓${NC} Native helpers built"
else
    echo -e "${GREEN}✓${NC} Skipped (not macOS)"
fi
echo ""

# Validate native helpers exist before packaging
if [[ "$OSTYPE" == "darwin"* ]] && [ ! -f "native/speech/macos/SpeechHelper" ]; then
    echo -e "  ❌ Build failed: native/speech/macos/SpeechHelper not found"
    exit 1
fi

# Step 6: Package with electron-builder
echo -e "${BLUE}[6/6]${NC} Packaging application..."
npx electron-builder build --config electron-builder.mjs --mac --arm64

# Quick validation - check for app directory (ASAR disabled)
APP_PATH="dist/mac-arm64/AgentBuddy.app/Contents/Resources"
if [ ! -d "$APP_PATH/app" ]; then
  echo -e "  ❌ Build validation failed: app directory not found"
  exit 1
fi
if [ ! -d "$APP_PATH/app/packages/api" ]; then
  echo -e "  ❌ Build validation failed: API package not found"
  exit 1
fi
echo -e "${GREEN}✓${NC} Application packaged"
echo ""

echo "=========================================="
echo "✅ Build Complete!"
echo "=========================================="
echo ""
echo "📁 Output:"
echo "  • App: dist/mac-arm64/AgentBuddy.app"
echo "  • DMG: dist/AgentBuddy-*.dmg"
echo "  • ZIP: dist/AgentBuddy-*.zip"
echo ""
echo "📦 Next steps:"
echo "  1. Copy dev data: npm run copy-dev-data"
echo "  2. Test the app: npm run prod-app"
echo ""