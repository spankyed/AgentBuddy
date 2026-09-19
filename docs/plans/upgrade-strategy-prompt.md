**Act as a senior Electron desktop app engineer** to design an upgrade strategy for our macOS Electron app (distributed via GitHub Releases as a DMG).

**Context:**
- App data is persisted via LMDB in the default Electron `userData` directory (`~/Library/Application Support/<app-name>/`)
- Users upgrade by downloading a new DMG and dragging the `.app` into `/Applications`, replacing the old one
- No auto-updater is currently in place

**Deliver:**
1. **Data safety audit** — Confirm whether replacing the `.app` bundle affects `userData` (it shouldn't, but verify edge cases: sandboxing, code-signed identity changes, Electron version jumps that change `userData` path)
2. **Migration strategy** — Design a versioned schema migration system that runs on app startup, detects the previous data version, and migrates LMDB data forward. Include rollback/backup considerations.
3. **Auto-update recommendation** — Evaluate `electron-updater` (from `electron-builder`) vs Squirrel vs manual DMG flow. Recommend the best fit given we already use GitHub Releases, and outline the implementation steps.
4. **UX improvements** — In-app update notification, download progress, and "what's new" changelog display sourced from GitHub Release notes.
5. **Edge cases** — Downgrade protection, corrupted data recovery, first-launch-after-update hook for cleanup tasks.

Keep recommendations practical and ordered by priority. Provide code sketches where useful, not full implementations.
