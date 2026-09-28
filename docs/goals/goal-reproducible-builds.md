> **Written in session** `ecc731d9-7b8d-4050-b210-b1ab65aa92e0` (Claude Code, 2026-09-28). Resume it with `claude -r ecc731d9-7b8d-4050-b210-b1ab65aa92e0`.

```
# Goal: a build output that changes without its input does not pass unnoticed

Implement docs/goals/goal-reproducible-builds.md on master, at or after 93dae1a7e — the base its
Background was surveyed at.
Before Phase 1, confirm the base: packages/default-setup/dev-build.mjs exists, BUILD_UNITS is exported
from @abuddy/host/build/packages-built, PACK_OUTPUTS is in scripts/lib/chain-steps.ts, and four
package.json files declare esbuild ^0.25.0 (abuddy-sdk, abuddy-cli, api, default-setup). If any is
false, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — a standing rule,
not this goal's choice): change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward. Stored user data is the exception: it moves with
migrations.

Phase 0 runs in a git worktree and installs a different esbuild version there. That is required; do not
skip it, and do not run it in the main checkout.

Finished when:
- Phases 0–2 are implemented and each meets its "Done when"; every new guard is mutation-checked.
- Phase 0's four-run control and four-run candidate hashes are recorded in this doc, and its verdict
  chose Phase 2a or Phase 2b.
- `npm run repro:check` exists, derives what it compares from BUILD_UNITS and PACK_OUTPUTS, fails when
  a file differs between two builds of one input, and names that file.
- Whatever Phase 0 chose is done: the esbuild range moved in all four manifests and the built outputs
  are reproducible (2a), or the irreproducible output is no longer a chain cache input and the doc
  records why that is sound (2b).
- npm run typecheck; npm run packages:build && npm run packages:check; npm run repro:check;
  npm run test:packaged-authoring; npm run chain once at the end.
- A final summary: phase → done/deferred, evidence, measured hashes, conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: another session works in this checkout and stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- the standing prohibitions in Constraints (git/publishing/real data/processes/preload/example pack/
  release metadata/typed EARS/shims/assertions), in full there.
- bump vite, tsup or tsx to move their vendored esbuild. They are a separate change with a different
  blast radius; this goal moves only the esbuild this repo declares.
- add `repro:check` to `npm run chain`. It is two full builds (Decision 5).
- edit a recorded hash by hand.
```

## Background (2026-09-28, at 93dae1a7e on master)

`docs/plans/pack-runtime-nondeterminism.md` records that `packages/default-setup/dist/runtime/index.cjs`
differs between builds of identical input. Three bytes, in whether esbuild emits its interop helper's
`isNodeMode` argument:

```
-     import_https = __toESM(require("https"));
+     import_https = __toESM(require("https"), 1);
```

Measured 2026-09-25: four runs, four distinct hashes. `dev-build.mjs` is the only producer — `abuddy build`
stops before `bundlePackRuntime` for a built-in pack. The plan ruled out codegen output, a missing tsconfig,
`packages: 'external'` and sourcemaps, three runs each, and found `bundlePackSource` (which builds every
other artifact in `dist`) deterministic.

**What it costs.** `PACK_OUTPUTS` (`scripts/lib/chain-steps.ts:254`) is `packages/default-setup/dist` and
`src/__generated__`. Every step declaring it goes stale once per `compile` and re-caches on the cycle after —
observed as a warm chain at 34.3s with 9 of 11 cached, then 26.1s with 10 of 11. Waste, bounded, and
invisible without the cache verifier.

**Three facts the plan doc does not carry, established 2026-09-28.**

*1. "Upgrade esbuild" is neither one bump nor as wide as it reads.* Four copies are installed at three
versions:

| copy | version | who moves it |
|---|---|---|
| `node_modules/esbuild` | 0.25.12 | **this repo** — `^0.25.0` in four manifests |
| `tsup/node_modules/esbuild` | 0.27.7 | tsup's |
| `tsx/node_modules/esbuild` | 0.27.7 | tsx's |
| `unplugin-vue/node_modules/esbuild` | 0.28.2 | unplugin-vue's |

The repo already runs 0.27.7 and 0.28.2 in some paths, unchosen. The plan doc lists "the FE bundle … and the
API through tsup" among what a bump touches; it does not. Vite declares `esbuild: ^0.25.0` and tsup vendors
0.27.7, and **for a 0.x version `^0.25.0` means `>=0.25.0 <0.26.0`** — so moving this repo's range to
`^0.28.0` de-dupes Vite off the shared copy onto its own 0.25.x rather than moving it.

What this repo's range does move is its direct importers: `packages/default-setup/dev-build.mjs` (the
measured offender), `packages/abuddy-sdk/src/build/compile-utils.ts` (what `bundlePackSource` is built on —
pack runtime, seed runtime, step build) and `scripts/bundle-package.ts` (the CLI's and `@abuddy/testing`'s
published bundles). Manifests: `abuddy-sdk`, `abuddy-cli`, `api`, `default-setup`.

*2. One artifact was measured; at least three families feed the chain's cache.* Beside `PACK_OUTPUTS` there
are `PACKAGE_BUILD_OUTPUTS` (derived from `BUILD_UNITS`, `scripts/lib/chain-steps.ts:224`) and `APP_OUTPUTS`.
The CLI and testing bundles come off the same esbuild this repo declares. Whether those are reproducible is
**unmeasured**.

*3. The remedy is a hypothesis, and falsifying it costs a minute.* The plan doc says "an upgrade is the
candidate". 0.28.2 is already on disk under `unplugin-vue`, and the reproduction is four builds and a
`shasum`. The 2026-09-25 measurement also predates two weeks of change, so the control matters as much as
the candidate.

**Prior art for the check.** `api:check`/`api:update`, `facade:check`/`facade:update`,
`schema:*`, `exports:*`, `seed-parity:*` are the `<artifact>:check` / `<artifact>:update` shape this repo
uses for something recorded that can go stale (root `CLAUDE.md`, "Commands"). `api:check` is deliberately
**not** a chain step, because `typecheck` runs a 0.6s proxy instead of its 55s; that is the precedent
Decision 5 follows.

## Decisions

Final.

1. **The goal is the property, not the remedy.** What ships is a repo that can tell you when a build output
   stops being reproducible. The esbuild bump is one candidate fix for one instance of it, and it is Phase 2a
   rather than the point. This ordering is what makes the work pay off under either Phase 0 outcome: if the
   bump works we need the check anyway, since bundlers here move without us (Background 1); if it does not,
   the check is what makes the fallback honest rather than an unwatched assumption.

2. **Phase 0 falsifies before anything is built on it**, with a control as well as a candidate. A remedy
   planned around an unverified hypothesis, against a measurement two weeks stale, is how a goal delivers
   nothing.

3. **Phase 0 runs in a git worktree.** It installs a different dependency version, and another session works
   in this checkout daily.

4. **The check derives what it compares** from `BUILD_UNITS` and `PACK_OUTPUTS`, and asserts the derived
   population is non-empty. A hand-written list of output paths is a guess about someone else's outputs, and
   a check that walks nothing passes over nothing — this repo has shipped both.

5. **`repro:check` is not a chain step.** Two full builds against a 27s warm chain is not a trade this repo
   makes, and `api:check` is the precedent. It runs before a release and when a bundler moves.

6. **This goal does not move vite, tsup or tsx.** They vendor their own esbuild. Conflating "bump what we
   declare" with "bump every esbuild in the tree" is what made this look like it needed a wide, risky change.

7. **If Phase 0 falsifies the remedy, Phase 2b is the fallback the plan doc names** — the steps reading the
   irreproducible output key on the pack's sources instead. It is a weaker claim, sound only while nothing
   else can change that output, and it ships only with Phase 1 in place to watch it.

## Phases

### Phase 0 — falsify the remedy

- In a git worktree off the base (Decision 3), run the plan doc's reproduction **four times unchanged** as a
  control, recording each hash.
- Then set the four manifests' esbuild to `^0.28.0`, `npm install` in the worktree, and run it four times
  again.
- Record both sets in this doc under `## Spike results (2026-09-28)`, with the machine and whether anything
  else was running.
- Reproduction (about a minute), from the worktree root:

```bash
for i in 1 2 3 4; do
  node --import tsx --conditions=@abuddy/source packages/default-setup/dev-build.mjs >/dev/null 2>&1
  shasum -a 256 packages/default-setup/dist/runtime/index.cjs | cut -c1-12
done
```

**Done when:** both hash sets are recorded in this doc, and the verdict names Phase 2a or Phase 2b. Four
identical control hashes means the symptom no longer reproduces: record that, do Phase 1 only, and mark
Phase 2 deferred with the evidence.

### Phase 1 — `repro:check`, whatever Phase 0 found

- A script in the `<artifact>:check` shape: build twice into separate trees, compare, report every path whose
  bytes differ. `repro:update` is the half that records nothing today — if the check needs no recorded
  artifact, give it the trivial half or leave the pair at one and say why in the script's header, per root
  `CLAUDE.md`'s note that an artifact with only an update is one nothing notices has gone stale.
- Population derived from `BUILD_UNITS` outputs and `PACK_OUTPUTS` (Decision 4), asserted non-empty.
- Its first real run is also the measurement Background 2 says is missing: record in the Outcome which of the
  built outputs are actually irreproducible, not just the one hashed by hand.

**Done when:** `npm run repro:check` passes on a clean tree; its population is derived and asserted
non-empty. **Mutation:** perturbing one byte of one built file between the two builds fails the check and
names that path; emptying the derived population fails by name rather than passing.

### Phase 2a — move the esbuild this repo declares (if Phase 0 says it fixes it)

- `^0.25.0` → `^0.28.0` in `packages/abuddy-sdk`, `packages/abuddy-cli`, `packages/api`,
  `packages/default-setup`; `npm install`.
- Read esbuild's 0.26, 0.27 and 0.28 breaking-change notes and record in the Outcome which applied.
- Expect Vite to drop onto its own 0.25.x copy (Background 1). Note it in the Outcome: an unexplained
  `node_modules` change costs a later reader an afternoon.

**Done when:** `npm run repro:check` green; `npm run packages:build && npm run packages:check`;
`npm run test:packaged-authoring`; `npm run chain`. And the original symptom is gone — `npm run chain` twice
after a `compile` does not re-run the tier-3 steps `PACK_OUTPUTS` feeds.

### Phase 2b — stop caching on the irreproducible output (if Phase 0 says it does not)

- The steps reading the offending path key on the pack's sources instead (Decision 7).
- Record in the doc why that is sound *and* what would make it unsound, since it is a weaker claim than
  reproducibility.

**Done when:** `npm run chain` twice after a `compile` does not re-run those steps; `repro:check` still
reports the file, so the weaker claim stays visible rather than silently accepted.

## Constraints

- Commit each phase as it finishes, no attribution lines, `git diff --cached` first; pushing, tagging and PRs
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
- Another session commits in this checkout continuously. Re-read `git status` and `git log` before each
  phase's commit.
