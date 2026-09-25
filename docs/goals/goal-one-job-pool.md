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
