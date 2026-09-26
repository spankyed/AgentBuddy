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
| `verify-node-modules.mjs` passes when the bundled CLI directory is missing | Settled by reading it: it moved to `build/prod/`, and `abuddy-cli/tests/build/verify-node-modules.spec.ts:29` asserts it fails when the bundled CLI's dependencies or a platform binary are missing |

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
`~/Library/Logs/abuddy-test/app-events.log` had reached 24 GB, which `readFileSync` refuses outright
(`dbb14383d`). The unbounded growth this flagged is closed since: `appendCappedLine`
(`abuddy-host/src/logs.ts:25`) renames the file to `.old` at `LOG_FILE_MAX_BYTES`, so a run keeps one
previous generation and no more. The 24 GB file is gone from this machine.

---

# Deferred

## Needs its own plan

**Implement `docs/goals/goal-defs-naming.md`.** `defs` names three things; the facade sense is the intruder
and the repo already calls it `facade` everywhere else. Already has a goal doc. Blocked on its Open decision
1: a renamed field would make a pre-rename dependency **silently untyped**, not rejected, because
`generate-entries.ts:477` skips a snapshot with no facade rather than failing. Sequence after the
`emitDepTypes` deletion.

**Advisory-lock the database write lock.** Recorded here as "124 lines of pid/hostname/interrupt/staleness
logic exist only because a pidfile is not released by the kernel", and blocked on a dependency decision.
Both halves were wrong, and investigating it found something else:

- **Acquisition wasn't atomic.** The lock checked and then wrote; six processes racing all acquired it. That
  was the live bug, it had nothing to do with staleness, and `openSync(file, 'wx')` fixed it.
- **The dependency isn't blocked.** `fs-native-extensions` is N-API with prebuilds for every platform that
  matters, loads under Electron without a rebuild, and holds across Node and Electron with `SIGKILL`
  releasing it. Measured, not assumed.
- **About 50 lines would go, not 124**, and `flock` carries no metadata, so the file stays either way.

What is left for an advisory lock is a false held (loud, one `rm`) and the take-over window `wx` can't
close. Deferred on value rather than blocked on a dependency: see `docs/goals/deferred/goal-write-lock-advisory.md`
for the spike and the accounting.
`write-lock.ts`

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

Five things the original review listed that a grep could not settle:

- build-only facets not enforced: `.vue`/`.css` imports are stubbed, but `vue`/`lucide` stay external
  (`be-bundler.ts:113-120`)
- a saved beta choice ignoring `hostVersion` (`app-target.ts:111-118`)
- "Install in PATH" errors other than `EACCES`/`EPERM` becoming unhandled rejections
  (`cli-command.ts`, `MacOSAppMenu.ts`)
- three more fixture smells: `readPackLastError` failing open, teardown `rmSync` racing API shutdown, the
  console listener attaching after the renderer may already have logged
- the strength of the symlink check at `test-packaged-authoring.sh:375`
