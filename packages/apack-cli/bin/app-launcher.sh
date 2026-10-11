#!/usr/bin/env bash
# `apack` for the installed desktop app. Packaged as <App>.app/Contents/Resources/cli/apack;
# "Install 'apack' command in PATH" symlinks /usr/local/bin/apack here. Runs the CLI the
# app bundles with the app's own Node runtime (Electron as Node), so no Node install is needed.
set -euo pipefail

source="${BASH_SOURCE[0]}"
while [ -L "$source" ]; do
  dir="$(cd -P "$(dirname "$source")" && pwd)"
  source="$(readlink "$source")"
  [[ "$source" != /* ]] && source="$dir/$source"
done
resources="$(cd -P "$(dirname "$source")/.." && pwd)"
contents="$(dirname "$resources")"

# Contents/MacOS holds only the app executable
executable="$(find "$contents/MacOS" -maxdepth 1 -type f -perm -u+x | head -n 1)"
if [ -z "$executable" ]; then
  echo "apack: cannot find the apack executable in $contents/MacOS. Reinstall the command from the app menu." >&2
  exit 1
fi

ELECTRON_RUN_AS_NODE=1 exec "$executable" "$resources/app/packages/apack-cli/dist/package/bin/apack.mjs" "$@"
