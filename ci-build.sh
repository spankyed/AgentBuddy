#!/bin/bash

# CI Build Script for AgentBuddy
# Designed for automated builds in CI/CD pipelines

set -e  # Exit on error
set -o pipefail  # Pipe failures cause script to fail

# Environment variables
export NODE_ENV=production
export CI=true

# Detect platform
PLATFORM=$(uname -s)
ARCH=$(uname -m)

echo "=========================================="
echo "CI Build for AgentBuddy"
echo "Platform: $PLATFORM $ARCH"
echo "Node: $(node --version)"
echo "NPM: $(npm --version)"
echo "=========================================="

# Clean everything
echo "Cleaning workspace..."
rm -rf dist/
rm -rf packages/*/dist/
rm -rf packages/api/node_modules
rm -rf node_modules
echo "✓ Workspace cleaned"

# Fresh install
echo "Installing dependencies..."
npm ci --silent
echo "✓ Dependencies installed"

# Build
echo "Building packages..."
npm run build
echo "✓ Build complete"

# Install API dependencies locally
echo "Setting up API dependencies..."
cd packages/api
rm -rf node_modules package-lock.json
npm install --no-workspaces --production --silent
echo "✓ API dependencies installed"

# Get Electron version
cd ../..
ELECTRON_VERSION=$(npx electron --version | sed 's/v//')
echo "Rebuilding for Electron $ELECTRON_VERSION..."

# Rebuild native modules
cd packages/api
npx @electron/rebuild \
    --force \
    --module-dir . \
    --electron-version $ELECTRON_VERSION \
    --arch $ARCH
echo "✓ Native modules rebuilt"

cd ../..

# Package based on platform
echo "Packaging for $PLATFORM..."
if [ "$PLATFORM" = "Darwin" ]; then
    npx electron-builder build --mac --arm64 --x64
elif [ "$PLATFORM" = "Linux" ]; then
    npx electron-builder build --linux
else
    echo "Unsupported platform: $PLATFORM"
    exit 1
fi

echo "✓ Packaging complete"
echo ""
echo "Build artifacts in dist/"
ls -la dist/