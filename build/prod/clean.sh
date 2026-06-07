#!/bin/bash

# Clean all AgentBuddy production data for testing
# Usage: npm run clean-prod

set -e

GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "🧹 AgentBuddy Production Cleanup"
echo "=========================================="
echo ""

# Kill running instances
echo "Stopping any running instances..."
pkill -f "AgentBuddy" 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓${NC} Processes stopped"
echo ""

# Build artifacts
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DIST_DIR="$SCRIPT_DIR/../../dist"
if [ -d "$DIST_DIR" ]; then
  rm -rf "$DIST_DIR"
  echo -e "${GREEN}✓${NC} Deleted dist/ (build artifacts)"
else
  echo "  dist/ not found (already clean)"
fi

# Runtime data (Electron userData)
USER_DATA="$HOME/Library/Application Support/abuddy"
if [ -d "$USER_DATA" ]; then
  rm -rf "$USER_DATA"
  echo -e "${GREEN}✓${NC} Deleted ~/Library/Application Support/abuddy/ (databases, caches, Chromium state)"
else
  echo "  userData not found (already clean)"
fi

# Production logs (electron-log)
PROD_LOGS="$HOME/Library/Logs/abuddy"
if [ -d "$PROD_LOGS" ]; then
  rm -rf "$PROD_LOGS"
  echo -e "${GREEN}✓${NC} Deleted ~/Library/Logs/abuddy/ (main/API logs)"
else
  echo "  production logs not found (already clean)"
fi

# Preferences
PREFS="$HOME/Library/Preferences/com.agentbuddy.app.plist"
if [ -f "$PREFS" ]; then
  rm -f "$PREFS"
  echo -e "${GREEN}✓${NC} Deleted app preferences"
else
  echo "  Preferences not found (already clean)"
fi

# Crash reports
CRASH_REPORTS=$(ls "$HOME/Library/Application Support/CrashReporter"/AgentBuddy_*.plist 2>/dev/null)
if [ -n "$CRASH_REPORTS" ]; then
  rm -f "$HOME/Library/Application Support/CrashReporter"/AgentBuddy_*.plist
  echo -e "${GREEN}✓${NC} Deleted crash reports"
else
  echo "  Crash reports not found (already clean)"
fi

echo ""
echo "✅ All production data cleaned."
echo ""
