#!/bin/bash

# Production Build Script for AgentBuddy
# This script ensures native modules are correctly compiled for Electron

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

echo "=========================================="
echo "AgentBuddy Production Build"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Get Electron version from package.json
ELECTRON_VERSION=$(grep '"electron"' package.json | grep -o '[0-9]*\.[0-9]*\.[0-9]*' | head -1)
if [ -z "$ELECTRON_VERSION" ]; then
    print_error "Could not determine Electron version from package.json"
    exit 1
fi
print_status "Detected Electron version: $ELECTRON_VERSION"

# Step 1: Clean previous builds
echo ""
echo "Step 1: Cleaning previous builds..."
rm -rf dist/ 2>/dev/null || true
rm -rf packages/*/dist/ 2>/dev/null || true
rm -rf packages/api/node_modules 2>/dev/null || true
print_status "Cleaned previous builds"

# Step 2: Install root dependencies
echo ""
echo "Step 2: Installing root dependencies..."
npm install --silent
print_status "Root dependencies installed"

# Step 3: Build all packages
echo ""
echo "Step 3: Building all packages..."
npm run build
if [ $? -ne 0 ]; then
    print_error "Build failed"
    exit 1
fi
print_status "All packages built successfully"

# Step 4: Install and rebuild API dependencies
echo ""
echo "Step 4: Setting up API dependencies..."
cd packages/api

# Remove any existing modules
rm -rf node_modules package-lock.json 2>/dev/null || true

# Install dependencies without workspace hoisting
print_status "Installing API dependencies locally (without workspace hoisting)..."
npm install --no-workspaces --silent
if [ $? -ne 0 ]; then
    print_error "Failed to install API dependencies"
    exit 1
fi
print_status "API dependencies installed"

# Step 5: Rebuild native modules for Electron
echo ""
echo "Step 5: Rebuilding native modules for Electron..."
print_status "Target: Electron $ELECTRON_VERSION (NODE_MODULE_VERSION 127)"

# Use @electron/rebuild to compile native modules
npx @electron/rebuild \
    --force \
    --module-dir . \
    --electron-version $ELECTRON_VERSION \
    --arch arm64 \
    --rebuild-all

if [ $? -ne 0 ]; then
    print_error "Failed to rebuild native modules"
    exit 1
fi

# Verify native modules were rebuilt
echo ""
echo "Verifying native modules..."
for module in better-sqlite3 node-pty usearch onnxruntime-node; do
    if [ -d "node_modules/$module" ]; then
        NODE_FILE=$(find "node_modules/$module" -name "*.node" -type f 2>/dev/null | head -1)
        if [ -n "$NODE_FILE" ]; then
            print_status "✓ $module found"
        else
            print_warning "⚠ $module: No .node file found"
        fi
    else
        print_warning "⚠ $module not installed"
    fi
done

cd ../..

# Step 6: Package with electron-builder
echo ""
echo "Step 6: Packaging application..."
# Build just the app directory first
npx electron-builder build --config electron-builder.mjs --mac --arm64 --dir
if [ $? -ne 0 ]; then
    print_error "Packaging failed"
    exit 1
fi
print_status "Application packaged successfully"

# Step 7: Create DMG
echo ""
echo "Step 7: Creating DMG installer..."
./create-dmg.sh
if [ $? -ne 0 ]; then
    print_warning "DMG creation failed, but app is still available at dist/mac-arm64/root.app"
fi

# Step 8: Summary
echo ""
echo "=========================================="
echo "Build Complete!"
echo "=========================================="
echo ""
echo "📦 Package locations:"
echo "  • App: dist/mac-arm64/root.app"
echo "  • DMG: dist/root-*.dmg"
echo "  • ZIP: dist/root-*.zip"
echo ""
echo "🧪 To test the build:"
echo "  ./run_with_logs.sh"
echo ""
echo "📥 To install:"
echo "  1. Open dist/root-*.dmg"
echo "  2. Drag to Applications folder"
echo ""
echo "✅ Build completed successfully!"