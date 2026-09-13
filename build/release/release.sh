#!/bin/bash

# Release script for AgentBuddy
# Usage: npm run release [patch|minor|major] [--dry-run] [--skip-migration-check] [--beta]
#
# Version flow:
#   0.3.14         + --beta  → 0.3.15-beta.0   (start beta cycle for next patch)
#   0.3.15-beta.0  + --beta  → 0.3.15-beta.1   (iterate beta)
#   0.3.15-beta.1  (no flag) → 0.3.15           (promote to release)
#   0.3.15         (no flag) → 0.3.16           (normal release)
#
# Tags are always v${VERSION}: v0.3.15-beta.0, v0.3.15, etc.

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
SKIP_MIGRATION_CHECK=false
IS_BETA=false

for arg in "$@"; do
  case "$arg" in
    patch|minor|major) BUMP_TYPE="$arg" ;;
    --dry-run) DRY_RUN=true ;;
    --skip-migration-check) SKIP_MIGRATION_CHECK=true ;;
    --beta) IS_BETA=true ;;
    *) echo -e "${RED}Unknown argument: $arg${NC}"; echo "Usage: release.sh [patch|minor|major] [--dry-run] [--skip-migration-check] [--beta]"; exit 1 ;;
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
echo "🚀 AgentBuddy Release${CHANNEL_LABEL}"
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
# The beta-before-production rule reads existing beta tags
git fetch --tags --quiet origin
echo ""

# Step 2: Run typecheck
echo -e "${BLUE}[2/6]${NC} Running type checks..."
npm run typecheck
echo -e "${GREEN}✓${NC} Type checks passed"
echo ""

# Step 3: Bump version
echo -e "${BLUE}[3/6]${NC} Bumping version..."

if [ "$IS_BETA" = true ]; then
  if [ "$CURRENT_IS_PRERELEASE" = true ]; then
    # Already in a beta cycle — iterate: 0.3.15-beta.0 → 0.3.15-beta.1
    npm version prerelease --preid=beta --no-git-tag-version > /dev/null 2>&1
  else
    # Start a new beta cycle: 0.3.14 → 0.3.15-beta.0 (for patch)
    npm version "pre${BUMP_TYPE}" --preid=beta --no-git-tag-version > /dev/null 2>&1
  fi
else
  if [ "$CURRENT_IS_PRERELEASE" = true ]; then
    # Promote prerelease to release: 0.3.15-beta.1 → 0.3.15
    npm version "$BUMP_TYPE" --no-git-tag-version > /dev/null 2>&1
  else
    # Normal release: 0.3.15 → 0.3.16
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
  # Check migration status for dry-run output
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  MIGRATION_STATUS="no settings changes"
  if [[ "$NEW_VERSION" == *-beta* ]]; then
    MIGRATION_STATUS="skipped (beta shares production migrations)"
  elif [ -n "$LAST_TAG" ]; then
    SETTINGS_CHANGED=$(git diff --name-only "$LAST_TAG"..HEAD -- packages/default-setup/src/default-settings.ts)
    if [ -n "$SETTINGS_CHANGED" ]; then
      # Extract the release version (strip prerelease suffix) for migration file lookup
      RELEASE_VERSION="${NEW_VERSION%%-*}"
      MIGRATION_FILE="packages/api/src/setup/migrations/$RELEASE_VERSION.ts"
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
  echo "  - Commit: chore(release): ${TAG_NAME}"
  echo "  - Tag: ${TAG_NAME}"
  if [ -n "$BETA_TAG_NAME" ]; then
    echo "  - Tag: ${BETA_TAG_NAME} (no beta for ${NEW_VERSION} yet; CI publishes this build as the current beta)"
  fi
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
if [[ "$NEW_VERSION" == *-beta* ]]; then
  echo -e "${GREEN}✓${NC} Beta release — shares production migration chain, skipping check"
elif [ "$SKIP_MIGRATION_CHECK" = true ]; then
  echo -e "${YELLOW}⊘${NC} Migration check skipped (--skip-migration-check)"
else
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -z "$LAST_TAG" ]; then
    echo -e "${GREEN}✓${NC} No previous release tag found, skipping check"
  else
    SETTINGS_CHANGED=$(git diff --name-only "$LAST_TAG"..HEAD -- packages/default-setup/src/default-settings.ts)
    if [ -n "$SETTINGS_CHANGED" ]; then
      RELEASE_VERSION="${NEW_VERSION%%-*}"
      MIGRATION_FILE="packages/api/src/setup/migrations/$RELEASE_VERSION.ts"
      if [ ! -f "$MIGRATION_FILE" ]; then
        echo -e "${RED}✗ default-settings.ts has changed since $LAST_TAG but no migration found at:${NC}"
        echo "    $MIGRATION_FILE"
        echo ""
        echo -e "  Create a migration for v$RELEASE_VERSION or re-run with ${YELLOW}npm run release:no-migrate${NC}"
        # Revert version bump
        npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
        exit 1
      fi
      echo -e "${GREEN}✓${NC} Settings changed — migration found at $MIGRATION_FILE"
    else
      echo -e "${GREEN}✓${NC} No settings changes since $LAST_TAG"
    fi
  fi
fi
echo ""

# Step 5: Generate changelog
echo -e "${BLUE}[5/6]${NC} Generating changelog..."

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

# Step 6: Commit, tag, and push
echo -e "${BLUE}[6/6]${NC} Creating release commit and tag..."

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
echo "   Check: https://github.com/spankyed/AgentBuddy/actions"
echo ""
echo "📋 View at: https://github.com/spankyed/AgentBuddy/releases"
echo ""
