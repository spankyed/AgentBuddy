#!/usr/bin/env bash
set -euo pipefail

PRIVATE_REPO="spankyed/AgentBuddy"
PUBLIC_REPO="spankyed/AgentBuddy-releases"

# Channel detection
TAG_PATTERN="v*"
for arg in "$@"; do
  if [[ "$arg" == "--beta" ]]; then
    TAG_PATTERN="beta-v*"
    shift
    break
  fi
done

# Use provided tag or fetch latest matching the channel pattern
if [[ -n "${1:-}" ]]; then
  TAG="$1"
else
  TAG=$(gh release list --repo "$PRIVATE_REPO" --limit 20 --json tagName -q "[.[].tagName | select(test(\"^${TAG_PATTERN//\*/.*}\$\"))][0]")
  if [[ -z "$TAG" ]]; then
    echo "No releases matching ${TAG_PATTERN} found on $PRIVATE_REPO. Nothing to publish."
    exit 0
  fi
  echo "No tag specified, using latest matching ${TAG_PATTERN}: $TAG"
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

# Mark beta releases as prerelease on the public repo
PRERELEASE_FLAG=""
if [[ "$TAG" == beta-* ]]; then
  PRERELEASE_FLAG="--prerelease"
fi

# Create release on public repo
echo "Creating public release..."
gh release create "$TAG" \
  --repo "$PUBLIC_REPO" \
  --title "$TITLE" \
  --notes "$BODY" \
  $PRERELEASE_FLAG \
  "$TMPDIR"/*

echo ""
echo "Published: https://github.com/$PUBLIC_REPO/releases/tag/$TAG"
