# External pack authoring: remaining action items

Compiled 2026-09-19 on `AS/external-pack-authoring`, from the branch's own review notes plus two later
review passes. Every location and count below was checked against the tree on that date; items under
**Unverified** were not, and say so.

Four notes were dropped as already fixed, and are recorded here so they are not re-raised:

| Note | Why it is closed |
|---|---|
| Built-in snapshots carry no type defs | `dist/snapshot.json` has `defs: { 'pack-types': … }` (161 KB). `DEFS_DIR` now only clears build output; the snapshot's facades come from `bundlePackTypes()` directly |
| An empty `.sha256` installs unverified | `pack-installer.ts:308` requires `/^[0-9a-f]{64}$/i` |
| Node floor `>=20.6` vs `import.meta.dirname` | Both CLI and testing are `engines: >=22` |
| `@abuddy/sdk/build` re-exports host-only `discover`/`shared-deps` | Moved to `@abuddy/host` |

`lookupRegistry` (`fetch-deps.ts:264`) is a deliberate placeholder until `api.abuddy.com` exists, not a task.

---

# Ready to do

Each of these is a contained change, verifiable on this machine.

## Ships the wrong artifact, silently

**1. Release packs a dev build.** `verify()` builds `--release`, the E2E fixture then rebuilds with plain
`abuddy build`, and `packRelease()` ships that — unminified, with source maps. Pack before E2E, or teach the
fixture `--release`. The workflow path is unaffected because CI rebuilds.
`release.ts:140,150`, `abuddy-testing/src/index.ts:225`

**2. `--app beta` resolves dependencies against the wrong app.** `appFromEnv` reads `ABUDDY_APP`;
`fixtureEnv` sets only `ABUDDY_APP_EXECUTABLE`. Locally it silently uses the saved checkout; in CI, with no
saved choice, the build fails on an unresolvable dependency. The fix is one env var and a unit test on
`fixtureEnv`; the beta download itself is not needed to prove it.
`test.ts:20-37`, `app-target.ts:79,106`

## Pack state

**3. Tear down an active pack before installing over it.** `INSTALL_PACK` goes straight to `activatePack`,
and `registerPack` throws "already registered".
`packs-system.ts:159-177`

## Release flow

**4. Stop `test()` calling `process.exit` on the release path**, so the "revert version files" message
prints. `test.ts:48,62,70,79`

**5. Make `abuddy release` resumable, and print the exact state after a post-commit failure.** Four failure
points follow the version commit (pack, tag, push, publish); each leaves a bumped commit, and a rerun calls
`nextReleaseVersion` on the already-bumped version and bumps again. `packRelease` has to follow the commit
so `integrity.json`'s `source.commit` is the tagged commit, so reordering cannot close the window — detect
the state and continue instead. Rolling back with `git reset --hard` is the wrong instinct. Testable against
a temporary git repo. `release.ts:287`

## Types and the dev loop

**6. Delete `emitDepTypes` and `.abuddy/generated/types.ts`.** Nothing imports the barrel — the `#generated/*`
alias points at `src/__generated__/`, not at it. The scaffolded tsconfig compiles it, so it can only fail,
never help. This *is* the `file:`-dependency bug: `resolveDepFiles` returns early on the `filePath` branch
without `cacheDep`, so `.abuddy/deps/<id>/defs/` never exists and the barrel's import dangles. Deleting the
barrel removes the bug without a caching change.
`generate.ts:70`, `generate-entries.ts:287`, `fetch-deps.ts:392`

**7. Drop `.abuddy/deps/**/*.d.ts` from the scaffolded tsconfig.** A cache is not program input, and no pack
source imports from it. Today every pack type-checks ~161 KB of dependency declarations twice — once inlined
at `src/__generated__/deps/<id>.d.ts`, once from the cache. `init.ts:73`

**8. Make the test packs use the tsconfig `abuddy init` scaffolds.** `pack-builds.ts` compiles only
`src/**/*.ts`; the scaffold adds three more globs. That divergence is why `facade-typing.spec.ts` exercises a
`file:` dependency and still passes — no spec ever compiles generated output.
`tests/helpers/pack-builds.ts:44`

## Contained refactors

**9. Collapse the two `installed-packs.json` readers into one outcome type.** `readInstalledPacks()`
flattens "no record" to `[]`, which reads as "every pack was uninstalled" — it already deleted a pack's only
copy once. Return `{ found: true; packs } | { found: false }`.
`installed-packs.ts:53,69`. 6 production callers of the plain reader (`pack-updater.ts:103,160`,
`activation-outcome.ts:11`, `packs-system.ts:143,246,343`), 2 of the record reader (`pack-discovery.ts:91`,
`staging.ts:114`), plus the barrel at `packs/index.ts:16`.
Verify: `npm test -w @abuddy/host`, `npx vitest run tests/unit/boot-recovery.spec.ts --root packages/api`

**10. Make "unknown" unrepresentable in `recoverStagingDirs`.** An omitted `installedIds?` means "restore
everything", an empty Set means "delete everything", and `new Set([])` is truthy. Take
`{ known: true; ids } | { known: false }`.
`staging.ts:54`. 1 production caller (`:120`), 7 in tests.
Verify: `npx vitest run tests/packs/staging.spec.ts --root packages/abuddy-host`

**11. Merge the two liveness predicates into one call that names its policy.** `_writerIsRunning` can report
a live holder as gone (it is wall-clock derived); using it for a lock admits two DB writers, using
`_processIsRunning` for staging only leaves a directory uncollected. Neither name says so.
`process-liveness.ts:19,78`. **Do the OS-lock item first if it is going to happen at all** — it removes the
lock's need for a predicate and shrinks this to staging plus `readApiEndpoint`.
Verify: `npx vitest run tests/database --root packages/abuddy-host`

## Small fixes

**12. Add `includePrerelease` to the GitHub release filter in `fetch-deps`,** so `v0.2.0-beta.0` matches `*`.
The local check has it. `fetch-deps.ts:190` vs `:126`

**13. Fix the tsconfig comment stripper.** `.replace(/\/\/.*/g, '')` eats the rest of any line holding `//`,
so `"$schema": "https://…"` breaks the parse and path aliases are silently dropped. Use a JSONC parser.
`be-bundler.ts:250`

**14. Non-atomic host pack publishing.** `pack-layout.ts:290` deletes `destDir` before renaming staging into
place — a window where a built-in pack's published output does not exist.

**15. A dry-run release produces a version-mismatched archive.** `writeVersion` is skipped on a dry run
(`release.ts:268`) but `buildPackArchive` gets the `{ version }` override, so `abuddy.json` carries the new
version while the snapshot inside carries the old one.

**16. `abuddy release` never bumps `package-lock.json`.** The string does not appear in `release.ts`.

**17. Release output hides `tsc` and `vitest` diagnostics.** `release.ts:47,117-150`. (The Windows shell half
of this note is deferred — it cannot be tested here.)

**18. `abuddy dev` reports one generic failure** ("Could not reach dev app"). Now a single site, down from
two. `dev.ts:46`

## Coverage

**19. Have the E2E fixture assert the pack's backend actually loaded**, not only that seeding left no
`lastError`. Boot-time failures (hostVersion, format, a runtime throw) are logged, so a backend-only pack
passes its tests while dead. `abuddy-testing/src/index.ts`

**20. Make `test-packaged-authoring.sh` exercise the installed archive** rather than rebuilding from source
at step 8.

**21. The E2E fixture sleeps instead of waiting for a condition.** `waitForTimeout(500)` in `navigate`.
`abuddy-testing/src/index.ts:437`

## Cleanup

**22. Sweep the codebase for changelog-style comments.** The criterion is in the root `CLAUDE.md` ("A comment
is for whoever opens the file cold"); the repo-wide pass has not run. Tedious but mechanical.

## Suggested order

1. **1, 2** — small, and each makes a release or a CI run silently wrong.
2. **6, 7, 8** — deletions that remove a bug and the blind spot that hid it.
3. **4, 5** — the release flow, in that order.
4. Everything else by appetite.

---

# Deferred

## Needs its own plan

**Seed external packs in dependency order, and retry a seed that failed on a missing dependency.** No
toposort exists anywhere in host or SDK. The hash is stored even when seeding fails, so a pack that seeded
before its dependency is skipped on every later boot until its data changes. `lastError` is now recorded on
the installed-packs entry, so the failure is visible — but it is never retried. This is the highest-value
deferred item and the only real design change in the list: it needs an ordering pass over the pack graph and
a decision on retry semantics. It should become a goal doc.
`packs/runtime/seed.ts:66,172`

**Make reinstall report honestly.** `addInstalledPack` replaces the whole entry; `activationProblem` surfaces
a problem, but the hash-skip underneath is the seeding item above. Follows it.
`installed-packs.ts:91`

**Implement `docs/goals/goal-defs-naming.md`.** `defs` names three things; the facade sense is the intruder
and the repo already calls it `facade` everywhere else. Already has a goal doc. Blocked on its Open decision
1: a renamed field would make a pre-rename dependency **silently untyped**, not rejected, because
`generate-entries.ts:477` skips a snapshot with no facade rather than failing. Sequence after the
`emitDepTypes` deletion.

**Replace the pidfile write lock with an OS advisory lock.** 124 lines of pid/hostname/interrupt/staleness
logic exist only because a pidfile is not released by the kernel. `flock`/`LockFileEx` deletes the class.
Blocked on a dependency decision: it needs a native module (the app already ships `lmdb` and
`@napi-rs/keyring`, so it is not categorically out). **Not** `proper-lockfile` — its heartbeat lapses under
the synchronous LMDB work the lock protects, producing the exact double-writer it prevents.
`write-lock.ts`

**Move `readApiEndpoint` and `process-liveness.ts` out of the SDK into `@abuddy/host`.** App plumbing sits in
the pack contract because `packages/default-setup/dev-build.mjs:97` calls it and default-setup cannot depend
on host. Blocked on removing that script's need to discover the API first, which is its own change.
`packages/abuddy-sdk/src/env/index.ts:29`

## Cannot be verified here

**Create the GitHub release as a draft, upload assets, then publish.** A rerun after a failed upload gets a
422 because the release exists. Proving the fix needs a real release cycle against GitHub.
`release.ts:219-232`

**Guard the publish workflow** — a `github.ref` check, and typecheck/tests before publish. Needs a workflow
run to verify. Hardening only: it is `workflow_dispatch` only and dry-run by default.
`publish-packages.yml`

**Beta resolution hits the network before checking the cache.** `beta-app.ts` fetches the release list
(`:56`) before the `existsSync` cache hit (`:113`): no offline use, and a CI rate-limit risk. No beta build
with checksums has been published yet, so there is nothing to resolve against.

**`npx`/`npm` fail on Windows without a shell.** `release.ts`. No Windows machine here.

## Blocked on you

**Delete `packages/api/scripts/db/fix-prod-upgrade.ts`** once you have run it. Its header and
`goal-abuddy-db-cli`'s Decision 8 both say to, and it is the last unconsolidated copy of `findRunningApp`.

## Unverified — needs reading, not grepping

Six things the original review listed that a grep could not settle:

- build-only facets not enforced: `.vue`/`.css` imports are stubbed, but `vue`/`lucide` stay external
  (`be-bundler.ts:113-120`)
- a saved beta choice ignoring `hostVersion` (`app-target.ts:111-118`)
- `verify-node-modules.mjs` passing when the bundled CLI directory is missing — it moved to `build/prod/` and
  now has a spec, so it may already be fixed
- "Install in PATH" errors other than `EACCES`/`EPERM` becoming unhandled rejections
  (`cli-command.ts`, `MacOSAppMenu.ts`)
- three more fixture smells: `readPackLastError` failing open, teardown `rmSync` racing API shutdown, the
  console listener attaching after the renderer may already have logged
- the strength of the symlink check at `test-packaged-authoring.sh:375`
