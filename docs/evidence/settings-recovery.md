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

Follows the review of `3a6b649b5`. The contract is narrower, and the design (detect at boot, host-only
recovery, explicit reset, relaunch) is unchanged.

- **Repair resets invalid values, not owners.** `RECOVER_SETTINGS` takes `{ version, scope: 'invalid' | 'all' }`.
  `invalid` removes each failing stored value at its path, stopping at the first array (arrays are one
  value), so only that key falls back to its default. An owner that still fails afterwards is reset whole.
  A malformed document refuses `invalid` and needs `all`. A bad hotkey no longer costs the projects list.
- **Recovery is a state boot sets.** Boot calls `enterRecovery()` when its pre-hydration inspection finds
  problems. `getRecovery()` returns nothing outside recovery, and in recovery re-inspects the stored row,
  so no problems means repaired. Normal reads no longer validate the whole document. In recovery they
  refuse, because no pack runs then and the invalid values must not be read typed.
- **One recovery shape and event.** `SettingsRecovery` is `{ version: { runId, revision }, problems }`. The
  `status` field, `catalogRevision` (the catalog is frozen in recovery) and the `SETTINGS_RECOVERED`
  event are gone. A repair is answered with `SETTINGS_RECOVERY` for that call, and other windows hear the
  broadcast that follows the write.
- **Packs no longer see recovery.** `SettingsPort.status()` lost `'recovery'`; the window runtime keeps it
  internally and reports `loading`. The recovery types stay in the SDK because `SettingsAdmin`, the host's
  admin contract, carries the recovery methods.
- **S.1's post-change refresh is isolated.** After a toggle or uninstall has taken effect, a refused catalog
  refresh is reported (`refreshAfterChange`) instead of turning the completed change into a failure.

Verification:
- Passing: the recovery cases in `store.spec.ts`, `settings-runtime.spec.ts`, the API boot
  `settings-recovery.spec.ts` and the renderer `recovery.spec.ts`. One case keeps a valid projects list
  through resetting an invalid hotkey.
- The full `npm run typecheck` passes, including `api:check`. The three regenerated SDK reports differ
  only by this change. API Extractor wrote them with CRLF line endings, and they were converted back to LF.
- `tests/runtime/unbound.spec.ts`' admin stub lacked the recovery methods, so `typecheck:sdk` was already
  failing at `a05b5748a`. The stub was completed.
- Failing here and at `a05b5748a` alike, so not caused by this change: `tests/features/packs/be/system.spec.ts`
  (the SDK test runtime has no settings for install admission), `tests/backup/import.spec.ts` and
  `tests/packs/shipped-packs.spec.ts`. `compiler-watch.spec.ts`' live watcher case refuses by design on
  this Mac. No CI was dispatched.
