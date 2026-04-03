#!/bin/bash
# Usage: ./build/generate-icons.sh [source.svg]
# Generates icon.png, icon.icns, icon.ico from source SVG
# Requires: rsvg-convert (librsvg), sips, iconutil (macOS)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="${1:-$SCRIPT_DIR/../resources/draft-final.svg}"
OUT_DIR="$SCRIPT_DIR/resources"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Generating icons from: $SOURCE"

# 1. SVG -> 1024x1024 master PNG
rsvg-convert -w 1024 -h 1024 "$SOURCE" > "$WORK/icon-1024.png"

# 2. macOS .icns (requires iconset with standard sizes)
ICONSET="$WORK/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$WORK/icon-1024.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$WORK/icon-1024.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$OUT_DIR/icon.icns"
echo "  icon.icns"

# 3. General-purpose PNG (512x512)
sips -z 512 512 "$WORK/icon-1024.png" --out "$OUT_DIR/icon.png" >/dev/null
echo "  icon.png"

# 4. Windows .ico (256x256 PNG — electron-builder accepts PNG-based ico)
sips -z 256 256 "$WORK/icon-1024.png" --out "$OUT_DIR/icon.ico" >/dev/null
echo "  icon.ico"

echo "All icons generated in $OUT_DIR/"
