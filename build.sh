#!/bin/bash

set -e  # Exit on error

echo "=========================================="
echo "Building AgentBuddy for Production"
echo "=========================================="
echo ""

# Clean previous builds
echo "Step 1: Cleaning previous builds..."
rm -rf dist/
rm -rf packages/*/dist/
rm -rf packages/api/node_modules
echo "✓ Cleaned previous builds"
echo ""

# Install dependencies
echo "Step 2: Installing root dependencies..."
npm install
echo "✓ Root dependencies installed"
echo ""

# Build all packages
echo "Step 3: Building all packages..."
npm run build
echo "✓ All packages built"
echo ""

# Install API dependencies in its own node_modules
echo "Step 4: Installing API runtime dependencies..."
cd packages/api

# Remove existing node_modules to ensure clean install
rm -rf node_modules
rm -rf package-lock.json

# Install dependencies locally without workspace hoisting
npm install --no-workspaces
echo "✓ API dependencies installed locally"

# Rebuild native modules for Electron
echo ""
echo "Step 5: Rebuilding native modules for Electron..."
# Get Electron's exact node version and path
cd ../..
ELECTRON_VERSION=$(npx electron --version | sed 's/v//')
NODE_VERSION=$(npx electron -p "process.versions.node")
ELECTRON_PATH=$(which npx)
ELECTRON_PATH="${ELECTRON_PATH%/*}/electron"

echo "Using Electron version: $ELECTRON_VERSION"
echo "Electron's Node.js version: $NODE_VERSION"
echo "Electron binary: $ELECTRON_PATH"

# Go back to API directory
cd packages/api

# First, remove all native module builds
echo "Cleaning native module builds..."
find node_modules -name "*.node" -delete 2>/dev/null || true
rm -rf node_modules/*/build 2>/dev/null || true
rm -rf node_modules/*/*/build 2>/dev/null || true

# Use electron-rebuild with exact Electron version
echo "Rebuilding with @electron/rebuild..."
npx @electron/rebuild \
  --force \
  --module-dir . \
  --electron-version 37.2.4 \
  --arch arm64

# Verify the rebuild
echo ""
echo "Verifying native modules..."
for module in better-sqlite3 node-pty usearch onnxruntime-node; do
  if [ -d "node_modules/$module" ]; then
    echo -n "  $module: "
    find "node_modules/$module" -name "*.node" -type f | head -1 | xargs file 2>/dev/null | grep -o "arm64" || echo "not found"
  fi
done

echo "✓ Native modules rebuilt for Electron in packages/api/node_modules"

# Return to root
cd ../..

# No need to copy packages - they're already in packages/ folder
echo ""
echo "Step 6: Packages ready for electron-builder..."
echo "✓ Packages remain in packages/ folder"
echo ""

# Run electron-builder
echo "Step 7: Running electron-builder..."
npx electron-builder build --config electron-builder.mjs --mac --arm64
echo "✓ Electron app packaged"
echo ""

echo "=========================================="
echo "Build Complete!"
echo "=========================================="
echo ""
echo "The packaged app is available at:"
echo "  - DMG: dist/root-*.dmg"
echo "  - ZIP: dist/root-*.zip"
echo "  - App: dist/mac-arm64/root.app"
echo ""
echo "To install the app:"
echo "  1. Open the DMG file"
echo "  2. Drag root.app to Applications"
echo ""
echo "To test the app, run:"
echo "  ./run_with_logs.sh"
echo ""