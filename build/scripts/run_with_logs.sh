#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Get timestamp for log files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="${LOG_DIR}/agentbuddy_${TIMESTAMP}.log"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Kill any existing instances
echo "Stopping any existing app instances..."
pkill -f "AgentBuddy" 2>/dev/null || true
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
if [ -d "$SCRIPT_DIR/../../dist/mac-arm64/AgentBuddy.app" ]; then
    APP_PATH="$SCRIPT_DIR/../../dist/mac-arm64/AgentBuddy.app/Contents/MacOS/AgentBuddy"
    echo "✓ Found app in dist folder (using this version)"
elif [ -d "/Applications/AgentBuddy.app" ]; then
    APP_PATH="/Applications/AgentBuddy.app/Contents/MacOS/AgentBuddy"
    echo "✓ Found AgentBuddy in Applications folder"
    echo "  Note: If you get MODULE_VERSION errors, use the dist version instead"
else
    echo "✗ Error: App not found!"
    echo ""
    echo "Please build the app first with: npm run build-prod"
    echo "The built app will be at: ../dist/mac-arm64/AgentBuddy.app"
    echo ""
    echo "To install (optional):"
    echo "  1. Open dist/AgentBuddy-*.dmg"
    echo "  2. Drag AgentBuddy.app to Applications"
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