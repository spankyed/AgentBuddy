#!/bin/bash

# Get timestamp for log files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="logs"
LOG_FILE="${LOG_DIR}/agentbuddy_${TIMESTAMP}.log"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Kill any existing instances
echo "Stopping any existing app instances..."
pkill -f "AgentBuddy" 2>/dev/null || true
pkill -f "root\.app" 2>/dev/null || true
# More specific pattern to avoid killing unrelated processes
pkill -f "Contents/MacOS/root" 2>/dev/null || true
sleep 2

# Clear console
clear

echo "=========================================="
echo "AgentBuddy Production Test Runner"
echo "=========================================="
echo ""
echo "Starting at: $(date)"
echo "Log file: $LOG_FILE"
echo ""

# Check if app exists in various locations
# IMPORTANT: Always prefer the dist version which has the correctly built modules
if [ -d "dist/mac-arm64/root.app" ]; then
    APP_PATH="dist/mac-arm64/root.app/Contents/MacOS/root"
    echo "✓ Found app in dist folder (using this version)"
elif [ -d "/Applications/root.app" ]; then
    APP_PATH="/Applications/root.app/Contents/MacOS/root"
    echo "✓ Found root.app in Applications folder"
    echo "  Note: If you get MODULE_VERSION errors, use the dist version instead"
elif [ -d "/Applications/AgentBuddy.app" ]; then
    APP_PATH="/Applications/AgentBuddy.app/Contents/MacOS/root"
    echo "✓ Found AgentBuddy in Applications folder"
    echo "  Note: If you get MODULE_VERSION errors, use the dist version instead"
else
    echo "✗ Error: App not found!"
    echo ""
    echo "Please build the app first with: ./build.sh"
    echo "The built app will be at: dist/mac-arm64/root.app"
    echo ""
    echo "To install (optional):"
    echo "  1. Open dist/root-*.dmg"
    echo "  2. Drag root.app to Applications"
    exit 1
fi

echo "App path: $APP_PATH"
echo ""
echo "=========================================="
echo "Console Output (also saved to $LOG_FILE)"
echo "=========================================="
echo ""

# Run the app with full console output, showing in terminal and saving to file
"$APP_PATH" 2>&1 | tee "$LOG_FILE"

# After app exits
echo ""
echo "=========================================="
echo "App exited at: $(date)"
echo "Log saved to: $LOG_FILE"
echo ""
echo "To view the log file:"
echo "  cat $LOG_FILE"
echo ""
echo "To view API-specific logs:"
echo "  grep 'API Server' $LOG_FILE"
echo "=========================================="