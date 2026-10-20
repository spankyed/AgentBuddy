# PR 246 application and native acceptance

The user authorized fresh disposable macOS validation on 2026-10-20. No native/compiler or
Electron acceptance is run on the developer's Mac.

## Runs

- [Strict acceptance 39387174436](https://github.com/spankyed/AgentBuddy/actions/runs/39387174436):
  product checkpoint `1f92ce805c4d2c2168e08558ba0d050332eb11e1`, `--strict --all --cores 2`.
  Pending. Includes the real LMDB import/hydration/rollback tests and external-pack application gates.
- Supplemental `app-acceptance.yml`: pending dispatch. Runs the general app suite, a foreign step's
  own service through the running brain, persisted-settings recovery/reopen, and the real source
  `apack pack dev` supervisor with initial install and watched replacement. These acceptance additions
  change fixtures and validation only; the product source is the strict run's checkpoint.

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
- **Beta:** GitHub's release API returned no published prereleases on 2026-10-20. A real
  `--host beta --fresh` invocation is recorded separately; absence of a compatible beta cannot prove
  packaged install/restart behavior. No release is created, metadata changed, or source host
  substituted for this acceptance item.

No pending item above is claimed passed until its runner evidence is inspected.
