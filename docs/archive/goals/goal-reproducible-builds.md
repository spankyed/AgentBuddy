> **Done** (`61d1f9688`..HEAD on master). Phase 0 falsified the premise it was written for and Phase 1 shipped
> the check, whose first run found three irreproducible outputs — none of them the one the plan doc named, and
> all three `tsc`'s declaration emit rather than a bundler. The Outcome has the measurements.
>
> **Written in session** `ecc731d9-7b8d-4050-b210-b1ab65aa92e0` (Claude Code, 2026-09-28). Resume it with `claude -r ecc731d9-7b8d-4050-b210-b1ab65aa92e0`.

```
# Goal: a build output that changes without its input does not pass unnoticed

Implement docs/goals/goal-reproducible-builds.md on master, at or after 7617ba990 — the base its Spike
results were measured at.
Before Phase 1, confirm the base: BUILD_UNITS is exported from @apack/host/build/packages-built,
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
- `npm run check:repro` exists and passes: it builds twice, compares, and fails naming any path whose
  bytes differ between two builds of one input.
- What it compares is derived from BUILD_UNITS and PACK_OUTPUTS, not listed by hand, and it fails by
  name when that derived population is empty.
- Its first full run is recorded in the Outcome: which built outputs are reproducible and which are
  not. That is the measurement this repo has never had.
- npm run typecheck; npm run check:repro; npm run chain once at the end.
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
- add `check:repro` to `npm run chain`. It is two full builds (Decision 5).
- edit a recorded hash by hand.
```

## Background (2026-09-28, at 93dae1a7e on master)

`docs/archive/plans/pack-runtime-nondeterminism.md` recorded that `packages/default-setup/dist/runtime/index.cjs`
differs between builds of identical input. Three bytes, in whether esbuild emits its interop helper's
`isNodeMode` argument — `__toESM(require("https"))` against `__toESM(require("https"), 1)`. Measured
2026-09-25: four runs, four distinct hashes. `dev-build.mjs` is the only producer, since `apack build` stops
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
`@apack/testing` bundles come off the same esbuild. Whether those are reproducible has never been measured.

**Prior art for the check.** `api:*`, `facade:*`, `schema:*`, `exports:*`, `content-parity:*` are the
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

5. **`check:repro` is not a chain step.** Two full builds against a 27s warm chain is not a trade this repo
   makes, and `api:check` is the precedent. It runs before a release and when a bundler moves.

## Phases

### Phase 1 — `check:repro`

- A script in the `<artifact>:check` shape: build twice, snapshotting between, and compare, report every path whose
  bytes differ. If no recorded artifact is needed, say in the script's header why the pair has only one half,
  per root `CLAUDE.md`'s note that an artifact with only an update is one nothing notices has gone stale.
- Population derived from `BUILD_UNITS` outputs and `PACK_OUTPUTS` (Decision 3), asserted non-empty.
- Note for whoever runs it: a clean tree needs `npm run compile` before the pack's runtime bundle exists at
  all — `src/__generated__` is gitignored, which is what made the first spike run fail.

**Done when:** `npm run check:repro` passes on a clean tree; its population is derived and asserted
non-empty; the Outcome records which built outputs are reproducible and which are not. **Mutation:**
perturbing one byte of one built file between the two builds fails the check and names that path; emptying
the derived population fails by name rather than passing.

## Deferred

**Moving this repo's esbuild range from `^0.25.0` to `^0.28.0`.** Not done, because the symptom that
motivated it stopped reproducing. What follows is what was measured, so the next person weighing it starts
from numbers rather than from the plan doc's guess.

*Measured 2026-09-28, 0.25.12 against 0.28.2, on the pack runtime bundle:*

| | |
|---|---|
| determinism | no difference — both stable, 14 runs and 8 runs. The nondeterminism this repo has is `tsc`'s declaration emit, which an esbuild bump does not touch |
| build time | no difference — 0.18s wall either way, esbuild's own phase 29–31ms |
| output | +423 bytes, and `__esm` gains error caching: a module whose initializer throws stays errored instead of re-running on the next access, which is what ESM semantics say. Real, and narrow — it bites only where a module throws during evaluation |

*What it would touch:* four manifests (`apack-sdk`, `apack-cli`, `api`, `default-setup`) and three direct
importers (`dev-build.mjs`, `apack-sdk/src/build/compile-utils.ts`, `scripts/bundle-package.ts`). Not Vite,
tsup or tsx, which vendor their own copies.

*One thing that runs against the usual instinct:* consolidating versions is not on offer. Vite currently
shares this repo's 0.25.12; since `^0.25.0` on a 0.x version means `>=0.25.0 <0.26.0`, bumping ours pushes
Vite onto a copy of its own, taking the tree from four esbuild installs to five. Three distinct versions
either way.

*Unread:* esbuild ships no changelog in the package, so 0.26–0.28's release notes were never surveyed. The
`__esm` change above is what a diff of two outputs showed, not a summary of what those three minors contain —
worth reading before deciding, since it is the one input to this that nobody has looked at.

Verify with `check:repro`, `packages:check` and `test:packaged-authoring` if it is ever done.

## Constraints

- Commit the phase as it finishes, no attribution lines, `git diff --cached` first; pushing, tagging and PRs
  on request only.
- No publishing, releases or triggered workflows (dry runs only).
- No real data dirs; no broad pkill/killall; E2E in the `apack-test` namespace.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no edits to version or release
  metadata.
- Typed EARS types are change-controlled (`packages/apack-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript floor holds, `api:update` after export
  changes.
- Build order: `packages:build` before the CLI suite; default-setup's runtime before the api suites and E2E.
- Investigate failing tests rather than loosening them; mutation-check every new guard.
- External packs are first-class: the fixture packs, the example pack and `test:packaged-authoring` keep
  passing.
- Another session commits in this checkout continuously. Re-read `git status` and `git log` before committing.

## Outcome (2026-09-28)

**Phase 0 — the premise was false.** The symptom the goal was written for does not reproduce: 14 runs at
esbuild 0.25.12 and 8 at 0.28.2, one hash each. Nothing explains why (`dev-build.mjs` unchanged since before
the 2026-09-25 measurement, esbuild unchanged), which fits a timing-dependent race. The esbuild bump is in
Deferred with its evidence; nothing was bumped.

**Phase 1 — the check shipped, and its first run paid for the goal.** `npm run check:repro`
(`scripts/repro.ts`, `scripts/lib/repro.ts`) builds everything twice and compares 1295 built files in **54.7s**.
Three are irreproducible, and **none is the file the plan doc named**:

| output | behaviour |
|---|---|
| `dist/defs/monaco/action-defs.d.ts` | **five distinct hashes in six builds** |
| `dist/types/pack-types.d.ts` | flips intermittently |
| `dist/snapshot.json` | records the facade's hash, so it moves with it |

**The cause is `tsc`, not a bundler.** TypeScript's declaration emit orders a union's members differently
between runs — `"topic" \| "status"` one build, `"status" \| "topic"` the next. So the plan doc's diagnosis
pointed at the wrong tool, and the worst instance in the tree had never been looked at. `dist/runtime/index.cjs`,
the one file that *was* measured, is reproducible.

They are recorded in `KNOWN_IRREPRODUCIBLE` with their cause and reported on every run rather than failing it:
all three are races, so failing on a run where one happens to agree would make the check flaky toward a false
green. A spec asserts each entry still names a path inside the derived population, so an exception cannot rot
into dead text.

### Corrections to the Decisions

- **`check:repro`, not `repro:check`.** Root `CLAUDE.md` reserves `<artifact>:check`/`<artifact>:update` for a
  *recorded* artifact whose halves share a noun. This records nothing and re-derives both sides, like
  `check:tiers` and `check:specifiers`. The original name advertised an `update` half that cannot exist.
- **Two sequential builds in one tree**, not two trees: the builds write to fixed paths inside the repo, so
  snapshotting between them is what "build twice, compare" means here.
- **Scope is `BUILD_UNITS` + `PACK_OUTPUTS`.** Decision 4 read wider than the prompt block's checkable
  Finished-when; the narrower, checkable reading won.

### The trap worth knowing about

`apack build` calls `generateEntries([])` with no `--force`, and `generate-entries` returns early on a
matching `.inputs-hash`. A check that left codegen to `apack build` would re-hash `src/__generated__` without
regenerating it and report it identical — half of `PACK_OUTPUTS` passing for having been looked at. The script
runs `generate:entries -- --force` itself, and a spec pins the flag.

### Follow-ups, deliberately not done

- **`APP_OUTPUTS` is not covered** (renderer, api, main, preload). A third full build, ~37s more.
- **The `tsc` ordering itself is unfixed.** Whether it is worth chasing upstream, sorting the emitted unions,
  or leaving recorded is a decision nobody has had the measurement to make until now.
