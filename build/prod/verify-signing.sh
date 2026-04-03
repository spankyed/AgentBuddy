#!/bin/bash

# Verify code signing, notarization, and Gatekeeper for AgentBuddy.app

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP="${1:-$SCRIPT_DIR/../../dist/mac-arm64/AgentBuddy.app}"

if [ ! -d "$APP" ]; then
  echo "App not found at: $APP"
  echo "Build first with: npm run build-prod"
  exit 1
fi

echo "Verifying: $APP"
echo ""

echo "=== Code Signature ==="
codesign -dvv "$APP" 2>&1
echo ""

echo "=== Deep Verification ==="
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1
echo ""

echo "=== Notarization Staple ==="
xcrun stapler validate "$APP" 2>&1
echo ""

echo "=== Gatekeeper Assessment ==="
spctl --assess --type exec --verbose "$APP" 2>&1
echo ""

echo "=== SpeechHelper Signature ==="
SPEECH="$APP/Contents/Resources/native/speech/SpeechHelper"
if [ -f "$SPEECH" ]; then
  codesign -dvv "$SPEECH" 2>&1
else
  echo "SpeechHelper not found at: $SPEECH"
fi
echo ""

echo "=== Native Modules ==="
for mod in lmdb/build/Release/lmdb.node node-pty/build/Release/pty.node; do
  MOD_PATH="$APP/Contents/Resources/app/packages/api/node_modules/$mod"
  if [ -f "$MOD_PATH" ]; then
    echo "--- $mod ---"
    codesign -dvv "$MOD_PATH" 2>&1
  else
    echo "$mod: not found"
  fi
done
