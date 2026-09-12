#!/bin/bash

# Clean AgentBuddy data for testing
# Usage: npm run clean-prod [--beta]

set -e

GREEN='\033[0;32m'
NC='\033[0m'

# Channel detection
APP_NAME="abuddy"
PRODUCT_NAME="AgentBuddy"
APP_ID="com.agentbuddy.app"
CHANNEL_LABEL="Production"

for arg in "$@"; do
  case "$arg" in
    --beta)
      APP_NAME="abuddy-beta"
      PRODUCT_NAME="AgentBuddy Beta"
      APP_ID="com.agentbuddy.beta"
      CHANNEL_LABEL="Beta"
      ;;
  esac
done

echo "=========================================="
echo "🧹 ${PRODUCT_NAME} ${CHANNEL_LABEL} Cleanup"
echo "=========================================="
echo ""

# Kill running instances of this channel only
echo "Stopping any running ${PRODUCT_NAME} instances..."
pkill -xf "${PRODUCT_NAME}" 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓${NC} Processes stopped"
echo ""

# Build artifacts (shared across channels)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DIST_DIR="$SCRIPT_DIR/../../dist"
if [ -d "$DIST_DIR" ]; then
  rm -rf "$DIST_DIR"
  echo -e "${GREEN}✓${NC} Deleted dist/ (build artifacts)"
else
  echo "  dist/ not found (already clean)"
fi

# Runtime data (Electron userData)
USER_DATA="$HOME/Library/Application Support/${APP_NAME}"
if [ -d "$USER_DATA" ]; then
  rm -rf "$USER_DATA"
  echo -e "${GREEN}✓${NC} Deleted ~/Library/Application Support/${APP_NAME}/ (databases, caches, Chromium state)"
else
  echo "  userData not found (already clean)"
fi

# Logs (electron-log)
PROD_LOGS="$HOME/Library/Logs/${APP_NAME}"
if [ -d "$PROD_LOGS" ]; then
  rm -rf "$PROD_LOGS"
  echo -e "${GREEN}✓${NC} Deleted ~/Library/Logs/${APP_NAME}/ (main/API, renderer, app-event logs)"
else
  echo "  logs not found (already clean)"
fi

# Diagnostics bundles (shared)
DIAGNOSTICS_DIR="$SCRIPT_DIR/../../diagnostics"
if [ -d "$DIAGNOSTICS_DIR" ]; then
  rm -rf "$DIAGNOSTICS_DIR"
  echo -e "${GREEN}✓${NC} Deleted diagnostics/ (production diagnostics bundles)"
else
  echo "  diagnostics not found (already clean)"
fi

# Preferences
PREFS="$HOME/Library/Preferences/${APP_ID}.plist"
if [ -f "$PREFS" ]; then
  rm -f "$PREFS"
  echo -e "${GREEN}✓${NC} Deleted app preferences"
else
  echo "  Preferences not found (already clean)"
fi

# Crash reports
CRASH_REPORTS=$(ls "$HOME/Library/Application Support/CrashReporter"/${PRODUCT_NAME}_*.plist 2>/dev/null)
if [ -n "$CRASH_REPORTS" ]; then
  rm -f "$HOME/Library/Application Support/CrashReporter"/${PRODUCT_NAME}_*.plist
  echo -e "${GREEN}✓${NC} Deleted crash reports"
else
  echo "  Crash reports not found (already clean)"
fi

echo ""
echo "✅ All ${CHANNEL_LABEL,,} data cleaned."
echo ""
