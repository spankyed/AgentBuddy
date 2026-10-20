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

## Simplification checkpoint — 2026-10-20

The cleanup is `0336dc203`. Follow-up `57f0e6300` restores explicit reset scope and validated reads;
`3b4c0fe2b` fixes list refresh error handling. Detection at boot, host-only recovery and relaunch
remain unchanged.

- **Repair resets explicitly selected owners.** `RECOVER_SETTINGS` takes `{ version, reset }`, where
  `reset` is an array of affected settings targets or `'all'`. The confirmation states that every
  preference within each selected group resets. Other groups and unavailable-owner overrides are
  preserved. Validation errors are never interpreted as instructions for implicit field deletion.
  Malformed document structure requires an explicit complete reset.
- **Recovery is a state boot sets.** Boot calls `enterRecovery()` when its pre-hydration inspection finds
  problems. `getRecovery()` returns nothing outside recovery, and in recovery re-inspects the stored row,
  so no problems means repaired. Typed reads still validate the current document outside recovery;
  during recovery they refuse until relaunch. A missed recovery-mode call cannot expose invalid typed values.
- **One recovery shape and event.** `SettingsRecovery` is `{ version: { runId, revision }, problems }`. The
  `status` field, `catalogRevision` (the catalog is frozen in recovery) and the `SETTINGS_RECOVERED`
  event are gone. A repair is answered with `SETTINGS_RECOVERY` for that call, and other windows hear the
  broadcast that follows the write.
- **Packs no longer see recovery.** `SettingsPort.status()` lost `'recovery'`; the window runtime keeps it
  internally and reports `loading`. The recovery types stay in the SDK because `SettingsAdmin`, the host's
  admin contract, carries the recovery methods.
- **List publication owns its refresh.** `emitPacksList` makes one guarded catalog refresh and reports a
  refusal before publishing from accepted declarations. Toggle and uninstall do not trigger a second,
  unguarded refresh after success, and list requests remain available when refresh is refused.

Verification:
- Follow-up: 96 focused cases passed across the settings store, window runtime, API boot/settings
  transport and Vue recovery view. Two additional mutation regressions pass for disable and uninstall:
  refresh is attempted once, refusal is reported, success/list events still publish and the actor
  handles another list request. The UI sends plain serializable targets and version data across its
  transport boundary, including when its props are Vue proxies.
- Host, API test/source and renderer typechecks and scoped lint pass. Workspace packages and SDK API
  reports were refreshed after the explicit-reset contract was restored; reports retain LF endings.
- The cleanup author previously recorded a full `npm run typecheck` pass, including `api:check`.
  The follow-up does not claim another full aggregate run.
- `tests/runtime/unbound.spec.ts`' admin stub lacked the recovery methods, so `typecheck:sdk` was already
  failing at `a05b5748a`. The cleanup completed that stub, which is retained.
- A run of the packs-system file passed 36 existing/new cases and failed 20 install/update cases with
  missing settings on its SDK test runtime, matching the earlier cleanup audit's recorded baseline.
  The two targeted refresh regressions pass independently; the broader file is not claimed green.
- The earlier cleanup audit also records baseline failures in `tests/backup/import.spec.ts` and
  `tests/packs/shipped-packs.spec.ts`; those files were not rerun during the follow-up. No CI, native
  compiler fixtures or packaged app were launched.
