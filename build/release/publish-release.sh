#!/usr/bin/env bash
set -euo pipefail

PRIVATE_REPO="spankyed/AgentBuddy"
PUBLIC_REPO="spankyed/AgentBuddy-releases"


# Use provided tag or fetch latest
if [[ -n "${1:-}" ]]; then
  TAG="$1"
else
  TAG=$(gh release list --repo "$PRIVATE_REPO" --limit 1 --json tagName -q '.[0].tagName')
  echo "No tag specified, using latest: $TAG"
fi

# Check if release already exists on public repo
if gh release view "$TAG" --repo "$PUBLIC_REPO" &>/dev/null; then
  echo "Release $TAG already exists on $PUBLIC_REPO. Skipping."
  exit 0
fi

# Fetch release metadata from private repo
TITLE=$(gh release view "$TAG" --repo "$PRIVATE_REPO" --json name -q '.name')
BODY=$(gh release view "$TAG" --repo "$PRIVATE_REPO" --json body -q '.body')

echo "Syncing release: $TITLE ($TAG)"

# Download assets to temp dir
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading assets..."
gh release download "$TAG" --repo "$PRIVATE_REPO" --dir "$TMPDIR"

# Create release on public repo
echo "Creating public release..."
gh release create "$TAG" \
  --repo "$PUBLIC_REPO" \
  --title "$TITLE" \
  --notes "$BODY" \
  "$TMPDIR"/*

echo ""
echo "Published: https://github.com/$PUBLIC_REPO/releases/tag/$TAG"
