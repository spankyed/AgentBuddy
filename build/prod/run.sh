#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Channel detection
APP_NAME="AgentBuddy"
CHANNEL_LABEL="Production"
for arg in "$@"; do
  if [[ "$arg" == "--beta" ]]; then
    APP_NAME="AgentBuddy Beta"
    CHANNEL_LABEL="Beta"
  fi
done

# Get timestamp for log files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="${LOG_DIR}/agentbuddy_${TIMESTAMP}.log"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Kill any existing instances of this channel only
echo "Stopping any existing ${APP_NAME} instances..."
pkill -xf "${APP_NAME}" 2>/dev/null || true
sleep 2

# Clear console
clear

echo "=========================================="
echo "${APP_NAME} ${CHANNEL_LABEL} Test Runner"
echo "=========================================="
echo ""
echo "Starting at: $(date)"
echo "Log file: $LOG_FILE"
echo ""

# Check if app exists in various locations
# IMPORTANT: Always prefer the dist version which has the correctly built modules
if [ -d "$SCRIPT_DIR/../../dist/mac-arm64/${APP_NAME}.app" ]; then
    APP_PATH="$SCRIPT_DIR/../../dist/mac-arm64/${APP_NAME}.app/Contents/MacOS/${APP_NAME}"
    echo "✓ Found app in dist folder (using this version)"
elif [ -d "/Applications/${APP_NAME}.app" ]; then
    APP_PATH="/Applications/${APP_NAME}.app/Contents/MacOS/${APP_NAME}"
    echo "✓ Found ${APP_NAME} in Applications folder"
    echo "  Note: If you get MODULE_VERSION errors, use the dist version instead"
else
    echo "✗ Error: ${APP_NAME} not found!"
    echo ""
    echo "Please build the app first with: npm run build-prod${CHANNEL_LABEL:+ (--beta for beta)}"
    echo "The built app will be at: dist/mac-arm64/${APP_NAME}.app"
    echo ""
    echo "To install (optional):"
    echo "  1. Open dist/${APP_NAME}-*.dmg"
    echo "  2. Drag ${APP_NAME}.app to Applications"
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
