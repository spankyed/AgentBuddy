> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-24). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: a test knows what it needs, so the pipeline can act on it

Implement docs/goals/goal-test-tiers.md on AS/test-pipeline, at or after 0f2d7f04a.
Phases 1 to 3 are done there. **Not master:** the 23 commits that carry them were moved off it on
2026-09-24, so a branch cut from master has none of this and nothing below will make sense.
Before Phase 4, confirm the base: scripts/lib/chain-steps.ts exports CHAIN_STEPS and orderedSteps, every
step carries a `tier` and `needs`, `npm run check:tiers` passes, and tests/scripts/ holds
test-external-pack-contract.sh beside test-external-pack-app.sh. If they don't, stop and say so — those are
this plan's first three phases and the rest builds on them.
Expect `ChainStep` to carry `name`, `tier`, `needs`, `cache?` and `seconds?`, and no step to declare
`inputs` (`grep -c inputs scripts/lib/chain-steps.ts` is 0). That is the known state, not drift: Phase 3
shipped three of the five fields Decision 12 names, so **Phase 4 begins by finishing that table.** If
`inputs` is already there, Phase 4's first half is done and its guard is the whole phase.
Four things landed after Phase 3 that Phases 4 and 5 build on: read *What landed after Phase 3* in
Background before planning either.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 4–9 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked. Phases 1–3 are done (`06f55ea72`, `b1c0b3cc4`, `8095daf14`); Phase 2's
  packaged-authoring half is recorded as impossible until Phase 7 rather than skipped.
- Every check in the chain declares its tier, and no tier-1 or tier-2 check launches Electron.
- `npm run chain` runs tier 1 and tier 2 before `build`, and tier 3 after it.
- Every step declares `needs` and `inputs`; a cycle or unknown dependency fails before any step runs; a spec
  fails when a tracked source file is an input to no step.
- A warm chain re-runs only what changed, and only E2E always runs (`cache: false`).
- npm run chain --all passes; npm run typecheck; npm run test:unit.
- Measured before and after, in the doc: the chain's wall time, and each tier's.
- No suite sets a timeout above its tier's budget, retries exist only in tier 3, and no test drives an
  interactive prompt.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A phase
  is landable on its own only while it is finishing. Conventional message, no Co-Authored-By or session
  lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files.

Never:
- Constraints' standing rules are hard stops, not advice: no push/tag/PR, no publish or release, no real
  data dir, no broad pkill, no app outside the test env without an isolated ABUDDY_USER_DATA_DIR, no bare
  tsc on preload, no version metadata, and no change to the typed EARS types to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- delete a test to make a tier boundary hold. A test that needs the app is tier 3; that is an answer,
  not a failure.
- give the chain's steps unbounded parallel lanes. Measured twice: total work 348s to 567s and
  @abuddy/cli failing, because every step already uses the cores. Phase 6 is a *limited* lane count.
  `test:unit`'s own two lanes are a different thing and already landed.
```

# Goal: a test knows what it needs, so the pipeline can act on it

Nothing in this repo records what a test depends on. Every attempt to make the pre-merge chain cheaper
has failed on the same discovery, four times in one session: the expensive checks each end by launching
the app, so each one transitively depends on nearly the whole repo, and nothing can be skipped, reordered
or cached. This goal gives every check a declared tier, separates the checks that need a built app from
the ones that don't, and then makes the chain a graph that caches on those declarations.

**This absorbs [`goal-pipeline-graph.md`](../archive/goals/goal-pipeline-graph.md)** (session
`00e10b0f-0852-4401-8b3c-7df01734a7eb`), which planned the graph and the caching while this one planned the
tiers. They are one goal: caching by fingerprint — which that plan insists on, refusing heuristic skips —
cannot pay while a step's honest input set is the whole repo, and only the tier split makes it narrow. Its
decisions and phases are below, renumbered; its measurements are in Background.

## Background (2026-09-24, at 7eb5aa1e5 on master)

`npm run chain` (`scripts/chain.ts`) runs eight steps serially, 354s measured:

| Step | Time |
|---|---|
| `packages:ensure` | 0.3s |
| `compile` | 11.9s |
| `typecheck` | 55.8s |
| `test:unit` | 100.9s |
| `build` | 41.3s |
| `test:external-pack` | 39.4s |
| `npm test` (E2E) | 26.2s |
| `test:packaged-authoring` | 57s (was 78s before `7eb5aa1e5`) |

### Measured, before and after the split

`npm run chain` reports per-tier totals. The split moved work out of the app tier without changing the total,
which is the expected shape: tier 2 can be cached and does not wait on `build`, so the saving arrives with
Phase 5, not with the split.

| | total | tier 1 | tier 2 | tier 3 |
|---|---|---|---|---|
| welded (`a398f9813`) | 340.4s | 160.3s | 11.5s | 168.5s |
| split (`b1c0b3cc4`) | 352.0s | 154.6s | **43.1s** | **154.1s** |

Before that, `api:check` leaving the chain and `test:packaged-authoring` ensuring rather than rebuilding took
it from 6m53s to 5m50s (`0f0e57a15`, `7eb5aa1e5`). After it, `.tsbuildinfo` per project took `typecheck` from
55s to 30s warm (`047c4e813`), so tier 1 is about 130s and the chain about 300s warm. Re-measure before Phase
5: these are the numbers its caching is judged against.

### One step, five concerns

`tests/scripts/test-external-pack.sh` loops over two fixture packs doing five different things:

| | Step | What it needs |
|---|---|---|
| 1 | `abuddy validate` | `@abuddy/cli`, `@abuddy/sdk` |
| 2 | `abuddy build` | those, plus default-setup's snapshot (the fixture depends on it) |
| 3 | `tsc --noEmit -p` | the CLI's generated output, `@abuddy/sdk`'s `dist` |
| 4 | `vitest run --root` | `@abuddy/sdk`, `@abuddy/host`, `@abuddy/testing` |
| 5 | `abuddy test --app-root "$ROOT"` | **the whole built app** — renderer, main, preload, api, default-setup |

Steps 1–4 need no app. Step 5 does, and because they share a script the whole step depends on the app.
`tests/scripts/test-packaged-authoring.sh` has the same shape: packing, installing, authoring, building
and typechecking a pack outside the monorepo, then `abuddy test` against this checkout.

`abuddy test` is Playwright only (`abuddy-cli/src/commands/test.ts:63` requires `playwright.config.ts`),
so a pack author asking "did my seeds compile correctly" has no way to find out without Electron.

### The tiering already half-exists

The fixtures are already split by kind, and the split is not honoured:

- `tests/fixtures/external-pack/tests/unit/` — ten specs over the in-memory harness (`startShell`), no
  Electron
- `tests/fixtures/external-pack/tests/e2e/` — four Playwright specs
- `tests/fixtures/bundled-ui-pack/tests/e2e/` — one

The repo's own tests are split the same way (`test:unit` against `npm test`), and the pack-facing scripts
run both halves in one step.

### What that cost, measured

Four attempts at a cheaper chain, each defeated by the same coupling:

| Attempt | Result |
|---|---|
| Run the steps in three lanes | Failed. `test:packaged-authoring` ran `packages:build`, rewriting `dist/` under the other lanes |
| Run them in lanes with that step alone | Failed. Work 348s → 567s, `@abuddy/cli` 56s → 118s: every step already uses all the cores |
| Drop `compile` as redundant with `build` | Wrong. No workspace declares a dependency on `@app/default-setup`, so `build -ws` gives no ordering guarantee, and the renderer's build reads the pack entry `compile` writes |
| One `vitest run` over eight projects | 105s against 100.9s, no gain — the suites report 99.6s of 104s wall, so startup was never the cost — and it broke `@app/api`'s `boot-recovery.spec.ts`, which spawns the API server and needs the `@abuddy/source` condition the package's own run supplies. The root `vitest.config.ts`'s four projects stay, for `npm run spec`'s cross-package selection |
| Per-step input caching | Not viable. Every expensive step reads the built app, so its honest input set is the whole repo |

Only the coarse gate survived: the chain skips itself when no tracked file under `packages/`, `scripts/`
or `tests/` has changed (of the 20 commits before this, three touched none).

### What is cheap, and already built

- `fingerprintInputs(paths)`, `unitStaleReason`, `stampFile`, `STAMP_VERSION`, `withBuildLock` —
  `@abuddy/host/build/packages-built`. A content-addressed task cache, used today for five package builds
  and nothing else. 1972 tracked files fingerprint in 160ms.
- `ensurePackagesBuilt()` returns before taking the build lock when nothing is stale, and
  `ABUDDY_PACKAGES_PREBUILT=1` makes staleness an error rather than a racing rebuild (`b76190721`).
- **A `.tsbuildinfo` per typecheck project** (`047c4e813`): `typecheck` is 30s warm against 55s before, at no
  cold cost. Not project references — `composite` may not be combined with `noEmit`, and all twelve projects
  typecheck without emitting, while `incremental` needs neither. One trap worth keeping: `api`'s
  `tsconfig.test.json` and `tsconfig.scripts.json` `extend` its `tsconfig.json`, so they inherited its
  `tsBuildInfoFile` and all three passes overwrote one file, leaving none of them warm — a cache that quietly
  does nothing. This is the shape Phase 5 generalises: a step that can say what it read can be skipped when
  none of it moved.

### What landed after Phase 3

Four changes made between Phase 3 and now that Phases 4 and 5 build on. None was part of this plan; they
came out of `goal-test-cleanup.md` and the review after it.

- **`ChainStep` has a fifth field, `seconds`** — what the step costs when healthy, measured. It is not one
  of Decision 12's five: `inputs`, `outputs` and `exclusive` are still missing and Phase 4 adds them.
  `scripts/lib/bounded-spawn.ts` turns `seconds` into a wall-clock budget and kills the step's process
  group on an overrun, so a wedged step now fails instead of hanging the chain. Phase 4's `inputs` sit
  beside it on the same row.
- **`check:tiers` follows `-w` / `--workspace`** into a workspace's own scripts. Before, a step that
  delegated to one was inspected as nothing at all and passed vacuously.
- **There is a tenth step, `test:integration`** (tier 2, needs `packages:ensure`): the `@abuddy/cli` specs
  that run a real build, install or process, split out so the fast half stays seconds. It needs `inputs`
  like every other step.
- **`BuildUnit` is exported.** Phase 5 said it was not and that this blocked `fingerprintUnit`/`stampedBuild`
  being called from `scripts/chain.ts`. The API-report work exported it, so that note is stale and there is
  nothing to do.

### What Phase 5 measured

Per-step caching goes through the package builds' stamp protocol rather than a second one: `fingerprintUnit`
over `ChainStep.inputs`, `unitStaleReason` to decide, `stampedRun` to record. `stampedRun` is the lock-free
half of `stampedBuild`, extracted because a chain step must not queue behind the package build lock — that
would serialise Phase 6's lanes on a lock none of them needs.

**There is no cascade rule, and there does not need to be one.** A step that produces something declares it
in `outputs` and its readers declare those same paths in `inputs`, so a rebuild that changed the output moves
their fingerprints, and one that produced identical bytes leaves them fresh. "A needed step ran, so re-run"
would get that second case wrong. It depends on one thing: a step's verdict is computed at its turn in the
loop, not for every step up front, which `scripts/chain.ts` says at the point where it matters.

`test:unit` is eight steps, one per package. Each declares its own workspace plus its dependencies' source,
read from that package's `package.json`, so a dependency added later is covered the moment it is declared.
Five of the eight declare no build output and so need no step at all: they resolve workspace source through
the `@abuddy/source` condition. That is what lets them start beside the builds in Phase 6.

Staleness is a pure function of the tree, so `npm run chain --dry` answers most of the "Done when" without
running anything — which is how they were checked, on a machine another checkout was loading:

| Edit | Steps that go stale |
|---|---|
| a doc, a CLAUDE.md | **none** |
| `packages/renderer/src` | `typecheck`, `test:unit:renderer`, `test:unit:main` (main depends on renderer) |
| `packages/default-setup/src` | `compile`, `typecheck`, `test:unit:default-setup` |
| `packages/abuddy-ears/src` | `packages:ensure`, `typecheck`, and all eight suites |
| `packages/abuddy-cli/tests` | `typecheck`, `test:unit:abuddy-cli` |
| `tests/e2e` | `typecheck` alone; the E2E step is never cached |

`@abuddy/ears` invalidating all eight is honest rather than a bug: every package imports the bottom layer.

#### The split makes a *serial* cold chain slower, and Phase 6 is what pays it back

This is the one place Phase 5's bullets pull against each other, so it is recorded rather than smoothed over.
"Split `test:unit` per package" and "a cold run matches Phase 3's time" cannot both hold while the chain is
serial: the single step ran the eight suites two at a time (43.7s wall, measured idle), and eight separate
steps run them one at a time (69.8s, the one-lane control already in `scripts/test-unit.ts`). So a cold
serial chain pays about **+26s** for the split.

That is the right trade anyway, and it is bought back twice: the granularity is what makes a one-package edit
re-run one suite instead of eight, and Phase 6 gives the eight steps the lanes the single step had. The
number to beat in Phase 6 is 43.7s for tier 1's suites — not the 100.7s a serial cold run of them costs.

#### Measured, on an idle machine

| Run | Wall | Cached |
|---|---|---|
| cold, serial | 311.3s | 0 of 17 |
| warm, straight after | 268.4s | 7 of 17 |
| cold, after the `build:app` fix below | 306.9s | 0 of 17 |
| warm, after it | **58.4s** | **15 of 17** |

Cold: `packages:ensure` 0.3s, `compile` 11.8s, `test:external-pack:contract` 18.2s, `typecheck` 31.4s, the
eight suites 88.0s, `test:integration` 45.2s, `build:app` 25.2s, `test:external-pack:app` 19.6s, E2E 25.5s,
`test:packaged-authoring` 59.8s.

In the warm run only `test` ran by design; `typecheck` ran because that cycle edited `scripts/`, which is
the cache working rather than failing.

#### The first warm run cached 7 of 17, and the cause was not the cache

`build` was root `npm run build`, which is `-ws` and so includes `@app/default-setup`, whose own `build`
script is the exact command `compile` runs. So `build` rebuilt the pack on every chain run and rewrote
`packages/default-setup/dist` — a tree it declares as an input. It invalidated **itself**, and the five
steps that read that tree: `test:external-pack:contract`, three unit suites and `test:integration`.

Two consecutive `abuddy build` runs differ in exactly two lines, both the order of union members in an
emitted `Omit<…, "a" | "b">`, so chasing byte-determinism in TypeScript's declaration emit was the fragile
path. The duplication was the real defect — about 12s of wasted work per build, invisible until something
depended on the output not changing.

The chain now runs `build:app`, which builds the five workspaces it needs and leaves the pack to `compile`,
a declared `need`. `npm run build` still builds everything, for CI and `build/build.sh`. A spec derives the
workspace set from the manifests, so a workspace that gains a `build` script cannot be silently skipped.

**What this says about checking a cache.** Three of Phase 5's four clauses are fingerprint comparisons and
`npm run chain --dry` answers them without running anything. The fourth is not: "a second run re-runs only
E2E" is a claim about what the steps *write*, which no amount of reading the inputs can answer. It was
checked with `--dry`, passed, and was wrong. A cache is only as good as the claim that steps do not write
outside their declared outputs, and that claim needs a real run.

### What Phase 6 measured

Cold, on an idle machine, 2026-09-25:

| Lanes | Wall | Step time | Cold runs |
|---|---|---|---|
| 1 (serial) | 306.9s | 306.9s | passed |
| **2** | **194.0s, 198.7s, 196.5s** | 339.5s (+11%) | passed, 17 of 17 each |
| 3 | 202.7s | 477s (+55%) | one of two **failed** |

Two lanes is a 36% cut and is the default; three is slower than two on wall *and* work, and does not
reproduce. The critical path is 109s (`packages:ensure -> compile -> build:app -> test:packaged-authoring`)
and is reported in the summary, so a disappointing run is legible rather than a tuning mystery.

**Why this paid where the earlier attempt did not.** That attempt measured work going 348s to 567s with
`@abuddy/cli` reporting errors it does not report alone. The limit is not the only difference:
`test:packaged-authoring` no longer rebuilds the published packages underneath the other steps, `build:app`
no longer rebuilds the pack, and `test:unit` is eight small steps rather than one large one, so a lane can
be filled with a 1s suite instead of a 43s block. Three lanes reproduces the old result almost exactly, at
+55% work, which is the evidence that the limit is load-bearing.

**Three lanes fails the way the earlier measurement predicted.** The failing run timed out in
`findLmdbImports > holds for the repo` at 5220ms against vitest's 5s default — a whole-repo scan that takes
~2s alone. That is the thin-margin class already recorded in `scripts/test-unit.ts`, where raising one
suite's timeout moved the failure to another suite. Note for
[`test-unit-scheduling.md`](../plans/test-unit-scheduling.md): this is a *second* such file, so amortising
`generate-entries.spec.ts` will not by itself lift the lane cap.

**Parallelism found a bug serial execution structurally could not.** `@app/api`'s suite reads the built-in
pack's `dist` — host code resolves the path while booting the app runtime — and declared that it read
nothing. It had passed forever because `compile` always happened to finish first. Given a lane it ran beside
`compile` and failed on a missing `settings.seed.json` in 16 seconds. The fix is in `SUITE_READS`, along with
the only method that answers the question: run each suite with the tree moved aside.

**Two of the guards written for these phases could not fail, and both were found by mutation rather than by
review.** One asserted that a suite declaring `pack: true` also needs `compile` — but `needs` is derived from
that same table, so the two cannot disagree. The other claimed to prove the scheduler stops dispatching
after a failure, while every step in its fixture *needed* the failed one and so was never ready; deleting the
guard it tested kept it green. The first was deleted with a comment saying why, the second rewritten around
a step that depends on nothing. A mutation check is the only thing that distinguishes these from real tests.

The scheduler itself lives in `scripts/lib/chain-schedule.ts` rather than in `scripts/chain.ts`, for the
reason `chain-steps.ts` is already separate: that module runs the chain when imported, so nothing in it can
be tested. A scheduler can leak a lane, run an exclusive step beside another, keep going after a failure or
simply never return, and a green timing run shows none of it.

### What Phase 7 landed

`abuddy test --contract` runs the pack's vitest and starts no app, so a pack author can check compiled
output, generated types and the harness specs without an AgentBuddy to run them in. It is the tier split
this repo makes for itself, offered to packs rather than kept here.
`tests/scripts/test-external-pack-contract.sh` calls it instead of invoking `vitest` by path, so the fixtures
exercise the command a pack author actually runs; a pack with no vitest config is a no-op with a message
rather than an error, which is why the bundled-UI fixture needs no special case in that script.
`abuddy init-tests` scaffolds both halves, having previously scaffolded only Playwright — which left an
author with a `vitest.config.ts` only if they had run `abuddy init` or `abuddy add feature`.

**One deviation from the "Done when", and it is forced.** That clause asks for `npm test -w @abuddy/cli` —
the fast half — to cover the flag. No spec of this flag can live there: `suite-split.spec.ts` asks whether an
export's implementation reaches a child process, and `contractTest`'s default runner is `spawnSync`. That is
true of the export and false of all nine tests, which inject a recorder and run in ~20ms. The coverage is in
`@abuddy/cli`'s suite, in the integration half, rather than weakening a guard to suit one spec.
`docs/plans/test-unit-scheduling.md` records this as a third instance of that predicate being mechanism-based
rather than cost-based.

Wiring the two scaffolders together surfaced a pre-existing inconsistency worth knowing about: `init-tests`
derives `@abuddy/testing`'s range from `cliVersion()` while `scaffoldUnitTestSetup` checks it against the
pack's `@abuddy/sdk` range, so in this checkout it adds `^0.1.0` and immediately reports it as too old for
`@abuddy/sdk ^0.3.14`. Left alone here: those are version ranges, which the release process owns.

### What Phase 8 landed

**Timeouts are a ceiling checked per tier, not a constant packages import.** `TIER_TIMEOUT_MS` sits with the
tier table (tier 1 15s, tiers 2 and 3 60s) and `suite-timeouts.spec.ts` fails a config that declares more
than its step's tier allows. The configs keep plain literals on purpose: a vitest config importing a
constant across package layers is what `check:specifiers` exists to prevent, and a guard needs no import.
The two `testTimeout: 120_000` are gone — measured first, the slowest single test in those suites was 2.9s
(`@app/default-setup`) and 0.7s (`@app/api`), so 15s is five times the headroom either needs.
**Mutation:** a test made to hang now fails at 15008ms saying "Test timed out in 15000ms", not at two minutes.

**Two bullets were already done** by work that landed between the plan being written and this phase: every
shell-script step runs under `tsx scripts/bounded.ts <seconds>`, and `bounded-spawn.ts` kills the whole
process group (`detached: true`, `kill(-pid)`, then SIGKILL after a grace period). The plan's "nothing has
one" and "nothing uses `kill 0`, `setsid` or `set -m`" no longer describe the repo.

**`test-packaged-authoring.sh` no longer drives a prompt.** The `expect` block, the tty and `env -u CI` are
gone; the script writes the saved app choice directly, and the prompt is covered in `@abuddy/cli`'s fast
suite (`app-target.spec.ts`), which already injected a `prompt` and a temp config dir. The shape the script
writes is pinned by a spec there, so a hand-written literal in a shell script cannot drift from what
`saveAppChoice` produces. This is the item that hung a machine: `expect`'s `set timeout` covers a pattern
match, not `wait`, so `lassign [wait]` blocked forever when `abuddy test --list` started a Playwright server
that never returned.

**The slowest five tests per suite come from output the chain already buffers.** Vitest's default reporter
prints any test past its 300ms threshold indented under its file, so `slowestTests` reads that back rather
than adding a reporter, a JSON file or a flag — which also means it survives `test:unit` becoming one root
vitest run. It lives in `scripts/lib/` because `scripts/chain.ts` runs the chain on import and so cannot be
imported by a spec, the same reason the step table and the scheduler are already out there.

**The npm cache is declared where it is used**, as this script's one non-hermetic input, with what it buys
(no multi-minute cold download, no failure that means only that the network was down) and what it costs (a
corrupt entry fails here and nowhere else, and `npm cache verify` is the first thing to try).

**Phase 7 broke Phase 1's guard, and the guard caught it.** `check:tiers` reads a step's scripts as text, so
`test-external-pack-contract.sh` calling `"$ABUDDY" test --contract` read as launching the app. The marker
now carries a negative lookahead for that one spelling — narrow deliberately, so `abuddy test` anywhere else
still reads as a launch — and dropping `--contract` from that script fails the check again by name.

**One thing was investigated and left alone.** The `[vitest-worker]: Timeout calling "onTaskUpdate"` failures
that broke three chain runs are already mitigated where they belong: `vitest.integration.config.ts` caps
workers at 50% and explains why. Those runs failed anyway because the contention came from a second checkout
building on the same machine at load 44-84, which no config in this repo can fix. Nothing to change, which is
worth recording so it is not "fixed" a second time.

### Industry practices this repo does not follow

Each of these was found in this survey, not taken from a list.

- **Nothing owns concurrency.** Eight suites each start their own scheduler and each claims every core, so
  the chain has eight independent opinions about parallelism and no budget. That is why running the steps
  in lanes made total work rise from 348s to 567s and `@abuddy/cli` fail. A build system has one job pool;
  this has N.
- **No test target declares its inputs**, so nothing can compute what a change affects. Bazel, Nx and
  Turborepo all start here, and this goal's Decision 1 is the same idea at the granularity the repo can
  reach today.
- **Timeouts are not sized to the tier.** `packages/api` and `packages/default-setup` both set
  `testTimeout: 120_000`. A unit test allowed two minutes means a hang is indistinguishable from slowness —
  and under load that is exactly how `@abuddy/cli` presented, as errors rather than a fast, clear failure.
- **There is no flake policy.** `playwright.config.ts` sets `retries: 0` and vitest sets none, while the CLI
  suite demonstrably fails under CPU pressure. The answer is not blanket retries: retrying a unit test hides
  a bug, and retrying an app E2E is ordinary. The distinction needs the tiers to exist first.
- **A test drives an interactive prompt.** `tests/scripts/test-packaged-authoring.sh:91` runs
  `env -u CI ... expect` to *unset* `CI` so the CLI will prompt, then answers "Choose 1 or 2: " with
  `send "1\r"`. The app choice should be injectable, with the prompt itself covered by a unit test of the
  prompt.
- **Per-test cost is invisible.** `@abuddy/cli` reports `tests 249s` inside a 56s wall; which tests those
  are is unknown. Every mainstream runner reports slowest-N, and it is how the 20% that costs 80% gets found.
- **One external input is not hermetic.** The same script reuses the developer's real npm cache
  (`npm_config_cache="$(npm config get cache)"`) so installs do not re-download. Pragmatic, and worth
  keeping, but it means a corrupted local cache changes a verdict; it should be a declared exception rather
  than an unremarked one.

## Decisions

Final.

**1. Three tiers, and a check declares which it is.**

| Tier | May read | May not | Examples |
|---|---|---|---|
| **1 pure** | its own package's source, the in-memory runtime, fakes | any build output, any app | most of the 3036 unit tests |
| **2 contract** | the built `@abuddy` packages, a pack's build output | the built app; Electron | `abuddy validate/build`, a pack's `tsc`, fixture unit specs, the CLI suite |
| **3 app** | the built app | — | the repo's E2E, `abuddy test` |

The tier is a property of the check, not of the package: one package may own checks in two tiers.

**2. The chain orders by tier, not by habit.** Tier 1 and tier 2 run before `build`, tier 3 after it.
`build` exists to serve tier 3, and today two tier-2 concerns wait on it for no reason.

**3. A tier-2 check may not depend on the app, and a guard says so.** A spec reads each tier-2 check's
declared inputs and fails if one names `packages/renderer`, `packages/main`, `packages/preload` or a built
app path. This is the invariant that keeps the tiers from collapsing again, and it is the one thing that
would have caught the coupling this goal exists to remove.

**4. Splitting the scripts is the work; deleting coverage is not.** `test-external-pack.sh` becomes two
entry points over the same fixtures — the contract half and the app half. Every assertion that exists today
still runs. A check that genuinely needs the app is tier 3 and stays there.

**5. Tier 2 gets per-check caching, tier 3 does not.** Once tier 2's inputs exclude the app they are narrow
and honest, so `fingerprintInputs` over them is worth a stamp. Tier 3 reads the built app, whose inputs are
the repo; the coarse gate already covers the only sound skip for it.

**6. One thing owns concurrency, and a suite takes a budget.** The chain decides how much of the machine
is in use; a suite does not assume all of it. Until a suite can be given a worker budget, the chain runs
them one at a time — which is what it does now, for the measured reason.

**7. Timeouts are per tier, not per package.** Tier 1 in seconds, tier 2 in tens of seconds, tier 3 up to a
minute. `testTimeout: 120_000` on a unit suite turns a hang into a slow pass, which is how a load-induced
stall reached the summary as two unexplained errors.

**8. Retries belong to tier 3 only.** An app E2E may retry; a unit or contract test may not, because there
the flake is the finding. A quarantine list is written down, with the date and the reason, or it is not
quarantined.

**9. `abuddy test` gains a way to run a pack's tier-2 checks without Electron.** A pack author testing
compiled seeds should not need a browser. The CLI already runs `vitest` for the fixtures from a shell
script; that belongs in the command.

### Absorbed from the pipeline-graph plan

**10. No third-party task runner.** Not nx, turborepo or wireit. They would replace `fingerprintUnit`,
`stampedBuild` and `STAMP_VERSION` — a mechanism this repo has reasoned about more carefully than they do,
including a `normalise` hook they have no equivalent for — and bring a config language, and for nx a daemon,
for a nine-step pipeline on one machine with one contributor. The gap is one field, not a tool.

**11. Cache before parallelism.** Parallelism was measured twice in this repo and made things worse: total
work rose from 348s to 567s and `@abuddy/cli` began failing, because every step already uses all the cores.
Caching makes the *second* run cost only what changed. So the order is split → graph → coverage guard →
cache → parallelism, and parallelism lands last because by then it matters least.

**12. The graph is data in one table**, `scripts/lib/chain-steps.ts`, extending the `ChainStep` that already
carries `tier`:

```ts
interface ChainStep {
  name: string;
  tier: Tier;                    // what it may read — the precondition for inputs being narrow
  needs: readonly string[];      // the edges
  inputs: readonly string[];     // cache key, the same shape as BuildUnit
  outputs?: readonly string[];   // so a downstream step's inputs can name them
  cache?: false;                 // a step whose pass is not reproducible
  exclusive?: true;              // needs the build lock
}
```

One table, not two: the tier says what a step *may* read and the inputs say what it *does*, and they belong
on the same row so they cannot disagree. It reuses `BuildUnit`'s shape and `fingerprintUnit`'s key
deliberately — one fingerprint protocol in the repo, one `STAMP_VERSION` to bump.

**13. A cycle or an unknown dependency fails before any step runs.** Validation is part of loading the table,
alongside `check:tiers`, not something the first run discovers.

**14. A step with no outputs caches its pass.** `typecheck` and the test steps produce nothing; what is
cached is that this input set passed. That is where most of the saving is.

**15. The E2E step is never cached** (`cache: false`, with the reason beside it). It drives real Electron with
real timing and is the likeliest step to be flaky, and a flaky pass cached green hides an intermittent failure
indefinitely. 26s is cheap enough to always pay. One documented exception beats a cache that is subtly
untrustworthy.

**16. Skipping is by fingerprint only, never by heuristic.** No "the renderer didn't change, skip E2E".
A content hash matching is sound; a path looking unrelated is a guess, and with CI off the chain is the only
gate. This is also why Decisions 1–5 come first: a fingerprint over a step whose real input is the whole repo
is honest but useless.

**17. No remote cache.** One contributor, one machine.

**18. The run reports itself.** One line per step: name, tier, status (`ran` | `cached`), wall time, and a
total. On failure it names the failing step and the steps that did not run *because of it*. The per-step
timings this plan's own measurements had to recover from log mtimes are the argument.

## Phases

### Phase 1 — Name the tiers, and prove nothing in tier 2 needs the app

- Add the tier taxonomy to `docs/goals/README.md`'s neighbours — `tests/CLAUDE.md` if it exists, else the
  root `CLAUDE.md` beside "What to run after a change" — as Decision 1's table.
- Give `scripts/chain.ts` a `tier` per step, and print it in the summary. No reordering yet.
- Add the guard from Decision 3 over the tier-2 steps' declared inputs.

**Done when:** `npm run chain` prints each step's tier; the guard passes. **Mutation:** adding
`packages/renderer` to a tier-2 input set fails the guard.

### Phase 2 — Split the two welded scripts

- `tests/scripts/test-external-pack.sh` becomes `test-external-pack-contract.sh` (steps 1–4) and
  `test-external-pack-app.sh` (step 5), with npm scripts `test:external-pack:contract` and
  `:app`. `test:external-pack` stays as both, for anyone running it by hand.
- `tests/scripts/test-packaged-authoring.sh` **cannot be split, and a `--contract` mode was tried and
  reverted.** It stays tier 3 whole. Two things were learned by running it with `packages/renderer/dist` moved
  aside, neither of which is visible from reading it:

  1. The first-run prompt is not just there to point step 8 at an app. Step 3's `abuddy build` resolves the
     authored pack's dependency on default-setup *from the app the prompt configures* — the script runs outside
     the monorepo with no `ABUDDY_ROOT`, so there is nothing else to resolve it from. Gating the prompt failed
     with `default-setup: not found in the installed app`.
  2. The prompt itself needs a built app. It drives `abuddy test --list`, which starts a Playwright
     test-server; with no app that server never returns and the `expect` script hangs rather than failing.

  So every step from 3 onwards transitively needs the app, and a mode that skipped only 8 and 9 would still
  have been tier 3 — a branch in the script buying nothing. It is also a linear scenario (step 8 needs step 6's
  archive, step 9 reads the data step 8's app seeded), which is the second reason not to split it.

  What would make it splittable is giving the CLI a way to resolve a dependency from a checkout without the app
  — which is Phase 7's `--contract` by another route — so this is deferred to there rather than dropped.
- `test-external-pack.sh` is the one that splits cleanly, and is where the value is: its `validate`, `build`,
  `tsc` and `vitest` each assert something on their own and none of them feeds the Playwright step anything
  it could not rebuild.
- The chain runs the contract halves in tier 2 and the app halves in tier 3.

**Done when:** every assertion that ran before still runs; `npm run chain --all` passes; the contract
halves pass with the app **not** built (delete `packages/renderer/dist` and run them). That last check is
the point of the phase. **Mutation:** the contract half fails if its fixture's manifest is broken.

### Phase 3 — The graph as data, serial and uncached

- Extend `ChainStep` per Decision 12 with `needs`, `inputs`, `outputs`, `cache` and `exclusive`, and fill
  them for every step. `needs` matches today's order, so nothing moves yet.
- `scripts/chain.ts` loads and validates the table (Decision 13, beside `check:tiers`), orders it
  topologically, runs serially, and reports per Decision 18.
- `packages:ensure` becomes the graph's root rather than a line in a string.

**Done when:** `npm run chain` passes and its total matches the serial time within a few seconds; an
introduced cycle and an unknown `needs` name each fail before any step runs. **Mutation:** removing `build`
from the E2E step's `needs` reorders the run, which a spec on the computed order catches.

**Shipped partially** (`8095daf14`, checked 2026-09-25): `needs` and `cache` landed, `inputs`, `outputs` and
`exclusive` did not, and `orderedSteps`, the validation and the reporting are all there. Both halves of the
"Done when" pass over a three-field table, which is how the other two fields slipped: it asserted the
*behaviour* the fields were for — ordering, cycle detection, timing — and never that the fields existed. Worth
keeping in mind when writing the ones below; a phase that adds a field wants a check that reads the field.

### Phase 4 — Finish the table, then guard it

- Add the three fields Phase 3 left out — `inputs`, `outputs` and `exclusive` per Decision 12 — and fill
  `inputs` for all ten steps (nine when this was written; `test:integration` landed after). **This is the
  bulk of the phase.** Deriving ten honest input lists is the
  work; the guard below is a few lines over them.
- A spec asserting every tracked source file is an input to at least one step, resolved through the same
  walk `fingerprintInputs` uses, so an under-declared input is a failing test rather than a stale pass.
- Its doc comment says why per-step caching needs this where `BUILD_UNITS` did not.

This is the phase that makes caching safe, and it comes first for that reason: the risk of caching is a wrong
input list silently skipping a check, and with CI off there is no backstop. Which is also why the authoring
belongs here rather than folded into Phase 5 — an input list written in the same change that starts trusting
it has nothing checking it was right.

**Done when:** every step declares `inputs`; a step producing a build artifact declares `outputs`; the spec
passes over the filled table. **Mutation:** adding a source file no step names, and dropping a directory from
one step's `inputs`, each fail it. A table with a field missing fails to typecheck, so `inputs` is required
rather than optional — the point of Phase 3's slip.

### Phase 5 — Caching

- Fingerprint each step with `fingerprintUnit`, stamp with `stampedBuild`, report an unchanged step as
  `cached` and do not run it. Bump `STAMP_VERSION` once.
- Both take a `BuildUnit`, which **is** exported now (it was not when this was written): the API-report work
  needed it, since the freshness fixture had hand-copied its shape. Nothing to do here.
- `cache: false` on E2E (Decision 15).
- Split `test:unit` per package, since that is where 100s lives and a one-package change should not re-run
  eight suites. The tiers make this honest: each suite's inputs are its own package plus what it imports.

**Done when:** a cold run matches Phase 3's time; a second run immediately after re-runs only E2E; a doc-only
edit re-runs nothing; a one-package edit re-runs that package's suite and its descendants and no others. Cold
and warm times recorded. **Mutation:** touching one file under a step's declared inputs makes exactly that
step and its descendants run again.

### Phase 6 — Parallelism, with a limit

- Run ready steps concurrently up to a concurrency limit; `exclusive: true` takes the build lock.

**Read the measurements before writing this.** Unlimited three-lane parallelism was tried twice and made
things worse: total work 348s → 567s, `@abuddy/cli` 56s → 118s and reporting errors it does not report alone,
because every step already saturates the cores. A limit is the difference between this phase and that
attempt, and if a limited run is not measurably faster than Phase 5's warm time, the honest outcome is to
leave it serial and record that.

**Done when:** a cold run is measurably shorter than Phase 3's serial time with the critical path reported,
**or** the phase is closed with the measurement showing it is not. Two consecutive cold runs agree on which
steps passed.

### Phase 7 — `abuddy test` runs a pack's contract checks

- `abuddy test --contract` runs the pack's `vitest` where it has one and skips Playwright, so a pack author
  can check compiled output without Electron. `test-external-pack-contract.sh` uses it instead of calling
  `vitest` directly — still line 25 there, `"$ROOT/node_modules/.bin/vitest" run --root "$PACK"`, checked
  2026-09-25.
- `abuddy init-tests` scaffolds both halves.

**Done when:** `abuddy test --contract` passes in both fixtures with no app built; `npm test -w @abuddy/cli`
covers the flag.

### Phase 8 — The practices that are work, not policy

- Size the timeouts per Decision 7, tier by tier, and delete the two `testTimeout: 120_000` — still
  `packages/default-setup/vitest.config.ts:27` and `packages/api/vitest.config.ts:28`, checked 2026-09-25.
- Make the app choice injectable so `test-packaged-authoring.sh` stops unsetting `CI` to drive a prompt with
  `expect`; cover the prompt itself in `@abuddy/cli`'s suite. **This one hung a machine**, which is worth more
  than the tidiness argument: with the app missing, `abuddy test --list` started a Playwright test-server that
  never returned, and the script's `lassign [wait] …` blocks with no timeout — `expect`'s `set timeout` covers a
  pattern match, not `wait`. It took three PIDs killed by hand. No `spawn`, no `wait`, no hang.
- **Give every shell test script a total-runtime bound.** Nothing has one: the only timeouts under
  `tests/scripts/` are that script's two guarded `expect` patterns. A test that can hang cannot fail — vitest
  and Playwright each give a test a deadline, and a shell script that spawns a server has none. Note before
  reaching for the obvious: neither `timeout` nor `gtimeout` exists on this machine, so it wants
  `perl -e 'alarm'` or a watchdog.
- **Reap the process group on exit.** Nothing in `tests/scripts/` uses `kill 0`, `setsid` or `set -m`, so an
  orphaned server outlives its parent and a bound on the script alone would not have cleaned it up.
- Report slowest-N per suite, so the next person profiling `@abuddy/cli` has it without instrumenting.
- Record the npm-cache exception where the script uses it, as a declared non-hermetic input.

**Done when:** no suite sets a timeout above its tier's budget; `test-packaged-authoring.sh` contains no
`expect` and no `env -u CI`; the chain prints the slowest five tests per suite. **Mutation:** a test made to
hang fails at its tier budget rather than at two minutes.

### Phase 9 — Retire the per-change table's arithmetic

- Once a warm chain is seconds, the root `CLAUDE.md`'s "What to run after a change" table stops being
  instructions and becomes documentation of the graph. Rewrite it to say so: run `npm run chain`, which costs
  what you changed; keep `npm run spec` as the inner-loop tool.
- **Half of this already happened** without the caching that was meant to justify it: that table now opens on
  `npm run spec` and closes on `npm run chain`. So what is left is narrower than this phase reads — retiring
  the per-row arithmetic in between, which stays blocked on Phase 5 actually making a warm chain cheap.
- Keep the measured figures — they are what justify the design.

**Done when:** the table no longer asks the reader to work out which suite covers their change. Docs only.

## Deferred

- **The `@abuddy/cli` suite at 56s**, over half of `test:unit`. **Profiled, and there is no hot spot**: the
  slowest 25 tests are all 1–1.6s, spread across `facade-gate`, `scaffold`, `add-extensions`,
  `component-contracts`, `release` and `db`, and every one spawns a real `tsc`, `abuddy build` or node
  subprocess. So the lever is fewer subprocesses, which is a project rather than a fix:
  [`goal-cli-suite-spawns.md`](goal-cli-suite-spawns.md) has it, with the per-file totals and the finding that
  both levers — the TypeScript API in-process, and one shared fixture per `beforeAll` — already exist in that
  suite and are applied unevenly. Its 249s figure here was measured under contention; idle it is 182.6s. **It
  can run in a worktree alongside this goal** — the two share only `abuddy-cli/tests/build/`, and different
  files there. A symlinked `node_modules` is fine while neither checkout changes a build input, which
  `packages/*/tests` is not; that goal's "Doing this in a worktree" says when it stops being fine.
- **`test:packaged-authoring` at 65s**, mostly npm installs from packed tarballs. A warm `node_modules` cache
  is the lever, and the non-hermetic npm cache it already relies on is the precedent to be careful about.
- **Turning CI on.** Off deliberately for one contributor; the workflow header says when it returns. A cached
  graph is what would make CI cheap, but that is a separate decision — and while CI is off, this chain is the
  only gate, which is why Decisions 15 and 16 refuse to cache or skip on a guess.
- **Declaring `@app/default-setup` as a dependency of what builds against it**, which would let `build -ws`
  order it and retire `compile`. Blocked on the renderer discovering packs rather than importing one.
- **`@app/default-setup`'s per-file harness setup.** Not a pole, contrary to how it reads: `setupPackTests`
  runs in `setupFiles`, so it executes once per test file across 84 files at about 1.16s each, and the
  `setup 97.3s` a run reports is that sum across workers against a 15.4s wall. Halving it would save a few
  seconds of wall. Recorded so the number stops looking alarming.

## Constraints

The repo's standing rules (root `CLAUDE.md`) apply:

- commit each phase as it finishes, no attribution lines, `git diff --cached` first; pushing, tagging and
  PRs are on request;
- no publishing, releases or triggered workflows;
- no real data dirs, no broad pkill, E2E in the `abuddy-test` namespace;
- preload, example pack and release metadata rules;
- typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`);
- published packages: no `any`, the TypeScript floor, `api:update` after export changes with `etc/` committed;
- migrations follow `packages/abuddy-host/src/migrations/CLAUDE.md`;
- investigate failing tests, mutation-check new guards;
- external packs are first-class: the fixture packs, the example pack and `test:packaged-authoring` keep
  passing, and a pack author's path stays the one this repo tests;
- **measure before and after every phase.** Four proposals in the session that wrote this were rejected by
  one command each, and each had been argued for at length first.
- **Measure with nothing else running in this checkout, and check first.** Phases 4 to 6 are the measurement
  phases, and a contended run already produced 249s for what is 182.6s idle — a 36% error, larger than
  Phase 5 or 6 is likely to save. On 2026-09-25 a second session was editing six files here mid-change, which
  is normal in this repo and invisible unless you run `git status` before taking a number. **Phases 4 to 6 can
  run in a worktree**, which suits them better than the CLI-spawns goal: nothing in them touches
  `abuddy-cli/src`, and their subject — `scripts/`, the chain table and the guard spec — is touched by little
  else. Take the before and after from the same tree, whichever tree it is.
