> **Written in session** `ecc731d9-7b8d-4050-b210-b1ab65aa92e0` (Claude Code, 2026-09-28). Resume it with `claude -r ecc731d9-7b8d-4050-b210-b1ab65aa92e0`.

```
# Goal: a build output that changes without its input does not pass unnoticed

Implement docs/goals/goal-reproducible-builds.md on master, at or after 7617ba990 — the base its Spike
results were measured at.
Before Phase 1, confirm the base: BUILD_UNITS is exported from @abuddy/host/build/packages-built,
PACK_OUTPUTS is in scripts/lib/chain-steps.ts, and packages/default-setup/dev-build.mjs exists. If any
is false, stop and say so — the plan was surveyed somewhere else.
Read Background, Spike results, Decisions, Phases and Constraints first. Decisions are final:
implement them, don't reopen them or stop to ask. There are no open decisions: Phase 0 ran on
2026-09-28 and its results are in Spike results.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — a standing rule,
not this goal's choice): change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward. Stored user data is the exception: it moves with
migrations.

Finished when:
- Phase 1 is implemented and meets its "Done when"; the guard is mutation-checked.
- `npm run repro:check` exists and passes: it builds twice, compares, and fails naming any path whose
  bytes differ between two builds of one input.
- What it compares is derived from BUILD_UNITS and PACK_OUTPUTS, not listed by hand, and it fails by
  name when that derived population is empty.
- Its first full run is recorded in the Outcome: which built outputs are reproducible and which are
  not. That is the measurement this repo has never had.
- npm run typecheck; npm run repro:check; npm run chain once at the end.
- A final summary: done/deferred, evidence, the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit the phase when its "Done when" holds and the checks are green. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: another session works in this checkout and stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- the standing prohibitions in Constraints (git/publishing/real data/processes/preload/example pack/
  release metadata/typed EARS/shims/assertions), in full there.
- bump esbuild, vite, tsup or tsx as part of this goal. Phase 0 measured that there is nothing to fix
  (Spike results); the bump is in Deferred with its evidence.
- add `repro:check` to `npm run chain`. It is two full builds (Decision 5).
- edit a recorded hash by hand.
```

## Background (2026-09-28, at 93dae1a7e on master)

`docs/plans/pack-runtime-nondeterminism.md` recorded that `packages/default-setup/dist/runtime/index.cjs`
differs between builds of identical input. Three bytes, in whether esbuild emits its interop helper's
`isNodeMode` argument — `__toESM(require("https"))` against `__toESM(require("https"), 1)`. Measured
2026-09-25: four runs, four distinct hashes. `dev-build.mjs` is the only producer, since `abuddy build` stops
before `bundlePackRuntime` for a built-in pack. The doc ruled out codegen output, a missing tsconfig,
`packages: 'external'` and sourcemaps, three runs each, and found `bundlePackSource` deterministic.

**What it costs.** `PACK_OUTPUTS` (`scripts/lib/chain-steps.ts:254`) is `packages/default-setup/dist` and
`src/__generated__`. Every step declaring it goes stale once per `compile` and re-caches on the cycle after —
observed as a warm chain at 34.3s with 9 of 11 cached, then 26.1s with 10 of 11.

**"Upgrade esbuild" was never one bump.** Four copies are installed at three versions: `node_modules/esbuild`
0.25.12 (this repo's, `^0.25.0` in four manifests), tsup's and tsx's 0.27.7, unplugin-vue's 0.28.2. The repo
already runs the newer ones, unchosen. The plan doc lists "the FE bundle … and the API through tsup" among
what a bump touches; it does not — Vite declares `esbuild: ^0.25.0` and tsup vendors 0.27.7, and **for a 0.x
version `^0.25.0` means `>=0.25.0 <0.26.0`**, so moving this repo's range to `^0.28.0` would de-dupe Vite
onto its own 0.25.x rather than move it.

**One artifact was measured; three families feed the chain's cache.** Beside `PACK_OUTPUTS` there are
`PACKAGE_BUILD_OUTPUTS` (derived from `BUILD_UNITS`, `chain-steps.ts:224`) and `APP_OUTPUTS`. The CLI and
`@abuddy/testing` bundles come off the same esbuild. Whether those are reproducible has never been measured.

**Prior art for the check.** `api:*`, `facade:*`, `schema:*`, `exports:*`, `seed-parity:*` are the
`<artifact>:check` / `<artifact>:update` shape this repo uses for something recorded that can go stale.
`api:check` is deliberately **not** a chain step, because `typecheck` runs a 0.6s proxy against its 55s; that
is the precedent Decision 5 follows.

## Spike results (2026-09-28, at 7617ba990 on master)

Run in a throwaway git worktree, `.claude/worktrees/repro-esbuild`, since removed. Nothing was installed: the
candidate half redirected the bare `esbuild` specifier to the 0.28.2 copy already present under
`unplugin-vue` with a `node:module` resolve hook, which is why no `npm install` touched the shared
`node_modules` (the worktree's was a symlink to the main checkout's, as `ears-disk-engine`'s is). Machine had
the other session's work running; `npm run compile` was needed first, because `src/__generated__` is
gitignored and absent in a fresh worktree.

| half | esbuild | runs | distinct hashes |
|---|---|---|---|
| **control** | 0.25.12 (this repo's) | 4 warm + 10 cold = **14** | **1** — `dfaf2b5f85d2448c` |
| **candidate** | 0.28.2 (redirected) | 8 cold | **1** — `924feb041b39dbaf` |

"Cold" deletes `dist/runtime/index.cjs` before each run.

**The symptom does not reproduce.** All 45 `__toESM` call sites the plan doc named are still in the output —
`https`, `fs/promises` and the rest — and every one now consistently carries the `, 1`. The population is
unchanged; the output simply stopped flip-flopping.

**Nothing explains why, and that is the finding.** `dev-build.mjs` has not changed since before the
measurement (`git log --since=2026-09-24` on it is empty) and esbuild is still 0.25.12 — the same version the
plan doc measured four distinct hashes at. So no code change and no dependency change accounts for it. The
`isNodeMode` emission flipping is consistent with a **timing-dependent race** in esbuild, which means 14
identical runs are evidence it is not manifesting today, **not** proof it cannot. A latent nondeterminism
nobody watches is exactly the thing that returns silently.

**What an upgrade would cost, for whenever one happens.** 0.28.2 is stable too, at a different hash: +423
bytes, and the difference is in esbuild's own runtime helpers — `__esm` now caches a thrown error and
rethrows it on re-entry. An upstream improvement, not a regression.

## Decisions

Final.

1. **The goal is the property, not the remedy** — this repo can tell you when a build output stops being
   reproducible. Phase 0 vindicated the ordering: had this goal been written as "upgrade esbuild", it would
   now be finished having changed nothing, against a symptom that had already stopped reproducing and may
   come back.

2. **The esbuild bump is deferred, not done** (see Deferred). There is nothing to fix, so bumping would be a
   change with a blast radius and no measured problem behind it.

3. **The check derives what it compares** from `BUILD_UNITS` and `PACK_OUTPUTS`, and asserts the derived
   population is non-empty. A hand-written list of output paths is a guess about someone else's outputs, and
   a check that walks nothing passes over nothing — this repo has shipped both.

4. **The check covers every bundled output the chain caches on**, not only the one the plan doc hashed. Its
   first run is the measurement Background says is missing.

5. **`repro:check` is not a chain step.** Two full builds against a 27s warm chain is not a trade this repo
   makes, and `api:check` is the precedent. It runs before a release and when a bundler moves.

## Phases

### Phase 1 — `repro:check`

- A script in the `<artifact>:check` shape: build twice into separate trees, compare, report every path whose
  bytes differ. If no recorded artifact is needed, say in the script's header why the pair has only one half,
  per root `CLAUDE.md`'s note that an artifact with only an update is one nothing notices has gone stale.
- Population derived from `BUILD_UNITS` outputs and `PACK_OUTPUTS` (Decision 3), asserted non-empty.
- Note for whoever runs it: a clean tree needs `npm run compile` before the pack's runtime bundle exists at
  all — `src/__generated__` is gitignored, which is what made the first spike run fail.

**Done when:** `npm run repro:check` passes on a clean tree; its population is derived and asserted
non-empty; the Outcome records which built outputs are reproducible and which are not. **Mutation:**
perturbing one byte of one built file between the two builds fails the check and names that path; emptying
the derived population fails by name rather than passing.

## Deferred

**Moving this repo's esbuild range to `^0.28.0`.** Phase 0 measured the symptom that motivated it as not
reproducing, so the bump has no problem to solve today. Whoever picks it up later has the evidence above: the
change is four manifests (`abuddy-sdk`, `abuddy-cli`, `api`, `default-setup`) and three direct importers
(`dev-build.mjs`, `abuddy-sdk/src/build/compile-utils.ts`, `scripts/bundle-package.ts`); it does not move
Vite, tsup or tsx, which vendor their own; expect Vite to de-dupe onto its own 0.25.x; and 0.28.2's output is
+423 bytes of better `__esm` helper. Do it when something wants it — a bug fixed upstream, or `repro:check`
reporting the race again — and verify it with `repro:check`, `packages:check` and `test:packaged-authoring`.

## Constraints

- Commit the phase as it finishes, no attribution lines, `git diff --cached` first; pushing, tagging and PRs
  on request only.
- No publishing, releases or triggered workflows (dry runs only).
- No real data dirs; no broad pkill/killall; E2E in the `abuddy-test` namespace.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no edits to version or release
  metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript floor holds, `api:update` after export
  changes.
- Build order: `packages:build` before the CLI suite; default-setup's runtime before the api suites and E2E.
- Investigate failing tests rather than loosening them; mutation-check every new guard.
- External packs are first-class: the fixture packs, the example pack and `test:packaged-authoring` keep
  passing.
- Another session commits in this checkout continuously. Re-read `git status` and `git log` before committing.
