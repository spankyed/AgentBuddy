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
