# PR 246 application and native acceptance

The user authorized fresh disposable macOS validation on 2026-10-20. No native/compiler or
Electron acceptance is run on the developer's Mac.

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
