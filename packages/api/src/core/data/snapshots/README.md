# Git-Tracked Snapshots

This directory contains database snapshots that are tracked in Git. These snapshots can be used for:

- Demo data
- Test fixtures
- Initial application state
- Shared development environments

## Usage

To use a snapshot from this directory:

1. The will automatically load the latest snapshot

## Adding Snapshots

To add a new snapshot to Git:

1. Create a snapshot using the UI (dropdown menu in Database plugin)
2. Commit the file to Git, replacing the previous snapshot

## Important Notes

- Only add snapshots here that can be shared publicly
- Use the untracked directory (`/untracked`) for data that should be gitignored
- Avoid including sensitive or personal data in Git-tracked snapshots