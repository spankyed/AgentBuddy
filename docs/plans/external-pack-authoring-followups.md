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

# Done

All 22 ready items were completed on `AS/external-pack-authoring`. Each change carries its reason in the
code; this is the index from item to commit.

| Item | Commit |
|---|---|
| 1, 2 — release packs a dev build; `--app beta` resolved deps against the wrong app | `c5a16033b` |
| 3 — tear down an active pack before installing over it | `e5d71b849` |
| 4, 5 — `test()` exiting on the release path; a resumable `abuddy release` | `6efd8f48c` |
| 6, 7, 8 — delete `emitDepTypes`, drop the deps glob, use the scaffolded tsconfig | `7d018e0e5`, `df90afeae` |
| 9 — one installed-packs reader, "no record" in its type | `1d6cf3226` |
| 10 — `recoverStagingDirs` takes known/not-known, not an optional Set | `d78131150` |
| 11 — one liveness call whose argument names the failure it chooses | `8cbf795d9` |
| 12, 13 — `includePrerelease` for GitHub deps; a JSONC tsconfig reader | `9d040629a` |
| 14 — swap a built-in pack's published output instead of replacing it | `a78311a5c` |
| 15, 16, 17 — dry-run version, `package-lock.json`, a failing check's output | `4200d3df2` |
| 18 — say why a dev reload did not happen | `a2f4fd4ae` |
| 19, 21 — fail when the pack never loaded; wait for the canvas instead of sleeping | `588f87b27` |
| 20 — `PACK_ARCHIVE`, so step 8 tests the archive a release ships | `40d0e9c1c` |
| 22 — the changelog-comment sweep | `5a53ab5fa` |

One thing outside the list was fixed on the way, because it was failing the E2E suite: the secrets test
read every file under the data and logs directories with `readFileSync`, and the shared
`~/Library/Logs/abuddy-test/app-events.log` has reached 24 GB, which `readFileSync` refuses outright
(`dbb14383d`). **That log file grows without bound and is worth its own look** — every test run on the
machine appends to it, and nothing rotates it.

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
