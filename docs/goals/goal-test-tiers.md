> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-24). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: a test knows what it needs, so the pipeline can act on it

Implement docs/goals/goal-test-tiers.md on master, at or after 047c4e813 — Phases 1 to 3 are already done
there, and the Background was surveyed at 7eb5aa1e5, before them.
Before Phase 4, confirm the base: scripts/lib/chain-steps.ts exports CHAIN_STEPS and orderedSteps, every
step carries a `tier` and `needs`, `npm run check:tiers` passes, and tests/scripts/ holds
test-external-pack-contract.sh beside test-external-pack-app.sh. If they don't, stop and say so — those are
this plan's first three phases and the rest builds on them.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 4–9 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked. Phases 1–3 are done (`06f55ea72`, `b1c0b3cc4`, `8095daf14`), and Phase 2's
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
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- delete a test to make a tier boundary hold. A test that needs the app is tier 3; that is an answer,
  not a failure.
- run the suites concurrently. Measured twice: total work goes from 348s to 567s and @abuddy/cli starts
  failing, because every suite already uses all the cores.
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

### Phase 4 — The input-coverage guard, before anything depends on it

- A spec asserting every tracked source file is an input to at least one step, resolved through the same
  walk `fingerprintInputs` uses, so an under-declared input is a failing test rather than a stale pass.
- Its doc comment says why per-step caching needs this where `BUILD_UNITS` did not.

This is the phase that makes caching safe, and it comes first for that reason: the risk of caching is a wrong
input list silently skipping a check, and with CI off there is no backstop.

**Done when:** the spec passes over Phase 3's table. **Mutation:** adding a source file no step names, and
dropping a directory from one step's `inputs`, each fail it.

### Phase 5 — Caching

- Fingerprint each step with `fingerprintUnit`, stamp with `stampedBuild`, report an unchanged step as
  `cached` and do not run it. Bump `STAMP_VERSION` once.
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
  `vitest` directly.
- `abuddy init-tests` scaffolds both halves.

**Done when:** `abuddy test --contract` passes in both fixtures with no app built; `npm test -w @abuddy/cli`
covers the flag.

### Phase 8 — The practices that are work, not policy

- Size the timeouts per Decision 7, tier by tier, and delete the two `testTimeout: 120_000`.
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
- Keep the measured figures — they are what justify the design.

**Done when:** the table no longer asks the reader to work out which suite covers their change. Docs only.

## Deferred

- **The `@abuddy/cli` suite at 56s**, over half of `test:unit`. **Profiled, and there is no hot spot**: the
  slowest 25 tests are all 1–1.6s, spread across `facade-gate`, `scaffold`, `add-extensions`,
  `component-contracts`, `release` and `db`, and every one spawns a real `tsc`, `abuddy build` or node
  subprocess. The 249s of test time is a long tail of genuine work, already ~4.5× parallel. So the lever is
  fewer subprocesses — a shared tsc service, or one built fixture where tests differ only in their assertions
  — which is a project rather than a fix, and worth its own goal.
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
