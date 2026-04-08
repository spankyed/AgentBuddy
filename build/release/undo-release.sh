#!/bin/bash

# Undo a release for AgentBuddy
# Usage: npm run undo-release [version] [--dry-run]
#
# Reverses what release.sh does:
# 1. Deletes the GitHub release (if it exists)
# 2. Deletes the remote and local git tag
# 3. Reverts the release commit
# 4. Pushes the revert to origin

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/../.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Parse arguments
VERSION=""
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    v*) VERSION="$arg" ;;
    [0-9]*) VERSION="v$arg" ;;
    *) echo -e "${RED}Unknown argument: $arg${NC}"; echo "Usage: undo-release.sh [version] [--dry-run]"; exit 1 ;;
  esac
done

# Default to latest tag if no version specified
if [ -z "$VERSION" ]; then
  VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -z "$VERSION" ]; then
    echo -e "${RED}✗ No tags found and no version specified.${NC}"
    exit 1
  fi
fi

echo "=========================================="
echo "⏪ AgentBuddy Undo Release: $VERSION"
echo "=========================================="
echo ""

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}✗ Working tree is dirty. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi

# Find the release commit
RELEASE_COMMIT=$(git log --all --oneline --grep="^chore(release): $VERSION\$" --format="%H" | head -1)

if [ -z "$RELEASE_COMMIT" ]; then
  echo -e "${RED}✗ Could not find release commit for $VERSION${NC}"
  echo "  Expected commit message: chore(release): $VERSION"
  exit 1
fi

RELEASE_COMMIT_SHORT=$(echo "$RELEASE_COMMIT" | cut -c1-8)

# Check if tag exists
LOCAL_TAG=$(git tag -l "$VERSION")
REMOTE_TAG=$(git ls-remote --tags origin "refs/tags/$VERSION" 2>/dev/null | head -1)

# Check if GitHub release exists
GH_RELEASE=""
if command -v gh &> /dev/null; then
  GH_RELEASE=$(gh release view "$VERSION" --json tagName --jq '.tagName' 2>/dev/null || echo "")
fi

# Show what will happen
echo -e "${BLUE}Actions:${NC}"
if [ -n "$GH_RELEASE" ]; then
  echo "  1. Delete GitHub release: $VERSION"
else
  echo "  1. Delete GitHub release: (not found, skipping)"
fi
if [ -n "$REMOTE_TAG" ]; then
  echo "  2. Delete remote tag: $VERSION"
else
  echo "  2. Delete remote tag: (not found, skipping)"
fi
if [ -n "$LOCAL_TAG" ]; then
  echo "  3. Delete local tag: $VERSION"
else
  echo "  3. Delete local tag: (not found, skipping)"
fi
echo "  4. Revert commit: $RELEASE_COMMIT_SHORT (chore(release): $VERSION)"
echo "  5. Push revert to origin"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] No changes made.${NC}"
  exit 0
fi

# Confirm
echo -ne "${YELLOW}Proceed? [y/N] ${NC}"
read -r CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi
echo ""

# Step 1: Delete GitHub release
if [ -n "$GH_RELEASE" ]; then
  echo -e "${BLUE}[1/5]${NC} Deleting GitHub release..."
  gh release delete "$VERSION" --yes
  echo -e "${GREEN}✓${NC} GitHub release deleted"
else
  echo -e "${BLUE}[1/5]${NC} GitHub release not found, skipping"
fi

# Step 2: Delete remote tag
if [ -n "$REMOTE_TAG" ]; then
  echo -e "${BLUE}[2/5]${NC} Deleting remote tag..."
  git push --delete origin "$VERSION"
  echo -e "${GREEN}✓${NC} Remote tag deleted"
else
  echo -e "${BLUE}[2/5]${NC} Remote tag not found, skipping"
fi

# Step 3: Delete local tag
if [ -n "$LOCAL_TAG" ]; then
  echo -e "${BLUE}[3/5]${NC} Deleting local tag..."
  git tag -d "$VERSION"
  echo -e "${GREEN}✓${NC} Local tag deleted"
else
  echo -e "${BLUE}[3/5]${NC} Local tag not found, skipping"
fi

# Step 4: Revert release commit
echo -e "${BLUE}[4/5]${NC} Reverting release commit..."
git revert "$RELEASE_COMMIT" --no-edit
echo -e "${GREEN}✓${NC} Release commit reverted"

# Step 5: Push
echo -e "${BLUE}[5/5]${NC} Pushing to origin..."
git push origin HEAD
echo -e "${GREEN}✓${NC} Pushed"

echo ""
echo "=========================================="
echo "✅ Release $VERSION undone!"
echo "=========================================="
echo ""

# Show final state
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "  Version: $CURRENT_VERSION"
echo "  Tags:    $(git tag -l | sort -V | tr '\n' ' ')"
echo ""
