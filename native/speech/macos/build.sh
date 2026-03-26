#!/bin/bash
set -e
cd "$(dirname "$0")"
swiftc -O -o SpeechHelper SpeechHelper.swift \
  -framework Speech -framework AVFoundation -framework Foundation
echo "Built SpeechHelper successfully"
