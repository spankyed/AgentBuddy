# Plan: one job pool for `test:unit`

`npm run test:unit` takes **44.3s** doing **~95s of work on 10 cores** against a **13.0s** hard floor. The
ideal is `max(floor, work/cores)` ≈ 13s. The 3.4× gap is architectural, not saturation, and the mechanism
that closes it is already in the repo as dead code.

Surveyed 2026-09-25 against `faee075fd`. Timings come from a full `test:unit` capture on an adjacent base;
the per-suite floors below are unaffected by the fast/integration split, but the `@abuddy/cli` fast-suite
figures are derived by mapping file timings onto the tip's naming rather than measured on the tip. Test 1
confirms the whole model in one run.

## Where the time is

| suite | work | **floor** (slowest single file) | files |
|---|---|---|---|
| `@abuddy/cli` fast | 30.8s | 7.4s | 38 |
| `@abuddy/host` | 19.9s | 4.8s | 79 |
| `@abuddy/sdk` | 18.9s | **13.0s** | 57 |
| `@app/default-setup` | 17.6s | 5.3s | 84 |
| `@app/api` | 5.1s | 1.1s | 16 |
| `@abuddy/ears` | 2.8s | 2.1s | 10 |
| `@app/renderer` | 0.1s | 0.1s | 8 |

For contrast, the split moved 229.1s of work and a 39.5s file out of `@abuddy/cli` into the integration
half: 32 integration files vs 38 fast ones. `@abuddy/cli` is no longer the giant; `@abuddy/sdk`'s floor is.

## Why more lanes do not pay

`scripts/test-unit.ts` schedules **suites**; vitest schedules **files inside a suite**. Two schedulers with
no shared budget. At `lanes=2`, with a suite using 2.0–3.8 cores, 4–7.6 of 10 are busy — and a third lane
oversubscribes *within* a suite rather than filling idle cores, which is why the recorded table reads
1: 69.8s, 2: 44.3s, 3: 47.7s, 8: 63.1s.

`goal-test-tiers.md` names this as its first industry gap — *"A build system has one job pool; this has N"* —
and Decision 6 asks for one owner of concurrency. `test-unit.ts` is a budget **over** N pools, not one pool.
That is the ceiling, and no lane count removes it.

## Lever 1 — one vitest run over all packages

**The mechanism already exists, unused.** The root `vitest.config.ts` declares
`projects: ['packages/abuddy-sdk', 'packages/api', 'packages/default-setup', 'packages/renderer']` — four of
eight, referenced by nothing. `scripts/spec.ts` deliberately runs each package's own `test` instead. Its last
commit was `aa877a299 build(default-setup): switch to vitest workspace`, an unfinished migration.

**Vitest already schedules this correctly.** The default sequencer
(`node_modules/vitest/dist/chunks/coverage.*.js:3472`) receives every project's files as one list and sorts
it longest-first from a duration cache (`return bState.duration - aState.duration`), falling back to file
size when cold. That is longest-processing-time-first across package boundaries — the greedy makespan
approximation, within 4/3 of optimal — and it is the one job pool Decision 6 wants.

**The work:** extend `projects` from 4 to 8, and point `test:unit` at a single root `vitest run` with
`--maxWorkers` as the one budget knob, replacing lanes × per-suite workers. Per-package configs are
*referenced*, not replaced, so `npm test -w <pkg>` and `npm run spec` keep working unchanged. Additive, not
a migration.

**Checked, and clear:**

- no package disables `isolate` or sets a custom `pool`; three set `fileParallelism: true`, which is the default
- `isolatedDataDir` separates workers by `VITEST_POOL_ID` (`worker-<n>`), which stays unique under a shared pool
- per-project `environment` (renderer's jsdom), `alias` (main's electron stub), `setupFiles`, `globals` and
  `testTimeout` are all per-project settings, so nothing has to be flattened

**One gotcha:** npm `pretest` hooks do not fire under a single root run, so `packages:ensure` must run once up
front. `test-unit.ts` already does exactly that, for the same reason.

**Expected: 44.3s → ~13s**, then bounded by one file.

## Lever 2 — the floor file

`packages/abuddy-sdk/tests/build/generate-entries.spec.ts`, 94 tests, 13.0s. **The cost is 3 tests, not 94.**

There are exactly three `typecheck()` call sites (L428, L444, L470), all inside the describe *"generated
sends compile"*. Each runs a full `ts.createProgram` that resolves `@abuddy/sdk` under
`customConditions: ['@abuddy/source']`, so it type-checks **165 files / ~17k lines** of SDK + ears
*source* — `skipLibCheck: true` skips `.d.ts`, and the SDK is `.ts`. The other 91 tests are string and AST
assertions over generated code, together about 1s.

So **splitting by topic buys nothing**, and splitting compile-from-rest still leaves a 12s file. The fix is
amortisation: the three programs re-parse an identical graph. `root` is `mkdtempSync`'d in `beforeEach`, so
every test-specific file sits under a fresh unique path, which makes the cache rule safe by construction:

> Cache any `SourceFile` whose path is **not** under `root`; never cache one that is.

A shared `ts.CompilerHost` with that rule, plus `oldProgram` so binding is reused and not only parsing.
**Expect 13s → 5–7s** — measure rather than promise, because a cached host saves parsing while the checker
still runs per program; `oldProgram` is what recovers the rest.

Worth doing alongside, on correctness grounds rather than speed: move those 3 tests into their own file. It
is a real tier boundary — 91 pure tests, 3 that invoke a compiler.

## Combined

**44.3s → ~13s → ~9.5s**, at which point the wall is `work/cores` rather than any single file.

## Phases

1. **Extend `projects` to 8 and run one root vitest.** Keep `test-unit.ts` until the numbers are in, so the
   comparison is honest. **Done when:** root-run wall is recorded against 44.3s and the total test count
   equals the sum of the eight per-suite counts.
2. **Retire the lane scheduler** if Phase 1 wins, leaving `--maxWorkers` as the single budget. Decision 6 is
   then satisfied by construction rather than by a script.
3. **Amortise the compiler** in `generate-entries.spec.ts`, and split its 3 compiling tests out.
   **Mutation:** a type error injected into the fixture is still caught.
4. **Re-measure and record.** If Phase 1 does not win, close this plan with the measurement, as
   `goal-test-tiers.md` Phase 6 requires of parallelism work.

## Tests to run

1. **Decisive, ~2 min.** Extend `projects` to 8; `vitest run --maxWorkers=10` at the root; compare wall to
   `test-unit.ts`'s 44.3s.
2. **Correctness gate.** Root-run total test count must equal the sum of the eight per-suite counts. A drop
   means a project's `include` did not carry.
3. **Floor, ~2 min.** Add the cached host; run `generate-entries.spec.ts` alone before and after; confirm the
   asserted diagnostics are unchanged.

## Falls out of this

`generate-entries.spec.ts` imports `transformSync` from **esbuild** (L1108, in *"generated seeders"*), and
esbuild starts a child process — while `suite-split.spec.ts` reads the file as clean, because that rule looks
for `node:child_process` imports. This is a **pre-existing** second instance of the guard hole recorded in
`cli-suite-spawns-rebase.md` §3.1, not one that branch creates, and it argues for making the predicate
cost-based rather than mechanism-based.

## Relation to the other plans

- `goal-test-tiers.md` Decision 6 (one owner of concurrency) is what Lever 1 implements; Decision 11 (cache
  before parallelism) still holds, because this is not parallelism-by-lanes — it is removing a second
  scheduler.
- Phase 8's per-tier timeouts are unblocked by the same change: per-project config is where a tier budget can
  finally be expressed. `generate-entries.spec.ts` is also the file whose 5.2s test against vitest's 5s
  default caps lanes at two today, so it is implicated twice.
- `cli-suite-spawns-rebase.md` is independent: its conversions live in the integration half, which
  `test:unit` does not run.
