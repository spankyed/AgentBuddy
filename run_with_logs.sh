#!/bin/bash

# Kill any existing instances
pkill -f "AgentBuddy" 2>/dev/null
pkill -f "root.app" 2>/dev/null
sleep 1

echo "Starting AgentBuddy with full logging..."
echo "=================================="

# Run the app with full console output
/Applications/AgentBuddy.app/Contents/MacOS/root 2>&1 | tee agentbuddy_full.log