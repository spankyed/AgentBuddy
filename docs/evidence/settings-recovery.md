# Settings admission and recovery

## Admission checkpoint — `8d31bdccc`

- Settings projection is shared by committed catalogs and verified installation candidates.
- Install, replacement, restore, upgrade, authoring installation and shipped refresh check explicit
  stored choices before placement. Live reload checks prospective declarations before module import;
  declaration publication validates before changing any accepted projection.
- Offline checks use a read-only, unhydrated settings-row read under the existing CLI storage lock.
  Boot's shipped updates read the same row from the already-open store before hydration.
- Focused verification: 31 settings-store cases, 7 settings-discovery/admission cases and 19 reload
  cases passed. Host and CLI typechecks and scoped lint passed. No native compiler fixtures or CI runs.
- Startup recovery and atomic repair are the next checkpoint; this admission checkpoint does not
  claim to resolve settings that are already invalid at startup.


## Recovery checkpoint — `3a6b649b5`

- Finding 5.1 is implemented without accepting invalid values: typed snapshots and backend reads
  validate the current contract; a separate recovery response carries attributed diagnostics and
  process/value/declaration revision identity.
- Boot discovers declarations and reads persisted preferences before importing external runtime
  modules. Invalid preferences start only host recovery. Normal pack initialization requires relaunch.
  This closes S.2's empty-memory admission gap and prevents S.1's pack lifecycle mutations from running
  in the startup-invalid state: the recovery process has no Packs system, and executable admission
  remains refused after repair until relaunch.
- Host-issued recovery resets all selected affected owners in one validated write, or explicitly
  clears all preferences. Partial repair, stale tokens, pack authority and replacement-time recovery
  are refused without writes. Targeted resets retain unrelated and unavailable-owner overrides.
- Recovery remains published as `repaired` after a successful reset, so another window or reconnect
  still offers Restart app. Repair broadcasts cannot prematurely settle a pending request; its own
  acknowledgment decides success. Invalid values never enter the frontend settings snapshot.
- The renderer root mounts the host-owned recovery view independently of normal shell preferences
  and custom pack forms. Destructive scope is confirmed; the existing Electron relaunch action is reused.

## Verification and limits

- 130 focused cases across nine files passed: settings store, app settings, access authority,
  window runtime, declaration/installation admission, direct persisted-row reads, API boot, API
  settings transport and the Vue recovery view. The eight-file core run passed 121 cases in 4.46s;
  the existing transport suite passed nine cases separately. The boot fixture also verifies a sealed
  installed pack's invalid overrides, with no executable activation, and its correlated repair/read
  responses over the real app bus.
- Host, CLI, API source/test and renderer typechecks passed. Scoped Oxlint and renderer ESLint passed.
  Normal workspace packages were refreshed. All 28 SDK API reports were generated/reviewed: three
  changed reports contain only the recovery types/admin methods and the `recovery` port status.
- No CI, broad integration suite, packaged Electron app, real LMDB environment or captured native
  compiler fixture was launched for this repair. The API boot test uses in-memory persistence and a
  private profile containing real sealed declaration files; the Vue view uses jsdom. Actual native
  database and packaged-application acceptance remain unproven and are not claimed by these checks.
- Other PR findings and the larger PR acceptance gate remain separate. This closes the scoped
  implementation of 5.1 and its startup-related S.1/S.2 paths, not the entire PR review.
