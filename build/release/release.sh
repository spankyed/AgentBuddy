#!/bin/bash

# Release script for AgentBuddy
# Usage: npm run release [patch|minor|major] [--dry-run] [--skip-migration-check]
#
# 1. Validates clean working tree
# 2. Runs typecheck
# 3. Bumps version in package.json
# 4. Checks if default-settings.ts changed and requires a migration
# 5. Generates changelog from conventional commits
# 6. Commits, tags, and pushes (triggering CI)

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
SKIP_MIGRATION_CHECK=false

for arg in "$@"; do
  case "$arg" in
    patch|minor|major) BUMP_TYPE="$arg" ;;
    --dry-run) DRY_RUN=true ;;
    --skip-migration-check) SKIP_MIGRATION_CHECK=true ;;
    *) echo -e "${RED}Unknown argument: $arg${NC}"; echo "Usage: release.sh [patch|minor|major] [--dry-run] [--skip-migration-check]"; exit 1 ;;
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

# (tests disabled — e2e tests are stale boilerplate, fix separately)

# Step 3: Bump version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}[3/6]${NC} Bumping version ($BUMP_TYPE)..."

# Use npm version to calculate the new version without committing
npm version "$BUMP_TYPE" --no-git-tag-version > /dev/null 2>&1
NEW_VERSION=$(node -p "require('./package.json').version")

echo "  $CURRENT_VERSION → $NEW_VERSION"

if [ "$DRY_RUN" = true ]; then
  # Check migration status for dry-run output
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  MIGRATION_STATUS="no settings changes"
  if [ -n "$LAST_TAG" ]; then
    SETTINGS_CHANGED=$(git diff --name-only "$LAST_TAG"..HEAD -- packages/default-setup/src/default-settings.ts)
    if [ -n "$SETTINGS_CHANGED" ]; then
      MIGRATION_FILE="packages/api/src/setup/migrations/$NEW_VERSION.ts"
      if [ -f "$MIGRATION_FILE" ]; then
        MIGRATION_STATUS="settings changed, migration found ✓"
      elif [ "$SKIP_MIGRATION_CHECK" = true ]; then
        MIGRATION_STATUS="settings changed, no migration (skipped)"
      else
        MIGRATION_STATUS="settings changed, NO migration ✗"
      fi
    fi
  fi

  # Revert the version bump
  npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
  echo ""
  echo -e "${YELLOW}[DRY RUN] Would create:${NC}"
  echo "  - Version bump: $CURRENT_VERSION → $NEW_VERSION"
  echo "  - Migration check: $MIGRATION_STATUS"
  echo "  - Commit: chore(release): v$NEW_VERSION"
  echo "  - Tag: v$NEW_VERSION"
  echo "  - Push to origin (triggers CI build)"
  echo ""
  if [[ "$MIGRATION_STATUS" == *"NO migration"* ]]; then
    echo -e "${RED}Release would fail: missing migration for v$NEW_VERSION${NC}"
    exit 1
  fi
  echo -e "${YELLOW}Run without --dry-run to execute.${NC}"
  exit 0
fi

echo -e "${GREEN}✓${NC} Version bumped"
echo ""

# Step 4: Check if default-settings.ts changed and requires a migration
echo -e "${BLUE}[4/6]${NC} Checking for settings migration..."
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ "$SKIP_MIGRATION_CHECK" = true ]; then
  echo -e "${YELLOW}⊘${NC} Migration check skipped (--skip-migration-check)"
elif [ -z "$LAST_TAG" ]; then
  echo -e "${GREEN}✓${NC} No previous release tag found, skipping check"
else
  SETTINGS_CHANGED=$(git diff --name-only "$LAST_TAG"..HEAD -- packages/default-setup/src/default-settings.ts)
  if [ -n "$SETTINGS_CHANGED" ]; then
    MIGRATION_FILE="packages/api/src/setup/migrations/$NEW_VERSION.ts"
    if [ ! -f "$MIGRATION_FILE" ]; then
      echo -e "${RED}✗ default-settings.ts has changed since $LAST_TAG but no migration found at:${NC}"
      echo "    $MIGRATION_FILE"
      echo ""
      echo -e "  Create a migration for v$NEW_VERSION or re-run with ${YELLOW}npm run release:no-migrate${NC}"
      # Revert version bump
      npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
      exit 1
    fi
    echo -e "${GREEN}✓${NC} Settings changed — migration found at $MIGRATION_FILE"
  else
    echo -e "${GREEN}✓${NC} No settings changes since $LAST_TAG"
  fi
fi
echo ""

# Step 5: Generate changelog
echo -e "${BLUE}[5/6]${NC} Generating changelog..."

# LAST_TAG already computed in step 4
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
git push origin HEAD "v$NEW_VERSION"

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
