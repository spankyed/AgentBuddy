#!/bin/bash

# Script to copy development databases to production user data directory
# This is useful for testing production builds with existing data

set -e  # Exit on error

# Get the directory where this script is located and move to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=========================================="
echo "📦 Copy Development Data to Production"
echo "=========================================="
echo ""

# Configuration
LMDB_SOURCE="packages/api/src/persistence/data/untracked"
USER_DATA_DIR="$HOME/Library/Application Support/abuddy"

# Check if source directory exists
if [ ! -d "$LMDB_SOURCE" ]; then
  echo -e "${RED}❌ Source directory not found: $LMDB_SOURCE${NC}"
  echo "Make sure you have development databases set up first."
  exit 1
fi

# Create user data directory if it doesn't exist
mkdir -p "$USER_DATA_DIR"

echo -e "${BLUE}Source:${NC} $LMDB_SOURCE"
echo -e "${BLUE}Target:${NC} $USER_DATA_DIR"
echo ""

# Copy LMDB database directories
DATABASES=("ears-db" "ears-trace" "ears-secrets")
DB_COPIED=0
DB_SKIPPED=0
DB_MISSING=0

for DB in "${DATABASES[@]}"; do
  if [ -d "$LMDB_SOURCE/$DB" ]; then
    # Check if database has .mdb files
    if ls "$LMDB_SOURCE/$DB"/*.mdb 1> /dev/null 2>&1; then
      mkdir -p "$USER_DATA_DIR/$DB"
      
      # Count files before copy
      FILE_COUNT=$(ls -1 "$LMDB_SOURCE/$DB"/*.mdb 2>/dev/null | wc -l)
      
      # Copy database files
      cp -f "$LMDB_SOURCE/$DB"/*.mdb "$USER_DATA_DIR/$DB/" 2>/dev/null
      
      if [ $? -eq 0 ]; then
        ((DB_COPIED++))
        echo -e "  ${GREEN}✓${NC} Copied $DB ($FILE_COUNT files)"
      else
        ((DB_SKIPPED++))
        echo -e "  ${YELLOW}⚠${NC}  Failed to copy $DB"
      fi
    else
      ((DB_SKIPPED++))
      echo -e "  ${YELLOW}⚠${NC}  $DB exists but has no .mdb files"
    fi
  else
    ((DB_MISSING++))
    echo -e "  ${YELLOW}○${NC} $DB not found in development"
  fi
done

echo ""
echo "=========================================="

# Summary
if [ $DB_COPIED -gt 0 ]; then
  echo -e "${GREEN}✓ Successfully copied $DB_COPIED database(s)${NC}"
fi

if [ $DB_SKIPPED -gt 0 ]; then
  echo -e "${YELLOW}⚠ Skipped $DB_SKIPPED database(s)${NC}"
fi

if [ $DB_MISSING -gt 0 ]; then
  echo -e "${YELLOW}○ $DB_MISSING database(s) not found${NC}"
fi

if [ $DB_COPIED -eq 0 ]; then
  echo -e "${RED}❌ No databases were copied!${NC}"
  echo "This may cause initialization errors in production."
  exit 1
fi

echo "=========================================="
echo ""

# Optional: Show sizes of copied databases
echo "Database sizes in production:"
for DB in "${DATABASES[@]}"; do
  if [ -d "$USER_DATA_DIR/$DB" ]; then
    SIZE=$(du -sh "$USER_DATA_DIR/$DB" 2>/dev/null | cut -f1)
    echo "  • $DB: $SIZE"
  fi
done

echo ""
echo "✅ Development data ready for production use!"