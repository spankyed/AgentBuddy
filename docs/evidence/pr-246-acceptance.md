# PR 246 application and native acceptance

The user authorized fresh disposable macOS validation on 2026-10-20. No native/compiler or
Electron acceptance is run on the developer's Mac.

Current repair preserves compiler dependency observations and moves runner caches to `.apack/tests/vite`.
The temporary root-listing filter in the chronological checkpoints below was removed after diagnosis.

## Runs

- [Strict acceptance 39387174436](https://github.com/spankyed/apack/actions/runs/39387174436):
  product checkpoint `1f92ce805c4d2c2168e08558ba0d050332eb11e1`, `--strict --all --cores 2`.
  Failed at the pack unit pool: four assertion failures in two files, not timeouts. Before that,
  all 486 host files passed (5,756 cases; seven skips), including all six real LMDB import/rollback
  cases and the API recovery boot case. All typecheck legs, lint, schema/API/facade/package checks and
  external fixture contracts/fork preparation passed. Integration and app gates were not reached.
  The four failures are stale refusal assertions, a mock import left unfinished after a failed
  assertion, and an undeclared-service access with no expected runtime refusal. The two affected
  files pass all 59 cases after focused repairs; product runtime behavior was not loosened.
- [Supplemental app run 39388281465](https://github.com/spankyed/apack/actions/runs/39388281465):
  checkpoint `faba06f60`; preparation failed before any app tests. The renderer's Vite build aborted
  at V8's approximately 2 GiB heap limit. This was an out-of-memory failure, not an assertion or timeout.
  Follow-up gives only the runtime build a 4 GiB heap and explicitly uses two build workers.
- [Supplemental follow-up 39390043545](https://github.com/spankyed/apack/actions/runs/39390043545):
  checkpoint `d1dc5c283`, failed. The real settings recovery/reopen case passed; the general app
  suite passed 25 cases and failed seven. The external pack suite refused its prebuilt compiler
  startup input (`["entries", ""]`); its default-fork case also lacked preparation. The source CLI
  scenario reached its 60-second initial readiness deadline. Failure inventory and focused repair
  remain pending. All six native LMDB cases passed again. Preparation, including the renderer build
  with the bounded larger heap, passed.

## Coverage boundaries

- **7.2:** the external stamp step now calls a service owned only by its pack. The app test makes its
  flow the root, sends a trigger through the real brain, and observes the service's database write.
  It restores the original root afterward. A runner-owned service factory cannot resolve that service.
- **8.1/8.2:** `packages/apack-host/tests/backup/import.spec.ts` opens real LMDB files and injects
  hydration/reopen failures. Assertions cover incumbent disk and memory restoration and a readable
  retained rollback copy when restoration fails. The app suite separately exercises normal backup
  export/import over the running app's settings/database UI.
- **5.1/S.1/S.2:** the added app case seeds invalid app/feature overrides into real LMDB, repairs
  through the recovery UI, reloads the window, checks unavailable-owner preferences survive, and
  reopens the app to verify normal pack frontend acceptance. Existing boot tests separately prove
  external modules are not imported and pack mutation is refused during recovery.
- **S.5:** the standalone source-host scenario runs the actual CLI/watcher, observes a manifest
  change become a different accepted frontend runtime, and checks the installed declaration.
  Individual startup/rebuild waits remain bounded; cleanup signals only the owned supervisor.
- **Beta:** the user renamed the repository to `spankyed/apack` on 2026-10-20. The former and
  canonical endpoints resolve to the same repository ID (`973469181`), and `origin` now uses the
  canonical URL. The CLI's release endpoint is reachable after the rename and returns no published
  prereleases. The packaged half of S.5 (install while stopped, restart after a backend rebuild)
  remains unproven. No release is created, metadata changed, or source host substituted for it.

No pending item above is claimed passed until its runner evidence is inspected.

## Focused repair checkpoint, 2026-10-20

The seven general-app failures were: two navigation event waits (Library and Logs), two settings
update assertion waits against the removed `SETTINGS.UPDATE` event, one assertion on removed plugin
settings metadata, one reset-button locator wait against its old title, and one offline-database
assertion assuming declarative defaults create a stored Settings row. No cleanup failure was reported.
Tests now await the relevant pack plugin, use real preference forms and the rendered settings catalog,
and save an explicit override before querying offline. The reset assertion uses the current form action.

External-pack cases refused before app launch; these were setup failures, not native execution hangs.
A private filesystem regression reproduces invalidation of a recorded root listing when a test runner
first creates `node_modules`. Authored directory listings now omit that dependency directory while
explicit dependency reads/listings remain tracked. The regression failed before the repair; the seven
applicable compiler-file-view checks pass after it (the Windows-only case is skipped on macOS).
Runner confirmation remains pending; directory refusals now show recorded and observed entries.
The supplemental workflow also prepares the default fork through its actual producer.

The source pack-dev scenario hit its composed initial-readiness deadline, not an observed child exit.
Its 60s covered cold compilation, frontend compiler startup, app launch, install and watcher readiness;
the same fixture's cold build in the saved run took 153s. Initial setup now has a bounded 300s allowance;
the separate 60s rebuild, 30s runtime acceptance, 15s connection and 15s cleanup limits are retained.
Its child output is streamed as well as retained so the phase reached is visible during execution.

Host and E2E typechecks and focused correctness lint pass. App validation remains pending on a
disposable runner; this checkpoint does not mark any unrun acceptance case complete.

The follow-up audit also found that the reload E2E edited compiled content without renewing its
integrity seal. This no longer models a completed build: reload admission correctly refuses altered
output. The fixture now seals the changed output through the normal build helper and restores content,
manifest and integrity bytes after every outcome. E2E typechecking and focused lint pass; its running-app
confirmation remains pending. App run `39396277423` is pinned to the preceding repair checkpoint
`103e62df1`, so it does not include this subsequent fixture correction.

The remaining static audit corrected the CLI-path case's save acknowledgment: CLI Providers owns its
save state, so the containing General form cannot display that request's success. The test now waits
for the accepted override in the Code actor, then remounts the Settings canvas and checks its value.
Twenty-four additional pure file-view/input-record checks pass across three affected files. No native
compiler or app execution ran on the developer Mac.

## Follow-up run 39396277423

[Disposable run](https://github.com/spankyed/apack/actions/runs/39396277423), source `103e62df1`:
shipped build, runtime, fixture contracts and fork preparation passed. General app results are **30/32**;
the two failures are exactly the later sealed-reload fixture repair (`405487108`, assertion 500 vs 200)
and CLI-save acknowledgment repair (`a611eee3b`, 5s event/UI wait). Recovery/reopen and the other five
previously failing app cases now pass. All six real LMDB cases passed again.

External cases still refused before launch, now at the explicit missing `node_modules` namespace probe
rather than the authored root listing. Vitest's native results cache creates that directory after build.
Move its cache into `.apack/tests/vite`; do not weaken or discard the negative dependency observation.
A private filesystem regression using the actual helper configuration reproduces the runner refusal
before the change and passes afterward; creating an actual dependency namespace still refuses. That
regression and all six prebuilt-pack cases pass, as do the testing/E2E typechecks and correctness lint.

Source `pack dev` successfully built, launched, installed and reached watcher readiness after 256s.
The retained compiler's preceding complete build took 109s. The requested manifest edit triggered
another build (changed entries, content and backend output are logged), so this was a **composed
build/delivery timeout**, not a demonstrated missed rebuild: the old 60s wait expired during compilation.
The scenario now separately bounds rebuild/install at 180s and frontend acknowledgment at 30s;
connection, initial runtime and cleanup limits remain unchanged. No cleanup failure was reported.

Saved evidence: `/private/tmp/apack-app-39396277423.log` and
`/private/tmp/apack-app-39396277423/`. No beta release exists for packaged-host acceptance.
The next runner check must exercise the external suite and source CLI with these repairs and the two
already committed app fixture corrections; the final strict gate is still pending.

### Keep the repair at the output owner

The explicit namespace refusal establishes that the compiler correctly observed the missing dependency
directory. Moving runner output is sufficient; hiding a subsequently appearing `node_modules` entry
from an explicitly captured root listing is unnecessary and could change dependency discovery. Remove
the earlier directory-filter relaxation and its permissive expectation. Keep the richer refusal details.
The runner-cache regression now proves that `.apack` output preserves the complete recorded inputs,
while both the original directory listing and the explicit negative dependency probe still detect an
actual dependency-directory appearance. This replaces the earlier proposed listing exclusion above.

The remaining reload assertion audit found two external cases accepting a temporarily absent frontend
runtime as "different". They now require a present, different accepted runtime, matching the source CLI
case. Fixture typechecking and correctness lint pass. Their stronger assertions belong to the final
committed-source acceptance, rather than being claimed from the already running earlier checkpoint.

## Complete inventory: run 39400009119

[Disposable run](https://github.com/spankyed/apack/actions/runs/39400009119), `387cc62f6`:
**25/28 external cases and 31/32 general app cases passed**. The external step's own service was
executed through the actual brain. All six LMDB cases passed again; the running-app backup test also
completed real export/import and restored its saved values before its later frontend-form wait failed.
The cache-location repair resolved prebuilt admission; no cache refusal remained.

| Failure | Classification | Evidence / repair |
| --- | --- | --- |
| Built-in content reload | Assertion (500 vs 200) | Sealing with the parsed snapshot normalized declaration key order. Preserve the original authored manifest when resealing. A passive local comparison confirms authored and parsed serialization differ while the original sealed manifest equals source. |
| Default-fork replacement | Individual frontend/UI wait (5s) | Backend accepted the fork, but the old label remained when the default assertion deadline expired. Await a present, changed accepted runtime in both windows before checking labels; apply the same boundary to reload; retain the restoration assertion's existing bound. Keep value assertions at their existing limits and retain traces for any remaining frontend refusal. |
| Backup settings ownership | Individual frontend/UI wait (5s) | Import and data assertions completed. After reactivating the companion, its custom form was not present yet. Await its new accepted frontend runtime before asserting the restored form value. |
| Dependency credentials | Whole-case deadline (60s) | The case also compiles a cold pack and checks its generated types before testing authority and two activation cycles. It expired as the re-enabled backend registered. Bound the backend-only build at 180s, typecheck at 20s, and complete case at 240s (40s for credential/lifecycle checks); retain existing individual event waits. |
| Source pack dev | Composed startup deadline (300s) | The initial build completed at 159s, then app/server startup completed. The watcher performs a second initial publication; it was still compiling when the old combined deadline expired. Bound each complete backend/frontend build at 300s (180s + 120s), separately bound app/server startup at 60s, then retain the 30s runtime acknowledgment and 15s connection/cleanup bounds. |

No cleanup failure was reported. The default-fork case composes two 30s frontend publications plus
90s for its windows/UI/restoration (150s overall); both windows' publication waits run together.
The final restoration assertion retains its original 5s bound. These changes do
not alter the default suite/test deadlines or skip value, ownership, refusal, integrity or delivery checks.
Frontend waits remain unproven until the corrected running-app cases pass; they are not diagnosed as
mere slowness from a timeout alone.

Evidence is retained in `/private/tmp/apack-app-39400009119.log`,
`/private/tmp/apack-app-39400009119/`, and its earlier `-suites` download.

Focused follow-up selects only the four failed Playwright cases plus the real source CLI scenario.
The dispatch now explicitly selects `app_acceptance_suite=all|app|external`; an optional
`app_acceptance_test` filters Playwright case names. `all` retains CLI/native acceptance even when its
Playwright cases are filtered. Empty patterns retain the complete selected suite; no default gate is
removed. Both the external fixture and the root app retain failure traces.

## Focused run 39405960363: app report inspected while CLI continues

Source `fe42a10b1`, four selected Playwright cases. The built-in content reload passes with the authored
manifest repair. Both settings-ownership cases pass: real backup import updates the independent window
and restored companion form, and the cold-build/typecheck/credential/reload scenario completes with its
individual operation bounds intact.

The default-fork trace proves replacement in both windows, its visible fork component, actual reload,
user ownership and preserved personal preferences all pass. Its only failed test step is the final 5s
restoration label check ("Fork Notes" instead of "Notes"). The backend accepted the restoration near
that deadline. Restoration now waits for a changed accepted frontend, like replacement/reload, before
retaining the original 5s label assertion. If the source frontend was already current following a refused
candidate, no new runtime is required; this avoids obscuring a primary failure with an unnecessary
cleanup generation requirement. Process cleanup limits are unchanged. The complete fork scenario's
150s allowance covers three 30s publications and 60s for windows/UI.

Early evidence: `/private/tmp/apack-app-39405960363-suites/`. The source CLI result and final strict gate
are still pending; the trace does not claim restoration complete.

## Completed focused run 39405960363

The source CLI's initial installation, manifest-triggered rebuild, installation and changed frontend
acknowledgment all passed. Its remaining failure is **cleanup**, not a build or delivery timeout:
the supervisor's inherited output had not closed within 15s after SIGTERM. The log does not yet
distinguish a live supervisor from a surviving pipe owner. It also shows a further checkout-package
freshness invocation around shutdown; that is evidence to investigate, not proof of the cause.
All six real LMDB import/rollback cases passed again.

Retain the existing cleanup bound. A focused `cli` dispatch avoids rebuilding the default fork or
rerunning unrelated app cases and captures a one-second stack sample of the owned supervisor if it is
still alive ten seconds into cleanup. The sample has its own three-second process limit and remains
inside the runner evidence directory. No compiler/native workload runs on the developer's machine.
The restoration synchronization fix is committed as `e86fcb3ba`; final strict acceptance remains pending.
