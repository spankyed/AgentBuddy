# Test cleanup: remaining action items

Compiled 2026-09-25 on `AS/test-pipeline`, from implementing `docs/goals/goal-test-cleanup.md` and a review
pass over the result. Every number below was measured on this machine on that date unless it says otherwise;
items under **Unverified** were reasoned from the code and not tested, and say so.

The goal's own record is its Outcome section. This is only what is left.

## Closed, recorded so they are not re-raised

| Item | Why it is closed |
|---|---|
| `scripts/test-unit.ts` truncated a failing suite's output | `process.exit()` drops buffered stdout — measured, 500,019 bytes through a pipe arrive as 131,072. Now `process.exitCode`, which propagates through `npm run` the same way |
| Eight unused imports, a dead helper and its constant | Left by deletions across three phases; `lint:check` runs inside `typecheck` on this branch and caught them all |
| `install-host-version` pinned the app's version | Asserted `requires AgentBuddy >=99.0.0; this is 0.3.14`. The second clause is this repo's current version and would have failed on the next release |
| `facade:check` failing | Two changes predating this work (a dropped private `ensureGitRepository`, `PromptEntity` resolving through its import) plus one line this branch added. Re-recorded |
| "One timeout blocks a third lane" | Wrong. With `@abuddy/sdk` at 20s the failure moves to `@abuddy/cli` at the same 5s default. Corrected in the runner's comment and the Outcome |
| "Nothing catches a widened SDK exports map" | Wrong. `api:check` does — see item 2, which is the real finding |

---

## 1. The builder race in `withBuildLock` — **done, 2026-09-25**

Two `ensurePackagesBuilt` calls each check for a running build and find none, each find the same units
stale, and each spawn `npm run build:package`. The one that reaches the lock second throws:

```
Error: another package build holds …/packages-build.lock: pid 34600 (@abuddy/testing, …)
    at withBuildLock (packages-built.ts:303)
```

`waitForPackageBuild` (this branch) closes the **reader** race — a freshness reader seeing the stamps a live
build is rewriting. It cannot close the **builder** race, because when each process checks there is no lock
yet: the window is between checking and the spawned npm acquiring, which is seconds wide.

**Shape of the fix:** a `wait` option on `withBuildLock` used by the freshness path, and `stampedBuild`
re-checking staleness once it holds the lock, so the second process finds the work already done.

**Buys:** Phase 2's concurrent-pair Done-when (`test:unit` and `test:external-pack` together, ten times in a
row). **Does not buy lanes** — measured: at three lanes with packages fresh, 0 lock-shaped errors and 6
timeouts.

**Done.** A build now declares a `BuildIntent`: a `command` fails at once naming the holder and builds
whether or not the output is fresh; a `freshness` fix waits for a live holder and, once it has the lock,
re-checks staleness so the second arrival finds the work done. The intent crosses the spawn boundary in
`ABUDDY_BUILD_INTENT`. The wait is bounded and the bound is injectable — writing the tests hung a suite for
nine minutes against the ten-minute default before that parameter existed.

Verified: four consecutive runs of the two suites started together against stale packages, all green, no
lock errors; reverting the wait fails the same run with two. **Phase 2's mutation check discriminates now**,
where before it could not, because both sides failed.

## 1b. Nothing could time out — **done, 2026-09-25**

Raised separately from the list below, because it is the reason several of this session's incidents cost
hours: an orphaned `generate-entries` at 99% CPU for a day and a half, a packaged-authoring script that hung
a machine until three pids were killed by hand, and a nine-minute hang while writing the tests for item 1.

None of it was bad luck. `scripts/chain.ts` spawned all ten steps with no wall-clock bound at all,
`scripts/test-unit.ts` spawned eight suites the same way, and four of five shell scripts under
`tests/scripts/` had none either. The fifth only looked bounded: `test-packaged-authoring.sh` sets
`timeout 120` inside its `expect` block, which covers a pattern match and not the `wait` after it. Nor could
vitest help — its timeouts bound a *test*, not the process around it, and a synchronous block
(`Atomics.wait`) is invisible to them entirely.

`scripts/lib/bounded-spawn.ts` now bounds every spawn an orchestrator makes and kills the process *group*,
so nothing survives the run that started it. Budgets come from measurements — each chain step declares what
it costs healthy and gets four times that — because a bound nobody would wait for is the same as no bound;
the build lock's own wait dropped from ten minutes to one on the same reasoning. `TIMEOUT` is its own
verdict beside `ok` and `FAIL`. `chain-graph.spec.ts` fails on an orchestrator that imports a raw `spawn`,
a chain step with no declared cost, or an npm script that runs a shell script without a budget.

Measured: the bound fires at the budget, exit 124, and leaves no survivors — including against a child that
ignores SIGTERM, which the first version would have missed, because its SIGKILL escalation rode on an
unref'd timer that never fired.

**Still unbounded:** `release-beta-rule.test.sh`, which no root npm script invokes — it runs from CI, which
has its own timeouts.

## 2. Make the stamps sound, and keep them sound

`api:stamp`'s key is incomplete. Its own comment states the invariant — *"the reports are a pure function of
the declarations API Extractor reads"* — and that is subtly wrong: a report is a pure function of the
declarations **and the set of entries**, because there is one report per entry.

Measured: add `./packs` to `@abuddy/sdk`'s exports map, rebuild, and `api:check` fails (no
`etc/packs.api.md`) while `api:stamp` passes, printing "API reports match its declarations". `api:check` is
deliberately not a chain step, so between the two a widened map reaches a merge unreported. Root `CLAUDE.md`
says a matching stamp means `api:check` cannot fail; this is a counterexample.

Missing from the key: the entry set, `api-extractor.json` / `tsconfig.api-extractor.json`, the API Extractor
version, and a version for `apiSurfaceOf` itself.

**This is the third instance of one class** — a hand-enumerated cache key that goes stale in silence:

| Stamp | Key | Hole |
|---|---|---|
| `api:stamp` | declarations, enumerated | the four above |
| `packages-built` / `fingerprintUnit` | `inputs` per unit, hand-listed | a file the build reads that nobody listed |
| chain steps | `inputs` per step — not written yet | `goal-test-tiers.md` Phase 4 already names it: *"an under-declared input is a failing test rather than a stale pass"* |

**Four layers, ordered by what each catches:**

1. **Derive, don't enumerate**, wherever a source of truth exists — read the entry set from `exports`, as
   `exports:check` already computes `@abuddy/ui`'s map from `src/`. An input derived from the thing itself
   cannot drift.
2. **Mutation-check each declared input** — change it, assert the stamp moves. The Phase 9 idiom. Catches
   *listed but not actually hashed*, and *the walk skips this file type*.
3. **Make the cheap check verify itself whenever the expensive one runs.** If `api:update` or `api:check`
   moves a report while the stamp said "match", the key is incomplete: fail naming it. Zero marginal cost,
   because the evidence is already in hand. **This is the only layer that catches an input nobody imagined**,
   which is the class that bit us.
4. **`STAMP_VERSION`** on `api-report-stamp.ts`, which `packages-built.ts` already has, for when
   `apiSurfaceOf` changes meaning.

Generalised, and worth writing into `CLAUDE.md`: *a cheap proxy for an expensive check must assert its own
soundness every time the expensive check runs.*

**Scope:** 1, 3 and 4 on `api:stamp` is the contained piece. Layer 3 on `packages-built`, and 1+2 for chain
steps, belong with `goal-test-tiers.md` Phase 4 — same problem, so they should share whatever shape lands
here rather than inventing a third.

## 3. Get `test:unit` under 43s

Phase 2's 25s Done-when is unmet and lane count will not close it. Two levers, both real work:

| | |
|---|---|
| Sum of the eight suites, each run alone | 52.6s |
| `@app/default-setup` 14.7s + `@abuddy/sdk` 12.0s | **51% of that** |
| Perfect packing over two lanes would be | 26.3s |
| Measured wall at two lanes | **43s** |
| Suite time at two lanes | ~86s, so each suite runs **1.63× slower** when two run at once |

So most of the gap between 26.3s and 43s is the contention tax, not the suites' own cost. Closing it needs
both: cheaper suites, and less mutual interference.

**Adding lanes is not a lever.** Three lanes measured 44.4s against two lanes' 43s, with 6 tests hitting
vitest's 5s default. Raising one package's timeout moves the failure to the next package, so the margins are
thin across suites rather than in one test.

## 4. `check:tiers` cannot follow into a workspace's `package.json`

It follows root `npm run` chains and files under `tests/` and `scripts/`, so for a step that delegates to a
workspace script — `test:integration` is now one — it inspects nothing and passes vacuously. Tier 2 for that
step was established by reading the specs, not by the guard.

Belongs with the pipeline work, not here.

## 5. Correct one row in the goal's *Do not remove* — **done, 2026-09-25**

`abuddy-cli/tests/build/published-sdk-types` is credited with catching "subpaths resolving that should
not… widening the surface by accident". It does not: Phase 7 removed its four negative-resolve assertions on
the plan's instruction, because each named a path an earlier refactor removed. What it catches, demonstrated
by removing `./repositories` from the map, is a published entry that stops resolving, the package shipping
anything but `dist`/`package.json`/the schema, and source maps leaking. The row now says that, and names
`api:check` as what catches the widening — which item 2 is about, since the chain does not run it.

## Blocked on you

- **41 commits are local and unpushed** on `AS/test-pipeline`. Nothing has been pushed and no PR opened.
- **`AS/test-cleanup` is a stale pointer** (33 ahead, 1 behind) at an amended commit. Everything is on
  `AS/test-pipeline`; the branch can go.
- **The `cli-spawns` worktree** on `AS/cli-suite-spawns` is another agent's. Confirm it is still wanted.

## Unverified — reasoned, not tested

- Whether `api:stamp` catches a widening that points at a **genuinely new module**. The case measured
  aliased already-built files, so no declaration changed; a new module emits new declarations and may be
  caught. The entry-set hole may be narrower than the worst case.
- Whether `BUILD_UNITS` has a missing input **today**. The exposure is structural — the list is
  hand-written — but no specific omission was found.
- `suite-split.spec.ts` resolves only relative imports, so a fast spec reaching a spawner through a package
  specifier would be invisible. Checked that nothing does today; not guarded against.
