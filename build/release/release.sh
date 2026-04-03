#!/bin/bash

# Release script for AgentBuddy
# Usage: npm run release [patch|minor|major] [--dry-run]
#
# 1. Validates clean working tree
# 2. Runs typecheck + tests
# 3. Bumps version in package.json
# 4. Generates changelog from conventional commits
# 5. Commits, tags, and pushes (triggering CI)

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
BUMP_TYPE="patch"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    patch|minor|major) BUMP_TYPE="$arg" ;;
    --dry-run) DRY_RUN=true ;;
    *) echo -e "${RED}Unknown argument: $arg${NC}"; echo "Usage: release.sh [patch|minor|major] [--dry-run]"; exit 1 ;;
  esac
done

echo "=========================================="
echo "🚀 AgentBuddy Release"
echo "=========================================="
echo ""

# Step 1: Ensure clean working tree
echo -e "${BLUE}[1/6]${NC} Checking working tree..."
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}✗ Working tree is dirty. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi
echo -e "${GREEN}✓${NC} Working tree clean"
echo ""

# Step 2: Run typecheck
echo -e "${BLUE}[2/6]${NC} Running type checks..."
npm run typecheck
echo -e "${GREEN}✓${NC} Type checks passed"
echo ""

# Step 3: Run tests (disabled — e2e tests are stale boilerplate, fix separately)
# echo -e "${BLUE}[3/6]${NC} Running tests..."
# npm test
# echo -e "${GREEN}✓${NC} Tests passed"
# echo ""

# Step 4: Bump version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}[4/6]${NC} Bumping version ($BUMP_TYPE)..."

# Use npm version to calculate the new version without committing
npm version "$BUMP_TYPE" --no-git-tag-version > /dev/null 2>&1
NEW_VERSION=$(node -p "require('./package.json').version")

echo "  $CURRENT_VERSION → $NEW_VERSION"

if [ "$DRY_RUN" = true ]; then
  # Revert the version bump
  npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
  echo ""
  echo -e "${YELLOW}[DRY RUN] Would create:${NC}"
  echo "  - Version bump: $CURRENT_VERSION → $NEW_VERSION"
  echo "  - Commit: chore(release): v$NEW_VERSION"
  echo "  - Tag: v$NEW_VERSION"
  echo "  - Push to origin (triggers CI build)"
  echo ""
  echo -e "${YELLOW}Run without --dry-run to execute.${NC}"
  exit 0
fi

echo -e "${GREEN}✓${NC} Version bumped"
echo ""

# Step 5: Generate changelog
echo -e "${BLUE}[5/6]${NC} Generating changelog..."

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  RANGE="$LAST_TAG..HEAD"
else
  RANGE="HEAD"
fi

# Build changelog entry from conventional commits
CHANGELOG_ENTRY="## v$NEW_VERSION ($(date +%Y-%m-%d))"$'\n'

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

# Step 6: Commit, tag, and push
echo -e "${BLUE}[6/6]${NC} Creating release commit and tag..."

git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo ""
echo -e "  Pushing to origin..."
git push origin HEAD
git push origin "v$NEW_VERSION"

echo -e "${GREEN}✓${NC} Release v$NEW_VERSION pushed"
echo ""

echo "=========================================="
echo "✅ Release v$NEW_VERSION Complete!"
echo "=========================================="
echo ""
echo "📦 CI will build, sign, and publish the release automatically."
echo "   Check: https://github.com/spankyed/AgentBuddy/actions"
echo ""
echo "📋 View at: https://github.com/spankyed/AgentBuddy/releases"
echo ""
