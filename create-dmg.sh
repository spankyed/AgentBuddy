#!/bin/bash

# Create DMG for AgentBuddy

set -e

APP_NAME="abuddy"
VERSION="0.0.1"
DMG_NAME="${APP_NAME}-${VERSION}-mac-arm64.dmg"
VOLUME_NAME="${APP_NAME}"
SOURCE_DIR="dist/mac-arm64"
APP_PATH="${SOURCE_DIR}/${APP_NAME}.app"

# Check if app exists
if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    echo "Please run ./build-production.sh first"
    exit 1
fi

echo "Creating DMG for $APP_PATH..."

# Remove old DMG if exists
rm -f "dist/$DMG_NAME" 2>/dev/null || true

# Create a temporary directory for DMG contents
TEMP_DIR=$(mktemp -d)
echo "Using temp directory: $TEMP_DIR"

# Copy app to temp directory
cp -R "$APP_PATH" "$TEMP_DIR/"

# Create a symbolic link to Applications
ln -s /Applications "$TEMP_DIR/Applications"

# Create the DMG
echo "Building DMG..."
hdiutil create \
    -volname "$VOLUME_NAME" \
    -srcfolder "$TEMP_DIR" \
    -ov \
    -format UDZO \
    "dist/$DMG_NAME"

# Clean up
rm -rf "$TEMP_DIR"

# Verify the DMG
echo ""
echo "Verifying DMG..."
hdiutil imageinfo "dist/$DMG_NAME" | grep "Format:"

echo ""
echo "✅ DMG created successfully: dist/$DMG_NAME"
echo ""
echo "To install:"
echo "  1. Open dist/$DMG_NAME"
echo "  2. Drag ${APP_NAME}.app to Applications"