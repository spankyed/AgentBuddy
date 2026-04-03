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
echo -e "${BLUE}[1/7]${NC} Cleaning previous builds..."
rm -rf dist/
rm -rf packages/*/dist/
echo -e "${GREEN}✓${NC} Clean complete"
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}[2/7]${NC} Installing dependencies..."
npm install --silent
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Compile default-setup
if [ -z "$SKIP_COMPILE" ]; then
  echo -e "${BLUE}[3/7]${NC} Compiling default-setup..."
  npm run compile
  echo -e "${GREEN}✓${NC} Default-setup compiled"
else
  echo -e "${BLUE}[3/7]${NC} Skipping default-setup compilation (SKIP_COMPILE set)"
fi
echo ""

# Step 4: Build TypeScript/Vite packages
echo -e "${BLUE}[4/7]${NC} Building packages..."
SKIP_DEFS_GEN=1 npm run build
echo -e "${GREEN}✓${NC} Packages built"
echo ""

# Step 5: Build native helpers
echo -e "${BLUE}[5/7]${NC} Building native helpers..."
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

# Step 6: Package with electron-builder (signing + notarization via env vars)
echo -e "${BLUE}[6/7]${NC} Packaging application..."
if [ -n "$APPLE_TEAM_ID" ]; then
  echo "  Code signing: enabled (Team ID: $APPLE_TEAM_ID)"
  echo "  Notarization: $([ -n "$APPLE_API_KEY_ID" ] && echo 'enabled' || echo 'disabled (missing APPLE_API_KEY_ID)')"
else
  echo "  Code signing: disabled (set APPLE_TEAM_ID to enable)"
fi
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

# Step 7: Verify signing (if credentials were provided)
if [ -n "$APPLE_TEAM_ID" ]; then
  echo -e "${BLUE}[7/7]${NC} Verifying code signing..."
  APP_BUNDLE="dist/mac-arm64/AgentBuddy.app"

  if codesign --verify --deep --strict "$APP_BUNDLE" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Code signature valid"
  else
    echo "  ⚠ Code signature verification failed"
  fi

  if xcrun stapler validate "$APP_BUNDLE" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Notarization ticket stapled"
  else
    echo "  ⚠ Notarization ticket not stapled (may still be processing)"
  fi

  spctl --assess --type exec --verbose "$APP_BUNDLE" 2>&1 || true
  echo ""
else
  echo -e "${BLUE}[7/7]${NC} Skipping signing verification (unsigned build)"
  echo ""
fi

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