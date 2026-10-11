#!/bin/bash

# Release script for apack
# Usage: npm run release [patch|minor|major] [--dry-run] [--beta]
#
# Version flow:
#   0.3.14  + minor --beta  → 0.4.0-beta.0   (start beta cycle for next minor)
#   0.4.0-beta.0  + --beta  → 0.4.0-beta.1   (iterate beta)
#   0.4.0-beta.1  (no flag) → 0.4.0           (promote to release)
#   0.4.0         (no flag) → 0.4.1           (normal release)
#
# Tags are always v${VERSION}: v0.4.0-beta.0, v0.4.0, etc.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/../.."
source "$SCRIPT_DIR/beta-tag.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Parse arguments
BUMP_TYPE="patch"
DRY_RUN=false
IS_BETA=false

for arg in "$@"; do
  case "$arg" in
    patch|minor|major) BUMP_TYPE="$arg" ;;
    --dry-run) DRY_RUN=true ;;
    --beta) IS_BETA=true ;;
    *) echo -e "${RED}Unknown argument: $arg${NC}"; echo "Usage: release.sh [patch|minor|major] [--dry-run] [--beta]"; exit 1 ;;
  esac
done

CURRENT_VERSION=$(node -p "require('./package.json').version")
CURRENT_IS_PRERELEASE=false
if [[ "$CURRENT_VERSION" == *-* ]]; then
  CURRENT_IS_PRERELEASE=true
fi

CHANNEL_LABEL=""
if [ "$IS_BETA" = true ]; then
  CHANNEL_LABEL=" (Beta)"
fi

echo "=========================================="
echo "🚀 apack Release${CHANNEL_LABEL}"
echo "=========================================="
echo ""

# Step 1: Ensure clean working tree
echo -e "${BLUE}[1/5]${NC} Checking working tree..."
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}✗ Working tree is dirty. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi
echo -e "${GREEN}✓${NC} Working tree clean"
# The beta-before-production rule reads existing beta tags
git fetch --tags --quiet origin
echo ""

# Step 2: Run typecheck
echo -e "${BLUE}[2/5]${NC} Running type checks..."
npm run typecheck
echo -e "${GREEN}✓${NC} Type checks passed"
echo ""

# Step 3: Bump version
echo -e "${BLUE}[3/5]${NC} Bumping version..."

if [ "$IS_BETA" = true ]; then
  if [ "$CURRENT_IS_PRERELEASE" = true ]; then
    # Already in a beta cycle — iterate: 0.4.0-beta.0 → 0.4.0-beta.1
    npm version prerelease --preid=beta --no-git-tag-version > /dev/null 2>&1
  else
    # Start a new beta cycle: 0.3.14 → 0.4.0-beta.0 (for minor)
    npm version "pre${BUMP_TYPE}" --preid=beta --no-git-tag-version > /dev/null 2>&1
  fi
else
  if [ "$CURRENT_IS_PRERELEASE" = true ]; then
    # Promote prerelease to release: 0.4.0-beta.1 → 0.4.0
    npm version "$BUMP_TYPE" --no-git-tag-version > /dev/null 2>&1
  else
    # Normal release: 0.4.0 → 0.4.1
    npm version "$BUMP_TYPE" --no-git-tag-version > /dev/null 2>&1
  fi
fi

NEW_VERSION=$(node -p "require('./package.json').version")
TAG_NAME="v${NEW_VERSION}"
BETA_TAG_NAME="$(beta_tag_for_release "$NEW_VERSION")"

echo "  $CURRENT_VERSION → $NEW_VERSION"
if [ -n "$BETA_TAG_NAME" ]; then
  echo "  No beta was released for $NEW_VERSION: also tagging $BETA_TAG_NAME so this build is published as the current beta"
fi

if [ "$DRY_RUN" = true ]; then
  # Revert the version bump
  npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
  echo ""
  echo -e "${YELLOW}[DRY RUN] Would create:${NC}"
  echo "  - Version bump: $CURRENT_VERSION → $NEW_VERSION"
  echo "  - Commit: chore(release): ${TAG_NAME}"
  echo "  - Tag: ${TAG_NAME}"
  if [ -n "$BETA_TAG_NAME" ]; then
    echo "  - Tag: ${BETA_TAG_NAME} (no beta for ${NEW_VERSION} yet; CI publishes this build as the current beta)"
  fi
  echo "  - Push to origin (triggers CI build)"
  echo ""
  echo -e "${YELLOW}Run without --dry-run to execute.${NC}"
  exit 0
fi

echo -e "${GREEN}✓${NC} Version bumped"
echo ""

# Step 4: Generate changelog
echo -e "${BLUE}[4/5]${NC} Generating changelog..."

# Find the most recent tag (any channel)
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  RANGE="$LAST_TAG..HEAD"
else
  RANGE="HEAD"
fi

# Build changelog entry from conventional commits
CHANGELOG_ENTRY="## ${TAG_NAME} ($(date +%Y-%m-%d))"$'\n'

# Group commits by type
FEATURES=$(git log "$RANGE" --oneline --grep="^feat" --format="- %s" 2>/dev/null | sed 's/^- feat[:(]/- /' | sed 's/^- )/- /')
FIXES=$(git log "$RANGE" --oneline --grep="^fix" --format="- %s" 2>/dev/null | sed 's/^- fix[:(]/- /' | sed 's/^- )/- /')
REFACTORS=$(git log "$RANGE" --oneline --grep="^refactor" --format="- %s" 2>/dev/null | sed 's/^- refactor[:(]/- /' | sed 's/^- )/- /')
OTHER=$(git log "$RANGE" --oneline --format="%s" 2>/dev/null | grep -v "^feat" | grep -v "^fix" | grep -v "^refactor" | grep -v "^chore(release)" | sed 's/^/- /')

if [ -n "$FEATURES" ]; then
  CHANGELOG_ENTRY+=$'\n'"### Features"$'\n'"$FEATURES"$'\n'
fi
if [ -n "$FIXES" ]; then
  CHANGELOG_ENTRY+=$'\n'"### Fixes"$'\n'"$FIXES"$'\n'
fi
if [ -n "$REFACTORS" ]; then
  CHANGELOG_ENTRY+=$'\n'"### Refactors"$'\n'"$REFACTORS"$'\n'
fi
if [ -n "$OTHER" ]; then
  CHANGELOG_ENTRY+=$'\n'"### Other"$'\n'"$OTHER"$'\n'
fi

# Prepend to CHANGELOG.md
if [ -f "CHANGELOG.md" ]; then
  EXISTING=$(cat CHANGELOG.md)
  echo -e "# Changelog\n\n${CHANGELOG_ENTRY}\n${EXISTING#"# Changelog"}" > CHANGELOG.md
else
  echo -e "# Changelog\n\n${CHANGELOG_ENTRY}" > CHANGELOG.md
fi

echo -e "${GREEN}✓${NC} Changelog updated"
echo ""

# Step 5: Commit, tag, and push
echo -e "${BLUE}[5/5]${NC} Creating release commit and tag..."

git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): ${TAG_NAME}"
git tag "${TAG_NAME}"
if [ -n "$BETA_TAG_NAME" ]; then
  git tag "${BETA_TAG_NAME}"
fi

echo ""
echo -e "  Pushing to origin..."
git push origin HEAD "${TAG_NAME}" ${BETA_TAG_NAME:+"${BETA_TAG_NAME}"}

echo -e "${GREEN}✓${NC} Release ${TAG_NAME} pushed"
echo ""

echo "=========================================="
echo "✅ Release ${TAG_NAME} Complete!"
echo "=========================================="
echo ""
echo "📦 CI will build, sign, and publish the release automatically."
echo "   Check: https://github.com/spankyed/apack/actions"
echo ""
echo "📋 View at: https://github.com/spankyed/apack/releases"
echo ""
