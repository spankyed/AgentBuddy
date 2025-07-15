# Git-Tracked Snapshots

This directory contains database snapshots that are tracked in Git. These snapshots can be used for:

- Demo data
- Test fixtures
- Initial application state
- Shared development environments

## Usage

To use a snapshot from this directory:

1. Copy the desired snapshot file to the runtime snapshots directory
2. Restart the server (it will automatically load the latest snapshot)

## Adding Snapshots

To add a new snapshot to Git:

1. Create a snapshot using the UI (dropdown menu in Database plugin)
2. Copy the snapshot from `apps/api/src/core/data/snapshots/` to this directory
3. Rename it with a descriptive name (e.g., `demo-data.json`, `test-fixtures.json`)
4. Commit the file to Git

## Important Notes

- The runtime snapshots directory (`/snapshots`) is gitignored
- Only add snapshots here that should be shared with the team
- Avoid including sensitive or personal data in Git-tracked snapshots