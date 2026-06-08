#!/bin/bash

# Production Build Script for AgentBuddy
# ASAR disabled — API server runs as a separate child process and needs filesystem access

set -e  # Exit on error

# Get the directory where this script is located and move to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Platform detection
IS_MAC=false; IS_WIN=false
if [[ "$OSTYPE" == "darwin"* ]]; then IS_MAC=true
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then IS_WIN=true
fi

validate_api_package() {
  if [ ! -d "$1/packages/api" ]; then
    echo -e "  ❌ Build validation failed: API package not found"
    exit 1
  fi
}

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
# Force development mode so devDependencies (typescript, @types/*, etc.) are installed
# even if NODE_ENV=production leaked from a previous session (see docs/issues/node-env-build-failure.md)
NODE_ENV=development npm install --loglevel warn
unset NODE_ENV

echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Compile default-setup
if [ -z "$SKIP_COMPILE" ]; then
  echo -e "${BLUE}[3/7]${NC} Compiling default-setup..."
  npm run compile:prod
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
if $IS_MAC; then
    npm run build:speech-macos
    echo -e "${GREEN}✓${NC} Native helpers built"
else
    echo -e "${GREEN}✓${NC} Skipped (not macOS)"
fi
echo ""

# Validate native helpers exist before packaging
if $IS_MAC && [ ! -f "native/speech/macos/SpeechHelper" ]; then
    echo -e "  ❌ Build failed: native/speech/macos/SpeechHelper not found"
    exit 1
fi

# Step 6: Package with electron-builder (signing + notarization via env vars)
echo -e "${BLUE}[6/7]${NC} Packaging application..."

if $IS_MAC; then
  if [ -n "$APPLE_TEAM_ID" ]; then
    echo "  Code signing: enabled (Team ID: $APPLE_TEAM_ID)"
    echo "  Notarization: $([ -n "$APPLE_API_KEY_ID" ] && echo 'enabled' || echo 'disabled (missing APPLE_API_KEY_ID)')"
  else
    echo "  Code signing: disabled (set APPLE_TEAM_ID to enable)"
  fi
  # Selectively rebuild only node-pty against Electron (lmdb uses NAPI prebuilds)
  npx electron-rebuild --only node-pty
  npx electron-builder build --config electron-builder.mjs --mac --arm64
  validate_api_package "dist/mac-arm64/AgentBuddy.app/Contents/Resources/app"
elif $IS_WIN; then
  echo "  Platform: Windows (unsigned)"
  # Selectively rebuild only node-pty against Electron (lmdb uses NAPI prebuilds)
  npx electron-rebuild --only node-pty
  npx electron-builder build --config electron-builder.mjs --win --x64
  validate_api_package "dist/win-unpacked/resources/app"
else
  echo "  Platform: Linux"
  # Selectively rebuild only node-pty against Electron (lmdb uses NAPI prebuilds)
  npx electron-rebuild --only node-pty
  npx electron-builder build --config electron-builder.mjs --linux --x64
  validate_api_package "dist/linux-unpacked/resources/app"
fi
echo -e "${GREEN}✓${NC} Application packaged"
echo ""

# Step 7: Verify signing (macOS only)
if $IS_MAC && [ -n "$APPLE_TEAM_ID" ]; then
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
  echo -e "${BLUE}[7/7]${NC} Skipping signing verification"
  echo ""
fi

echo "=========================================="
echo "✅ Build Complete!"
echo "=========================================="
echo ""
echo "📁 Output:"
if $IS_MAC; then
  echo "  • App: dist/mac-arm64/AgentBuddy.app"
  echo "  • DMG: dist/AgentBuddy-*.dmg"
  echo "  • ZIP: dist/AgentBuddy-*.zip"
elif $IS_WIN; then
  echo "  • Installer: dist/AgentBuddy-*.exe"
else
  echo "  • AppImage: dist/AgentBuddy-*.AppImage"
  echo "  • Deb: dist/AgentBuddy-*.deb"
fi
echo ""
echo "📦 Next steps:"
echo "  1. Copy dev data: npm run copy-dev-data"
echo "  2. Test the app: npm run prod-app"
echo ""
