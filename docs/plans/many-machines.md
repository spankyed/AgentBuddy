# Many machines: the cost model is single-machine

## Problem

Every tolerance in the chain is a fraction, and every cost is a second. The fractions travel; the seconds
do not. One machine has hidden the difference, and the first second machine — a new developer's laptop, or
the CI runner whose triggers are commented out — meets all of it at once.

### What travels and what does not

| Portable (relative) | Machine-bound (absolute) |
|---|---|
| `IDLE_FLOOR` 0.7, `SETTLED_FRACTION` 0.35 | `MEASURED_AT_CORES` 10 |
| `DRIFT_SHARE` 0.15, `CONTENDED_SHARE` 0.25 | 29 `seconds` values + `POOL_SECONDS` |
| `--cores`, defaulting to `box()` | `SIZE_MS` 15s / 60s |
| `POOL_WIDTH`'s shares (`{ share: 0.5 }`, `UNCAPPED`) | spec half edges 1000 / 2500ms, over 389 recorded specs |

**`AS/chain-core-budget` made the *scheduler* machine-relative and left the *cost model* machine-absolute.**
That is the asymmetry this plan is about. The budget is a share of whatever box it finds; the costs it
schedules are seconds measured on one.

### The root cause

**Wall-clock time is recorded as a property of the code. It is a property of code x machine x load.**

It cannot be patched in place, because the five consumers of those numbers need different precision:

| consumer | needs | portability |
|---|---|---|
| `budgetFor` -> a step's kill deadline | an order of magnitude | **required** — a spurious kill is a broken build |
| `sizeOf` -> `SIZE_MS` test timeout | an order of magnitude | **required** |
| `spec-cost` -> which half a spec runs in | a binary, with a wide band | **required** |
| `criticalPath` -> the floor line | this machine's numbers | local |
| `driftReport` -> "re-measure, or record" | this machine's numbers | local |

Three need portability and two are inherently local. One number serving all five is the defect.

### The invariant

> **A number measured on one machine may inform a report. It may never decide whether work survives.**

That sorts every row above without consulting the table, and it applies to the next number someone adds:
*does this kill or block anything?* If it does, it cannot be a measurement.

### What breaks, concretely

**A flaky kill in CI, not a clean failure.** `ci.yml` runs on `macos-14`, a hosted runner with a fraction
of this box's ten cores (confirm the count before relying on the arithmetic below). Nine chain steps have a
real deadline and all nine sit at exactly four times their recorded cost:

```
test:packaged-authoring   91s declared -> 364s deadline
test:integration          60s         -> 240s          5 workers here, ~2 there
test:unit:host            42s         -> 168s          9 workers here, ~2 there
build:app                 39s         -> 156s
test:external-pack:contract 36s       -> 144s
```

A pool that drops from nine workers to two is three to four times slower, which puts `test:unit:host` at
130-170s against a 168s deadline. That is the worst failure shape available: intermittent, and it looks
like the code.

**Nobody else can maintain the table.** `--record` refuses unless `box() === MEASURED_AT_CORES`
(`isMeasuredSchedule`), so a second developer can neither record their own numbers nor fix stale ones. A
recorded artifact one machine can write is not a shared artifact.

**Permanent noise for everyone else.** `box() !== MEASURED_AT_CORES` prints on every run on any other
machine, and the drift report fires on most steps — correctly, and uselessly, since the advice it gives
cannot be taken there.

**`spec-cost:check` fails for everyone else.** 363 specs are recorded in the fast half against a 2500ms
integration edge. At three times slower, **32 of them cross it** (20 at 2x, 39 at 4x), and the check fails
on a single spec in the wrong half. *Measured 2026-10-03; an earlier estimate of "most" was wrong and is
corrected here.*

### What is not the problem

The scheduler. `--cores` defaults to `box()`, `POOL_WIDTH`'s pool entries are shares, and the two bundler
entries are absolute *on purpose* — a bundler on fixed work uses about the same cores on any box, which is
why `PoolWidth` distinguishes `{ share }` from `{ cores }`. None of that needs changing.

**And the scheduler never reads a cost.** `chain-schedule.ts` declares `seconds?: number` on its step
interface and nothing reads it: admission is `cores`, `dependsOn` and `conflicts`. So coarsening the
deadlines below has no scheduling consequence — there is no ordering to get worse — which is what makes (1)
a safe change rather than a trade.

## The committed work

### 1. Deadlines become buckets, not multiples of a measurement

**The one that must land before a second machine**, because it is the only one that breaks a build rather
than printing noise.

The repo already has this pattern and already cites the source. `SIZE_MS`'s doc names Bazel's `size` as
*"a bucket whose whole purpose is a default timeout"*, and which bucket a test file lands in is **derived**
by `sizeOf` (`scripts/lib/test-timeouts.ts`) rather than declared. Chain steps are the one place that did
not follow: `budgetFor(seconds)` multiplies a measurement by four.

Replace that with a coarse bucket per step, chosen for the slowest plausible machine rather than measured
on the fastest. Bazel's own ladder is 60 / 300 / 900 / 3600s and is a reasonable starting shape.

It is cheap, and the reason is measured: **20 of the 29 steps already sit on `budgetFor`'s 60s floor**, so
the table's precision is doing nothing for two thirds of them. Only the nine above need a bucket.

What a bucket loses is the "this step grew" signal. That signal belongs to `driftReport`, not to the
killer, whose only job is to notice a wedge — and 900s says "wedged" as well as 364s does.

**Done when** no `boundedSpawn` deadline anywhere is a function of a recorded measurement. That is
greppable, so it is what a spec should assert rather than a reviewer remember.

### 2. The local record stops being everyone's warning

After (1), `seconds` has only local consumers: the critical-path line and the drift report. So it should
stop being a fact that one machine maintains and every other machine is warned about on every run.

Two shapes, in increasing order of what they buy:

- **Silence, not warning.** On a machine that is not `MEASURED_AT_CORES`, the drift report and the
  critical-path floor say nothing rather than reporting a schedule they cannot describe. Smallest change;
  a second developer gets a quiet chain and no diagnostics.
- **A local override.** `--record` writes to an untracked per-machine file when the box differs, and the
  committed table stays the reference. Everyone gets a drift report about their own machine; the committed
  artifact stays a single reviewable diff. This is the committed-baseline-plus-local-rebaseline pattern
  `criterion` and `cargo bench` use, and it is what makes the record usable by a team rather than merely
  quiet. **The place is settled by precedent rather than invention**: the chain's own stamps and every
  `tsBuildInfoFile` already live under `node_modules/.cache/`, per machine and uncommitted, which is what a
  per-machine measurement is.

**Done when** a run on a machine that is not `MEASURED_AT_CORES` prints no instruction it cannot follow, and
a spec asserts both halves — the instruction on the reference box, its absence off it. The numbers are not
the thing to silence; the advice is.

### 3. CI may fail a check, never a clock

Write the rule down, because it is the thing that keeps (1) and (2) from being re-litigated the first time
a runner is slow. In CI: deadlines from buckets, `--record` refused (it already is), drift report and
critical-path floor silent. Hosted runners are small and noisy; gating on wall-clock there manufactures
flakes that read as code failures.

## Declined for now, with the condition that would change it

**Calibration — recording costs in a machine-independent unit.** This branch proved the instrument:
CPU time over wall time gave a reproducible 1.6 and 2.2 cores for `compile` and `build:app` across two runs
each, where sampling the machine's idle gave 1.8 on one run and 2.7 on the next. So core-seconds are
measurable and far more portable than wall-clock.

Declined because the decisions these numbers inform — which bucket, which half — are coarse enough that
(1) and (2) close them, and a calibration factor is a second thing to keep true. **Revisit if a consumer
appears that needs a portable number rather than a portable decision.**

**Scaling the deadlines by `MEASURED_AT_CORES / box()`.** The obvious shortcut, and wrong in both directions
at once: the single-threaded `tsc` legs barely scale with cores while the pools scale nearly linearly, so one
multiplier masks a real hang on a large box and still fires on a small one. Named here because it is what the
next reader of "the deadlines are ten-core deadlines" will reach for.

## Open question

**`spec-cost`'s half edges.** 1000 / 2500ms over 389 specs is the largest remaining absolute, and (1) and
(2) do not touch it. The portable formulation is a ratio to the suite's own median rather than a fixed
millisecond edge — a spec that takes four times the median is in the slow half on any machine. Worth
naming now; it needs its own measurement, because the band has to be wider than the movement a
re-measurement produces or a spec is told to move in both directions at once, which this record has
already done once.

**Done when** scaling every cost in a fixture record by three changes no spec's half — the property a
millisecond edge cannot have and a ratio can.
