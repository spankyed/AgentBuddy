> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-25). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: one job pool, and a guard that knows what a spec costs

Implement docs/goals/goal-one-job-pool.md on `AS/chain-inputs`, at or after `ae54b343d`. **Not master:**
the commits this builds on were moved off it, so a branch cut from master has none of them.

Before Phase 1, confirm the base: scripts/lib/unit-suites.ts exports `UNIT_SUITES`, the root
vitest.config.ts declares `projects` with four entries, scripts/lib/chain-steps.ts holds eight
`test:unit:<dir>` steps and `TIER_TIMEOUT_MS`, and `git rev-parse AS/cli-suite-spawns` resolves. If they
don't, stop and say so — the measurements below are arithmetic about where the time goes, and a stale
base invalidates them.

Then re-measure Background's per-suite table with nothing else running. Every number here is from
2026-09-25 on a 10-core machine, and contention has already produced a wrong answer in this repo: three
chain runs failed at load 44-84 reporting 307 of 307 tests passing.

Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1-6 are implemented and each meets its "Done when"; every new guard or helper is
  mutation-checked.
- AS/cli-suite-spawns is landed, with 764 tests before and after. This moves work off the process
  boundary; it does not delete coverage.
- A spec's half is decided by its measured cost, not by what its imports reach. Nothing sits in the
  integration half at 20ms, and nothing sits in the fast half at 48s.
- `npm run test:unit` is one vitest over eight projects with one `--maxWorkers`, and its total test
  count equals the sum of the eight per-suite counts.
- A one-package edit still runs only that package's tests, in one process, and a warm chain still
  reports the step cached.
- No per-test timeout remains that its tier's budget already covers.
- npm run chain --all passes; npm run typecheck; npm run test:unit.
- Measured and recorded in the Outcome: the per-suite table and test:unit's wall before and after,
  generate-entries.spec.ts before and after, test:integration's cache-miss cost before and after, and
  the chain's cold and warm times against 194s and ~28s.
- A number that did not move is a result. If the root run does not win, close this goal with the
  measurement rather than tuning until it does.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: something outside the session stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- Constraints' standing rules are hard stops, not advice: no publish or release, no real data dir, no
  broad pkill, no app outside the test env without an isolated ABUDDY_USER_DATA_DIR, no bare tsc on
  preload, no version metadata, and no change to the typed EARS types to make a call site compile.
- delete or loosen a test to make a number move. Coverage is not the lever here; cost is.
- take a measurement while another checkout is building.
- reopen what goal-test-tiers.md settled: lanes pay at two, a third lane is not worth unlocking, and
  per-tier timeouts already exist.
```

# Goal: one job pool, and a guard that knows what a spec costs

`npm run test:unit` takes **44.3s** doing **~95s of work on 10 cores** against a **13.0s** floor. The ideal
is `max(floor, work/cores)` ≈ 13s. The 3.4× gap is not saturation — it is that two schedulers share no
budget: `scripts/test-unit.ts` schedules *suites*, vitest schedules *files inside* a suite, and a third lane
oversubscribes within a suite rather than filling idle cores. At the same time the predicate deciding which
half a spec runs in has stopped being true: it asks whether a spec reaches a child process, which was a good
proxy for "slow" only while spawning was the only way to be slow.

**This absorbs [`test-unit-scheduling.md`](../plans/test-unit-scheduling.md) and
[`cli-suite-spawns-rebase.md`](../plans/cli-suite-spawns-rebase.md)**, which become history once it lands.
They are one goal because they meet in three places: the suite-split predicate, which one breaks and the
other must fix before it makes more specs slow-in-process; the timeout inventory, which lands in the two
configs the other's split created; and `generate-entries.spec.ts`, which is the floor file in one and a
thin-margin file in the other.

## Background (2026-09-25, at `ae54b343d`)

### Where the time is

Re-measured 2026-09-25 at `1c272123c`, each suite run alone and serially, nothing else on the machine.
"Work" is the sum of its files' times, "floor" its slowest single file.

| suite | work | **floor** | files | floor file |
|---|---|---|---|---|
| `@abuddy/cli` fast | **41.1s** | 7.4s | 46 | `tests/build/facade-gate.spec.ts` |
| `@abuddy/host` | 19.1s | 4.8s | 77 | `tests/database/write-lock.spec.ts` |
| `@abuddy/sdk` | 16.1s | **11.4s** | 56 | `tests/build/generate-entries.spec.ts` |
| `@app/default-setup` | 14.5s | 4.3s | 86 | `tests/unit/harness-app-stop.spec.ts` |
| `@app/api` | 5.0s | 1.1s | 15 | `tests/unit/secrets.spec.ts` |
| `@abuddy/ears` | 2.6s | 2.0s | 9 | `tests/lmdb/store.spec.ts` |
| `@app/main` | 0.1s | 0.1s | 2 | `tests/app-context.spec.ts` |
| `@app/renderer` | 0.1s | 0.1s | 8 | `tests/transport/client.spec.ts` |

**98.6s of work, an 11.4s floor**, against `npm run test:unit`'s 41.6s wall on 10 cores. So the ideal is
`max(11.4, 9.9)` = **11.4s** and the gap is 3.6×, which is the same shape the plan found and not the same
numbers. Three corrections to what it inherited:

- **`@abuddy/cli`'s fast half is 41.1s over 46 files, not 30.8s over 38.** That plan said its figures were
  "derived by mapping file timings onto the tip's naming rather than measured on the tip", and they were
  low. It is 42% of all the work, so its claim that `@abuddy/cli` "is no longer the giant" does not hold —
  by work it still is. Its *floor* is 7.4s, which is the part that was right.
- **The floor is 11.4s, not 13.0s**, still `generate-entries.spec.ts`. The ideal moves with it.
- **`@app/main` was missing from the table** and is 0.1s, which changes nothing but completes it.

The recorded lane table is 1: 69.8s, 2: 44.3s, 3: 47.7s, 8: 63.1s. A suite uses 2.0-3.8 of the 10 cores,
which is why two lanes help and eight only add contention.

The floor is one file, `abuddy-sdk/tests/build/generate-entries.spec.ts`, 94 tests — of which **the cost is
3 tests**. Three `typecheck()` call sites each run a full `ts.createProgram` resolving `@abuddy/sdk` under
`customConditions: ['@abuddy/source']`, so each type-checks ~165 files of SDK and ears *source*
(`skipLibCheck` skips `.d.ts`, and the SDK is `.ts`). The other 91 are string and AST assertions, about 1s
together. Splitting by topic buys nothing; the three programs re-parse an identical graph.

### The mechanism is already in the repo, unused

The root `vitest.config.ts` declares `projects` with four of eight packages, referenced by nothing — an
unfinished migration (`aa877a299`). Vitest's default sequencer takes every project's files as one list and
sorts longest-first from a duration cache, falling back to file size when cold: longest-processing-time
across package boundaries, the greedy makespan approximation within 4/3 of optimal. That is the one job
pool. Per-project `environment`, `alias`, `setupFiles`, `globals` and `testTimeout` are per-project
settings, so nothing flattens; no package disables `isolate` or sets a custom `pool`; `isolatedDataDir`
separates workers by `VITEST_POOL_ID`, which stays unique under a shared pool. One gotcha: npm `pretest`
hooks do not fire under a root run, so `packages:ensure` must run once up front.

### The predicate has three counter-examples

`suite-split.spec.ts` classifies a spec by whether its imports reach `node:child_process`.

- `AS/cli-suite-spawns` converts 14 sites from `node bin/abuddy.mjs` to an in-process `callCli()`. `callCli`
  loads esbuild, whose Node API starts a child process — measured, exactly one. The guard reads it clean.
- `facade-typing.integration.spec.ts` is the largest file in the suite, **48.4s**, with **zero** spawn call
  sites. It stays in the integration half only because line 1 still imports `execFileSync`.
- `tests/cli/test-contract.integration.spec.ts` injects a fake runner, spawns nothing, runs in **20ms**, and
  is in the integration half because the export it imports defaults to `spawnSync`.

### What `goal-test-tiers.md` already settled (`13ccc21a6` … `ae54b343d`)

- **Lanes pay, at two.** Cold, idle: serial 306.9s; two lanes 194.0/198.7/196.5s, 17 of 17 each; three lanes
  202.7s with one of two runs failing and **+55% total work**.
- **A third lane is not worth unlocking.** The 5s default is a cap, but lifting it wins nothing, because
  three lanes is slower than two on wall *and* work. It is also not one file: the failing run timed out in
  `findLmdbImports > holds for the repo` (5220ms), not `generate-entries.spec.ts`.
- **Per-tier timeouts exist.** `TIER_TIMEOUT_MS` (tier 1 15s, tiers 2 and 3 60s), enforced by
  `suite-timeouts.spec.ts`; both `testTimeout: 120_000` are gone. What remains is the inventory: **374 tests
  in 29 spec files** doing heavy work on vitest's 5s default, propped up by **97 hand-written per-test
  timeouts** — the ones nobody remembered are the flakes.
- **`test:integration` is tier 2 and cached per step**, so moving spawns in-process makes a **cache miss**
  cheaper, not a cached run faster. Measure it there, not against `test:unit`.
- **Process-group reaping exists for `tests/scripts/`** (`scripts/bounded.ts`). It would not have caught the
  34-hour orphaned `abuddy generate-entries` that skewed a day of measurements.

## Decisions

**1. The predicate becomes measured cost, not mechanism.** A spec is in the integration half because it is
slow. Three counter-examples point this way, and Phases 1 and 3 create more of them.

**2. One job pool.** One root vitest over eight projects, `--maxWorkers` the single budget. Derive the
project list from `scripts/lib/unit-suites.ts`, already shared by `scripts/test-unit.ts` and the chain's
step table. A hand-written third copy is what drifts.

**3. Per-package caching survives the pool.** The chain's eight `test:unit:<dir>` steps become **one step
running one vitest filtered to the stale projects**. `stampedRun` already writes one stamp per name, so N
stamps under one step is an extension. Do not buy the pool by giving up the cache; the point is both.

**4. Timeouts are configured per tier, not per test.** The two configs are where a tier budget lives. Delete
per-test timeouts the tier budget covers; keep the ones genuinely about one test.

**5. Reaping widens past `tests/scripts/`** — any long-running `abuddy` invocation, or an `abuddy doctor`
that reaps what `@abuddy/host/process-liveness` already identifies (`lockIsHeld`, `recordIsStale`).

## Phases

### Phase 1 — Land `AS/cli-suite-spawns`

7 commits based on `4ed04f144`, which is no longer an ancestor of anything live. All changes are inside
`packages/abuddy-cli/tests/**`; no production source. `git merge-tree` gives **one** conflict, add/add on
`docs/goals/goal-cli-suite-spawns.md` — self-inflicted by that session restoring the doc. Take this tip's
copy and re-append its outcome. All code merges clean, and rename detection lands the edits on the renamed
files.

Two hunks drifted underneath those edits and want reading rather than trusting: `facade-typing` (−4 lines,
two `@ts-expect-error`/`findAll` pairs in the CONSUMER fixture) and `scaffold` (−1 assertion on
`services.ts`, and the nested-vitest assertion loosened to `\d+ passed` plus `not.toMatch(/failed/)`) — the
`add service` site whose assertion was deleted is the one that was converted.

**Done when:** 32 labelled spawn sites, 0 unlabelled, 8 `process` and 7 `inherent` remaining; 764 tests
before and after; `npm run chain` passes. **Mutation:** `callCli` and `typecheckPack` carry mutation checks
already — confirm they still fail on the rebased base.

### Phase 2 — Make the predicate cost-based, before anything is made faster

Record each spec's measured duration and split on that. It is a recorded artifact, so it takes a
`check`/`update` pair like the repo's other five. First, because every later phase makes the mechanism proxy
worse.

**Done when:** `facade-typing` is classified by its 48.4s and not by a line-1 import; `test-contract`
returns to the fast half on its 20ms; no spec's half depends on whether a helper it calls happens to spawn.
**Mutation:** making a fast spec slow moves it, and the check names it.

### Phase 3 — One root vitest

Extend `projects` to eight (derived) and point `test:unit` at one root run. Keep `scripts/test-unit.ts`
until the numbers are in, so the comparison is honest.

**Done when:** the root-run wall is recorded against 44.3s, and the total test count equals the sum of the
eight per-suite counts — a drop means a project's `include` did not carry.

### Phase 4 — Collapse the chain's eight steps onto the pool

Decision 3: one step, per-project stamps, `--project` for the stale ones.

**Done when:** a one-package edit runs only that package's tests, in one process; a warm chain reports the
step cached; `npm run chain --dry` still names what would run. **Mutation:** touching one package's source
makes exactly that project run.

### Phase 5 — The floor file, and the timeout inventory

Amortise the three compiling tests with a shared `ts.CompilerHost` and `oldProgram`. The cache rule is safe
by construction, because `root` is `mkdtemp`'d per test: **cache any `SourceFile` not under `root`; never
one that is.** Expect 13s → 5-7s and measure rather than promise — a cached host saves parsing while the
checker still runs per program, and `oldProgram` recovers the rest. Split those 3 tests from the other 91:
91 pure, 3 that invoke a compiler, which is a real tier boundary. Then apply Decision 4 to the inventory.

**Done when:** the file is measured before and after; its asserted diagnostics are unchanged; no per-test
timeout remains that its tier budget covers. **Mutation:** a type error injected into the fixture is still
caught.

### Phase 6 — Re-measure, and retire what the pool replaced

Retire `test-unit.ts`'s lane scheduler if Phase 3 won, leaving `--maxWorkers` as the one budget — Decision 6
of `goal-test-tiers.md` satisfied by construction rather than by a script. Then **re-measure the chain's own
lane default**: two is tuned against eight suite steps, and one step using every core is a different
problem. Widen reaping (Decision 5).

**Done when:** the chain's cold and warm times are recorded against 194s and ~28s, and the lane default is
the measured one. If the root run does not win, close this goal with the measurement and say so — that is an
outcome, as it was for lanes.

## Deferred

- **`test:integration`'s worker cap.** `vitest.integration.config.ts` holds `maxThreads: '50%'`, justified
  as *"spawning is what makes it necessary."* Phase 1 removes 17 spawns from exactly that suite, so the
  change is what would justify relaxing it — two runs and one toggle, but not on the path to the pool. Run
  it after Phase 1 or record it as unrun.
- **The suite repairing its own inputs.** A run bypassing `pretest` fails ~21 files on the staleness guard,
  then the specs that spawn the CLI rebuild the stale packages as a side effect and a retry goes green with
  nothing changed. Phase 1 removes 17 of the spawns that did the repairing, which makes honest failure more
  likely, not less. Worth a guard of its own; not this goal.

## Outcome

### Phase 1 — `AS/cli-suite-spawns` landed

Rebased onto `1c272123c` and fast-forwarded into `AS/chain-inputs`. `4ed04f144` was skipped as already
applied (it is a `goal-test-cleanup` doc commit that reached this history under another sha), so six
commits replayed: three code, three doc. Recovery point is the branch `pre-rebase-cli-spawns` at
`2f3e7613e` — a branch and not a tag, because this goal's constraints forbid tags.

**The one conflict was the predicted one**, add/add on `docs/goals/goal-cli-suite-spawns.md`. Resolved by
taking the incoming copy, after checking that it is this tip's copy plus an appended `## Outcome`: the two
are byte-identical through line 246 and identical again after the Outcome block. So "take the tip's copy and
re-append the outcome" and "take theirs" are the same resolution here, and nothing of the tip was dropped.

**The two drifted hunks were read rather than trusted**, and the check that settles it is that
`git diff AS/chain-inputs..HEAD` on both files contains *only* conversions — spawn to `callCli` or
`typecheckPack`, their labels, and the async plumbing. The tip's own edits survive, including the loosened
nested-vitest assertion in `scaffold` (`Tests\s+\d+ passed` plus `not.toMatch(/failed/)`).

**One label is missing and should be.** The labelling commit added 32; 31 are present. The missing one sat
on the single spawn inside the shared helper — *"the one spawn Phase 2 converts for all of them"* — and went
with the spawn it labelled. What remains is 13 `produces`, 3 `typecheck`, and the 8 `process` plus 7
`inherent` that still spawn, which is the 15 the plan predicted.

**Coverage held: 858 tests before and after** (530 fast in 46 files, 328 integration in 34). The plan's
"764 before and after" was its own base's count and is stale here; the invariant is the number, not that
number.

**Measured, at the same 328 tests**, by reverting `packages/abuddy-cli/tests` to the pre-rebase commit and
timing it, so the comparison is the conversions and not a changed test set:

| `test:integration` | wall | test time |
|---|---|---|
| before | 42.03s | 194.38s |
| after | **35.30s** | **161.33s** |

−16% wall and −17% test time. That is a **cache miss** getting cheaper: the step is tier 2 and cached per
step, so a warm chain that skips it is unaffected either way.

**Both recorded mutation checks still fail on the rebased base.** A type error injected into the `CONSUMER`
fixture fails all four typecheck cases with `src/consumer.ts(161): error TS2322`, naming file, line and code
where the spawn reported only a non-zero exit. With `generateEntries` skipped in `build()`, two of the three
converted spec files fail at `beforeAll`. The second check needs `npm run packages:ensure` after the
mutation: editing `abuddy-cli/src` makes its bundle stale, and without the rebuild all four files fail at
the freshness guard before running a test — a failure that looks like the mutation being caught and is not.

### Phase 2 — the predicate is the measured cost

`packages/abuddy-cli/etc/spec-cost.json` records what each of the 80 specs costs;
`tests/build/suite-split.spec.ts` reads it and fails when a spec is in the wrong half, has no recorded cost,
or is recorded and gone. `spec-cost:update` re-measures and rewrites it, `spec-cost:check` reads it and runs
nothing — re-measuring to decide placement would make the cheap half expensive, which is what the split
exists to prevent. 25 specs changed half.

| half | before | after |
|---|---|---|
| fast | 46 specs, 41.1s file time | **57 specs, 14.9s file time, 5.9s wall** |
| integration | 34 specs, ~180s | 23 specs, 179.4s file time, 38.8s wall |

`facade-typing` is integration on its 29.8s rather than on a line-1 import; `test-contract` is fast on its
18ms. 861 tests against 858 before — the +3 is the rewritten guard, which has five assertions where the old
one had two.

#### A single threshold oscillates, and that is why there is a band

**The first design was one line at 1s, and it was wrong twice over.** The justification was that the costs
"fall into two groups with a gap between them" — they do not: measured, they run continuously through a
second (899, 957, 977, 1167, 1466, 1637, 1981, 2118, 2930). That was a claim written before it was checked.

Worse, a single threshold does not converge. A file's recorded time is its wall time under whatever else its
half is running, so **moving a spec changes its cost**: `dependency-flow-helpers` reads 4.7s in the fast half
and 2.4s in the integration half. The first update moved 24 specs; re-measuring then wanted to move four of
them back, and would have gone on doing so.

So there are two edges: a fast spec moves above **2.5s**, an integration spec returns below **1.5s**, and the
band between them is where a spec stays put. 2.5s is the widest gap in the distribution (2118 -> 2930, 812ms,
about four times the next best) and 1.5s sits under everything seen from the integration side. With the band
the second update moved one spec and the third moved none.

#### Two traps the record had to be taught about

- **A skipped spec records as free.** It would be filed as the fastest thing in the suite and become slow the
  day it runs — `dependency-runtime` skips until default-setup is built, which is exactly that shape. The
  update refuses a run that skipped anything.
- **The guard is inside the suites it measures.** While the record is stale the guard fails, so the update
  could never produce a clean run. Skipping the guard was tried and is worse: a fully skipped file prints no
  timing line, so it ends up with no recorded cost and the update rejects itself. The update instead
  tolerates exactly one failing file, the guard, and measures it like everything else.

#### A caching hole this opened, closed

The guard reads `etc/spec-cost.json`, and `WORKSPACE_PARTS` did not include `etc`, so changing the record
would not have re-run the suite that asserts on it. `etc` is now a declared input, which also covers the API
reports the other packages keep there.

**Mutation:** a fast spec recorded above 2.5s, an integration spec recorded below 1.5s, and a recorded spec
that no longer exists each fail the check, naming the file and both edges.

### Phase 3 — two pools, because one is not possible

| | before | after |
|---|---|---|
| `npm run test:unit` | 41.6s, eight `npm test -w` runs two at a time | **35.3s, two pools, serial** |
| collected tests | 2632 passed | 2634 = 1914 host + 720 pack, 2632 passed + 2 skipped |

The count reconciles exactly against the sum of the eight per-suite counts, so every project's `include`
carried.

#### One pool over all eight is not achievable, and the reason is load-bearing

Host suites resolve the workspace `@abuddy` packages to source under the `@abuddy/source` condition; the
pack suite must resolve the published `dist`, the only layout a pack author ever has — which is why
`check:specifiers` fails a pack config that declares that condition. **Node conditions are per process**,
and vitest shares its worker pool across projects: per-project `poolOptions.execArgv` is ignored, measured
on `@app/api`.

Probed rather than argued. A `default-setup` spec asking `createRequire(import.meta.url).resolve` for
`@abuddy/sdk`:

    without the condition   dist     ../abuddy-sdk/dist/index.js      <- how the pack suite runs today
    with the condition      SOURCE   packages/abuddy-sdk/src/index.ts <- what one pool would do

One pool would not have failed. It would have quietly tested something else, which is worse. So there are
two pools split on the boundary the repo already enforces: the host projects in the root `vitest.config.ts`
(21.1s alone) and the pack suite in its own (13.3s alone). The plan's survey checked `environment`, `alias`,
`setupFiles`, `globals` and `testTimeout` and concluded "nothing has to be flattened". Resolve conditions
are the thing it did not check, and they are the one setting that cannot be per-project.

#### Serial, again, and for the same reason as before

    lanes 1: 35.4s, 35.2s wall   35.2s of pool time   passed, passed
    lanes 2: 34.3s, 34.4s wall   66.0s of pool time   passed, and one run failed a test

A second lane buys 3% for 87% more work and a flake — the host pool is 21.1s alone and 33.6s beside the
pack pool. Each pool already spreads across the cores, which is the same saturation that capped the old
suite-level scheduler, reached from the other side.

#### `work / cores` was never the right model, which changes Phase 5

The plan predicted 44.3s → ~13s from `max(floor, work/cores)` = `max(13.0, 95/10)`. Measured, the host pool
does about 136s of worker time in 21.1s of wall — 6.5× parallelism — so the suites were never serialised in
the way that arithmetic assumes, and pooling them recovered 15%, not 3.4×.

Where the time actually is, from the pools' own breakdowns: the host pool spends `collect 70.1s` and
`transform 10.5s` against `tests 65.7s`, and the pack suite spends **`setup 83.3s`** against `tests 13.5s`
across 86 files. So the pack suite is dominated by per-file setup — `isolatedDataDir` and the harness, paid
once per file — and not by any single slow file. Phase 5 should read that number before it amortises
`generate-entries.spec.ts`: the 11.4s floor file is the host pool's problem, and 83s of per-file setup is a
larger one sitting in the other pool.

### Phase 4 — two chain steps, with per-package staleness inside them

The chain had eight `test:unit:<dir>` steps, which is eight vitest processes — the thing pooling removed.
What those steps were buying was the per-package **cache key**, not the per-package **process**, and the two
are separable. There are now two steps, `test:unit:host` and `test:unit:pack`, whose inputs are the union
across their pool; `scripts/test-unit-pool.ts` asks `suiteInputs` per project, passes `--project` for only
the stale ones, and stamps each through `stampedRun` so a failure leaves every project unstamped.

Measured behaviour:

    warm, nothing changed          host pool: all 7 project(s) up to date
    touch packages/renderer/src    host pool: 2 of 7 — @app/renderer, @app/main   52 tests, one process
    pack pool, cold then warm      1 of 1, then all 1 up to date

`@app/main` comes along because it depends on the renderer, which `workspaceDeps` derives from its
manifest rather than from a list.

#### The freshness gotcha is worse than "a dozen specs fail"

npm `pretest` hooks do not fire under a root run, so nothing rebuilds the published packages the suites
guard on. What that looked like was not an error: the pool reported **1752 tests where it collects 1909**,
because twelve files failed at the guard before collecting anything, and a run that "only" has twelve failing
files is easy to read as flaky rather than as 162 tests never having run. The trigger was editing this
repo's own `package.json` — removing the eight scripts this phase replaced — which is enough to make
`@abuddy/cli`'s bundle stale. Both pool commands now run `packages:ensure` first, which is a stat and a
return when nothing is stale.

#### Two guards, one of which caught this phase's own mistake

`chain-inputs.spec.ts` already required that a step declare the paths its own npm script names, and it
failed the moment the new step ran `scripts/test-unit-pool.ts` without declaring it. The new guard is the
one this shape needs: **a pool step's inputs must cover every project inside it.** The step caches on the
union while the runner decides per project, so a narrower step would cache while a project inside it was
stale — and that project would simply never run again. Both readings come from `suiteInputs` for that
reason. **Mutation:** narrowing a pool step to its first suite's inputs fails it by name.

`chain-inputs.spec.ts` reports 17 tests where it reported 23: it has one case per chain step, and there are
six fewer steps. The file count is 224 either way, so no spec was lost.

#### The root config lists its projects literally, and that is the safe answer

`check:specifiers` reads configs as text to decide whether one that compiles `@abuddy` imports declares the
source condition, and it cannot read a computed list — deriving `projects` from `UNIT_SUITES` failed it.
Of the three ways out it offers, **declaring the condition at the root is the one that would have been
wrong by accident and right by luck**: a root setting reaches the projects under it, and it is safe here
only because every project in this list is a host package. Had the pack ever been added to that list, the
condition would have followed it and the suite would have resolved source without anything failing.

So the list is literal and guarded: `chain-inputs.spec.ts` asserts it is exactly the host suites.
**Mutation:** adding `packages/default-setup` to it fails by name, which is the case that matters.

### Phase 5 — the floor file, and 97 timeouts the tier budget now covers

#### "The cost is 3 tests, not 94" is backwards

| | measured |
|---|---|
| the 3 compiling tests | **3.13s** |
| the other 91 | **~7.2s** of `generatePackFiles` |
| all 94 tests' `mkdtemp` + `rmSync` | 0.15s |

The plan has it the other way round — "the cost is 3 tests, not 94", the other 91 "together about 1s" — and
that is what made 13s -> 5-7s look reachable. The 91 are not string assertions over a cached artifact: each
one calls `generatePackFiles` with a different manifest, which is real work that no cache can share.

#### What amortising the compiler actually buys

A shared `ts.CompilerHost` with one `SourceFile` cache across the three programs, under the rule the plan
gives — `root` is `mkdtemp`'d per test, so cache anything not under `root` and never anything that is.

    the 3 compiling tests   3.13s -> 2.46s
    the whole file         10.36s -> 9.40s

**`oldProgram` was tried and is not kept.** The plan says it "is what recovers the rest"; measured at 2.44s
and 2.52s against 2.46s without it, which is no difference. Code that buys nothing should not be carried
for the story it tells.

**Mutation:** a type error injected into a file under `root` is still reported
(`src/probe.ts: Type 'string' is not assignable to type 'number'`), so the cache cannot mask an error in
what a test writes.

#### The split was not done, and the measurement is why

The phase asks for the 3 compiling tests in their own file as "a real tier boundary". Two things measured
against it. The floor is not binding: the host pool is 21.1s of wall against a 9.4s floor, so splitting the
floor file changes the pool's time by about nothing. And there is no tier for those tests to move into —
Phase 2 established that a spec's half is its measured cost, and that split exists only in `@abuddy/cli`,
while this file is in `@abuddy/sdk`, which runs one suite. Against that, the split means extracting ~125
lines of helpers that close over a per-test `root` out of a 1329-line file used by 94 tests. Attempted,
then reverted when the measurement said it bought nothing: a number that did not move is a result.

#### 97 per-test timeouts existed because the configs sat at 5s

Both `@abuddy/cli` configs ran at vitest's 5s default, which is why 97 per-test and per-hook timeouts of 30s
to 240s had been written — in fast-half files that run in about a second, and integration files whose
slowest single test is about 5s. The budget belongs to the tier: `testTimeout` and `hookTimeout` are now
15s in the fast config and 60s in the integration one, which is `TIER_TIMEOUT_MS` for tiers 1 and 2, and all
97 are gone. Both halves pass unchanged, 451 and 408.

**A regex that reached into string literals.** The first pass matched `}, <n>)` anywhere and rewrote
`setTimeout(()=>{},5000)` inside a fixture string, removing the delay that kept a child process alive; two
`with-source` tests failed in 70ms, which is not what a timeout change looks like. Redone anchored to a line
that closes a call. The same greedy match had also reported "keeping" a deliberate 300ms timeout that was
never a timeout at all — it was inside that same fixture.

## Constraints

`goal-test-tiers.md`'s standing rules carry over unchanged: no push, tag or PR; no publish or release; no
real data dir; no broad `pkill`; no app outside the test env without an isolated `ABUDDY_USER_DATA_DIR`; no
bare `tsc` on `preload`; no version metadata; no change to the typed EARS types to make a call site compile.

And three earned by the work that produced this goal:

- **Do not accept a measurement taken while another checkout was building.** Three chain runs failed here
  reporting 307 of 307 tests passing, at load 44-84 from a second worktree.
- **A guard that cannot fail is worse than no guard.** Two written for `goal-test-tiers.md` were unfailable,
  and mutation caught both where review had not: one asserted an invariant derived from the table it was
  checking; the other tested a failure path with a fixture in which no step was ever ready.
- **Never delete a test to make a boundary hold.** A spec that is slow is tier 2. That is an answer.
