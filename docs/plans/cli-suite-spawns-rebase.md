# Handoff: `AS/cli-suite-spawns` → `faee075fd`

From the session implementing `docs/goals/goal-cli-suite-spawns.md`. You own the suite split, the
chain graph and `suite-split.spec.ts`; this touches all three. Nothing here is committed to your
branches and nothing has been pushed.

---

## 1. What this branch is

`AS/cli-suite-spawns`, 7 commits (5 code, 2 doc), currently based on **`4ed04f144`**.

The goal it implements says *"on master, at or after ee0611269"* and names no branch. When I started,
the checkout sat on `AS/test-cleanup` at `4ed04f144`; `master` and `ee0611269` were both ancestors, so
the base check passed and I branched from HEAD. Two things were true that I read wrongly:

- the goal doc itself lived on `AS/test-pipeline` (`d890cf4f6`), not on my base — I restored it into my
  branch rather than treating its absence as "wrong branch";
- `AS/test-cleanup` has since been rebased, so `4ed04f144` is no longer an ancestor of anything live.

`AS/test-cleanup` and `AS/test-pipeline` have since converged on `faee075fd`, so "which of the two" no
longer distinguishes anything. The base was wrong; the work is not lost — see §4.

## 2. What the branch changes

All inside `packages/abuddy-cli/tests/**`. No production source.

| Commit | Change |
|---|---|
| `322a387f6` | Labels all **32** spawn sites with a reason: 14 `produces`, 8 `process`, 3 `typecheck`, 7 `inherent` |
| `53b89e1a8` | The 14 `produces` sites call a new `callCli()` in-process instead of `node bin/abuddy.mjs` |
| `78eb73233` | The 3 `run(TSC, …)` sites call a new `typecheckPack()` (TypeScript API); both `TSC` constants deleted |
| `41f6073c6`, `70a1e4cea`, `2f3e7613e` | The goal doc's outcome |

Two helpers were added to `tests/helpers/pack-builds.ts` — a file that is **byte-identical** between my
base and `faee075fd`, so they land on unchanged content.

`callCli` chdirs and restores (the commands read `process.cwd()`, not a root) and swaps `process.exit`
for a throw (a failing command would otherwise take the vitest worker with it). Both are safe only
because vitest forks a process per file and runs its tests in sequence.

Coverage is unchanged: 764 tests before, 764 after. Both helpers are mutation-checked.

## 3. Findings that bear on your work

**3.1 — My change opens a hole in `suite-split.spec.ts`. This is the important one.**

Your check classifies a helper export as spawning by textual fixed point over *that module's own*
declarations, and does not follow into `src/commands/`. So:

- before: `buildPack` → `run(process.execPath, [CLI, 'build'])` → reads as spawning. Correct.
- after:  `buildPack` → `callCli(dir, 'build')` → reads as **non-spawning**.

But `callCli('build')` loads esbuild, and esbuild's Node API starts a child process. Measured, not
assumed — a probe importing `esbuild` and calling `transform()` starts exactly one child:
`node_modules/@esbuild/darwin-arm64/bin/esbuild`.

So after this branch your guard would call a spawning helper clean. **No spec flips today** — all four
converted files are already `*.integration.spec.ts` — so this is prospective, not a live break. But it
is the erosion the check exists to stop.

**3.2 — The same change decouples "slow" from "spawns", which is the predicate your split uses.**

`facade-typing.integration.spec.ts` is the largest file in the suite (48.4s) and after this branch has
**zero** spawn call sites. It stays in the integration half only because line 1 still imports
`execFileSync` directly. The conversions produce specs that are slow *in-process* — `ts.createProgram`,
esbuild, vite — so "spawns" is no longer a reliable proxy for "slow". Mechanism was a good proxy while
spawning was the only way to be slow; this work ends that. Worth a decision, and it's your call.

**3.3 — The suite is bound by cores, not process starts — a third measurement for Decision 11, and it needs
redoing on your base.**

Measured on my base: the four converted files lost 26s (128.5s → 102.6s, ~20%), and the CLI suite's total
moved 1.7s and its wall 0.5s on a 59s wall. The rest of the suite absorbed the freed capacity.

This is a **third** confirmation of Decision 11 / Phase 6, and it is a different kind from the first two.
Those measured *between* steps — lanes made total work rise 348s → 567s. This measures *within* one suite:
hand 26 seconds back and the same suite eats them. `test-unit.ts`'s own table says the same thing from a
third angle (lanes 2 = 44.3s, lanes 3 = 47.7s — slower before the failure is even counted). Phase 6 says the
honest outcome may be to leave it serial and record that; this is evidence for recording it.

Three reasons not to trust my number against `faee075fd`:

- it was measured on the *combined* 70-file suite, which no longer exists;
- it was measured at `maxThreads: '50%'` — the cap that now lives only in
  `vitest.integration.config.ts`, justified as *"spawning is what makes it necessary."* This branch
  removes 17 spawns from exactly that suite, so **the change is the thing that would justify relaxing
  the cap, and I measured with the cap held fixed.** That experiment is unrun and is two runs and one
  toggle;
- your `test-unit.ts` runs 2 lanes; mine ran serially.

**Where this branch's value actually lands in your model:** `test:integration` is **tier 2**, and Decision 5
gives tier 2 per-check caching. So this work does not make a cached run faster — nothing does — it makes the
**cache miss** cheaper, on the one step whose misses will be most common while pack tests churn.

**3.4 — The 5s default is a 374-test problem, and it is what caps `test:unit` at two lanes.**

`test-unit.ts` already names the symptom: lanes 3 fails on `@abuddy/sdk`'s *"generated sends compile"*,
which takes 5.2s against vitest's 5s default. I hit that same test, and `abuddy-cli`'s
`import-specifiers > findInternalPackageImports > holds for the repo`, which takes **2445ms on an idle
machine** — half its budget spent, so any 2× slowdown fails it.

What I can add is the **scope**. Across `abuddy-cli` and `abuddy-sdk`, **374 tests in 29 spec files do heavy
work (spawn or compile) with no explicit timeout**:

```
  94 unguarded   abuddy-sdk/tests/build/generate-entries.spec.ts      <- the one that caps lanes at 2
  73 unguarded   abuddy-cli/tests/build/import-specifiers.spec.ts     <- 2445ms of a 5000ms budget
  62 unguarded   abuddy-cli/tests/cli/db.spec.ts
  40 unguarded   abuddy-cli/tests/build/package-freshness.spec.ts
```

`abuddy-cli` currently compensates with **97 hand-written per-test timeouts** — the ones nobody remembered
are the flakes. That is a pit of failure in the precise sense: the default is wrong for what these tests do,
and the correction must be remembered at every one of 471 call sites.

**Note this does not mean copying `testTimeout: 120_000`.** Decision 7 and Phase 8 say the opposite — delete
the two that exist, because two minutes on a unit suite turns a hang into a slow pass. The point is that your
fast/integration split has *already created the structure Decision 7 needs*: the fast config is tier 1 and
wants seconds, the integration config is tier 2 and wants tens of seconds. Two config lines now express a
per-tier budget that previously had nowhere to live.

Expect flake elimination, not speed: your own lanes table shows 3 lanes slower than 2 even discounting the
failure, which is the same saturation 3.3 found.

**3.5 — The suite repairs its own inputs, which hides failures.**

A run that bypasses `pretest` (`npx vitest` directly) hits the staleness guard in
`published-packages.ts:39` and fails ~21 files — then the specs that spawn the CLI rebuild the stale
packages as a side effect, and a retry goes green with nothing changed. I hit this exactly once and lost
a measurement to it. This branch removes 17 of the spawns that did the repairing, which makes honest
failure *more* likely, not less.

**3.6 — An orphaned process was skewing every measurement, and it was outside Phase 8's scope.**

`abuddy generate-entries`, PID 83105, parented to init, 98.5% of a core, running **34 hours**. Killed. It
was also running when this goal's original baseline (182.6s) was taken, which is part of why that number
never reproduced — and it means any measurement taken on this machine in the last day and a half is a core
light.

Phase 8 already has *"Reap the process group on exit"*, scoped to `tests/scripts/`. **This orphan was not a
shell test script** — it was `npm exec abuddy generate-entries`, a CLI invocation whose parent shell died.
So the bound Phase 8 describes would not have caught it, and the scope wants widening to any long-running
`abuddy` invocation, or an `abuddy doctor` that reaps what `@abuddy/host/process-liveness` can already
identify (`lockIsHeld`, `recordIsStale`).

## 4. Merge state

`git merge-tree faee075fd AS/cli-suite-spawns` → **one conflict**:

```
CONFLICT (add/add): docs/goals/goal-cli-suite-spawns.md
```

Self-inflicted: I restored the doc from `d890cf4f6` while your tip has its own copy. **All code merges
clean**, and rename detection lands the edits on the renamed files — the merged
`scaffold.integration.spec.ts` carries 12 `callCli`/`typecheckPack` references, `pack-builds.ts` carries
both helpers.

Two files drifted on your side inside regions I edited, and want a read after the rebase rather than
trust in the textual merge:

- `facade-typing`: −4 lines (two `@ts-expect-error` / `findAll` pairs in the CONSUMER fixture)
- `scaffold`: −1 assertion on `services.ts`; the nested-vitest assertion loosened from
  `Tests\s+3 passed` to `\d+ passed` plus `not.toMatch(/failed/)`. I converted the `add service` site
  whose assertion you deleted, so that hunk is the one to look at.

## 5. Plan

1. Tag `pre-rebase-cli-spawns` for recovery.
2. Rebase onto `faee075fd`; resolve the doc conflict by taking your copy and re-appending the outcome
   sections.
3. Verify nothing was dropped: 32 labelled sites, 0 unlabelled, `8 process / 7 inherent` remaining;
   read the two drifted hunks in §4.
4. Close 3.1 — a correctness regression in your guard, ahead of any perf question.
5. Re-verify: fast suite, `test:integration`, `suite-split.spec.ts`, `typecheck`, `chain`.
6. Re-measure against **`test:integration`** (tier 2), not `test:unit`. The existing outcome tables get
   deleted, not amended — they describe a suite that no longer exists.
7. Run the unrun experiment: `test:integration` at 50% vs 100% workers.

## 6. Decisions needed from you

**A. `suite-split.spec.ts` and 3.1.** Four ways, your call:

1. follow the analysis into `src/commands/` — faithful, classifies `callCli` as spawning (which is true),
   costs a cross-package traversal in a test;
2. declare it at the helper — a marker on `callCli`/`buildPack` the analysis honours, with a comment
   that esbuild spawns underneath; cheap, keeps the "no edit needed" property everywhere else;
3. change the predicate from mechanism to measured cost — survives 3.2, largest change;
4. document and accept — nothing flips today, leaves the trap armed.

**B. The goal doc.** Your copy is authoritative; I only ever appended. Take yours wholesale and
re-append, or do you want to see the diff first?

**C. Does Phase 8 want the 374-test inventory now?** Decision 7 already owns per-tier timeouts, and your
split just created the two configs that can express them. The inventory in 3.4 is the list Phase 8 would
otherwise have to rebuild, and the `generate-entries` entry is the one blocking a third lane. It lands in
configs you just wrote, so it is yours to sequence — I can hand over the file list, or leave it in the goal.

**D. Should 3.6 widen Phase 8's reaping scope?** As written it covers `tests/scripts/`; the 34-hour orphan
came from a bare CLI invocation and would have survived it.
