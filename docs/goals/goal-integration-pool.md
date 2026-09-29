# Goal: the integration halves run as one pool, at full width

> **Written in session** `acfdcbe9-f87e-4349-a1e3-a03cdf58065c` (Claude Code, 2026-09-29). Resume it with `claude -r acfdcbe9-f87e-4349-a1e3-a03cdf58065c`.

```
# Goal: the integration halves run as one pool, at full width

Implement docs/goals/goal-integration-pool.md on master, at or after 8c90bd614 — the base its
Background was surveyed at.
Before Phase 1, confirm the base: scripts/lib/chain-steps.ts exports INTEGRATION_SUITES and it
names three suites; the root test:integration script is three `-w` flags; two of the three
vitest.integration.config.ts files set maxThreads '50%'; and `npm run spec -- packages/
repo-checks/tests/import-specifiers.integration.spec.ts` prints "No test files found" and exits 1.
If any is already false, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them,
don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and
keep going. No backward compatibility in code (root CLAUDE.md, "Backward compatibility" — a
standing rule, not this goal's choice): change signatures, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward.

Every number in Background was measured 2026-09-29 on an idle 10-core machine. Re-measure before
you use one to justify a choice, and never quote file-time as if it were wall time: mistaking the
two is what left this cost unexamined for months.

Finished when:
- Phases 1-4 are implemented and each meets its "Done when"; every new guard and helper is
  mutation-checked.
- `npm run test:integration` is one vitest run over the projects INTEGRATION_SUITES names, and no
  script names those workspaces as text.
- The worker cap is either lifted after twenty clean runs or kept because one failed, with the count
  recorded. Keeping it is a valid outcome; keeping it without the count is not.
- `npm run spec -- <any integration spec>` runs it and exits 0.
- Checks: npm run typecheck; npm test -w @app/repo-checks; npm run spec-cost:check; npm run chain
  once per phase.
- A final summary: phase -> done/deferred, evidence, the conventional choices made, and the
  measured wall of `npm run chain` before and after — the chain's, not the step's.
- The doc is in docs/archive/goals/, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only
  that phase's files.
- Check `git diff --cached` and `git status` first: another agent works in this checkout and
  stages files. Commit only what this goal touched.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app without an isolated ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- edit a recorded cost by hand: packages/*/etc/spec-cost.json moves only through spec-cost:update.
- delete or skip an integration spec to make the number smaller. The cost is the point of them.
- change the pool and the worker cap in one phase. One variable at a time is what makes a birpc
  flake attributable to the thing that caused it.
```

## Background (2026-09-29, at `8c90bd614` on `master`)

`@abuddy/cli`'s integration half is 167.9s of recorded spec file-time — 53% of the repo's 315.9s, and the
largest single number in the records. It was deferred out of
[`goal-spec-earns-its-pass.md`](../archive/goals/goal-spec-earns-its-pass.md) and
[`goal-unit-suite-cost.md`](goal-unit-suite-cost.md) as "a separate look, not a blocker".

**That number is file-time summed across workers, and nobody waits for it.** Measured:

| | specs | file-time | **wall** |
|---|---|---|---|
| `@abuddy/cli` integration | 15 | 167.9s | **31s** |
| `@app/repo-checks` integration | 3 | 34.2s | **32s** |
| `@app/publish-checks` integration | 5 | 30.6s | **8s** |
| all three, as the chain runs them | 23 | 232.7s | **71s**, and 90-105s as the step measures |

So the question is not why `@abuddy/cli` is slow. It is **why 71s of work takes 90-105s, and why the step
uses half the machine to do it.**

### 1. Three specs of twenty-three spawn a compiler; all twenty-three pay for it

Two of the three `vitest.integration.config.ts` files set `poolOptions: { threads: { maxThreads: '50%' },
forks: { maxForks: '50%' } }`, justified as:

> These specs shell out to `tsc` and `abuddy build`, so every worker spawns compilers of its own. With a
> worker per core the box is oversubscribed and the main thread can miss birpc's 60s window to answer a
> worker's `onTaskUpdate`, which fails the run with "[vitest-worker]: Timeout calling" though every test
> passed.

**Half of that is no longer true.** `callCli` runs the CLI **in-process** — it `chdir`s, captures `console`,
swaps `process.exit` for a throw, and awaits the command
(`packages/abuddy-cli/tests/_support/pack-builds.ts:65`). `typecheckPack` builds a `ts.createProgram`
**in-process** (same file, line 103). Neither spawns anything.

What does spawn a compiler is three files, and only three:

| spec | spawns |
|---|---|
| `abuddy-cli/tests/commands/add-extensions.integration.spec.ts` | `tsc --noEmit` ×2, `vue-tsc --noEmit` |
| `repo-checks/tests/component-contracts.integration.spec.ts` | `vue-tsc -p` |
| `publish-checks/tests/published-exports.integration.spec.ts` | `node <tsc> -p` per consumer, per TypeScript version |

**The constraint is on the wrong axis.** What must be bounded is how many compilers run at once; what is
bounded is how many test workers exist. The proxy throttles twenty innocent specs to protect against three,
permanently, on what is usually the chain's binding lane.

**And two of the five spawns need not exist.** `add-extensions`' two `tsc --noEmit` runs are exactly what
`typecheckPack` does in-process — `ts.createProgram` over the pack's tsconfig with `noEmit` — so the same
assertion is available without a subprocess. The other three stay: `vue-tsc` needs the Vue language service,
and `published-exports` runs `CONSUMER_MATRIX` (two TypeScript versions, the workspace's and the 5.7 floor,
× two module resolutions) where the subprocess *is* the fidelity — it simulates a consumer on that compiler,
and running the floor in-process would mean two `typescript` instances in one process.

### 2. The step is three `npm -w` invocations in series

`package.json`'s `test:integration` is `npm run test:integration -w @abuddy/cli -w @app/repo-checks -w
@app/publish-checks`: three vitest startups, three worker pools, three `packages:ensure` pretests, none
overlapping. All three configs declare **identical** resolution —
`['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')]` — so unlike the unit suites,
where `host` and `pack` cannot share a process because Node conditions are per process (`UnitSuite.kind`),
these three can. The repo already pooled the unit suites for exactly this reason
([`goal-one-job-pool.md`](../archive/goals/goal-one-job-pool.md)); the integration halves were left as `-w`
flags.

### 3. It is usually the chain's binding lane

Measured across four chain runs: `t2` carried `test:integration` and bound the chain in three of them
(94.8s chain / 93.6s lane; 109.0s / 98.5s; 91.5s / 90.4s). The fourth was cold and bound by
`packages:ensure -> compile -> build:app -> test:packaged-authoring` at 116s. So most of what this goal
removes is real chain wall — and Phase 2 must confirm that on the chain's own number rather than the step's.

### What the phases are worth

| | workers | what bounds it | wall |
|---|---|---|---|
| today | 5 | three runs in series | **90-105s** |
| Phase 2, pooled | 5 | throughput, 232.7s / 5 | **~47s** |
| Phase 3, cap lifted | 9 | the longest file, 34.4s | **~34s** |
| Phase 4, that file split | 9 | throughput again | **~26.5s** |

Scheduled with LPT over the 23 recorded file times, which is the order vitest's own sequencer uses. **The
phases have to land in this order**: at 5 workers the run is throughput-bound, so splitting the longest file
moves the wall by *zero* — it only becomes the bound once the cap lifts. And **one split is the whole
prize**: splitting the top file is 34.4s -> 26.5s, the top two 26.6s, the top three 26.6s. Below that the
run is throughput-bound again at 232.7s / 9 = 25.9s, and no further splitting reaches it.

### Five hypotheses measurement killed

Recorded so nobody re-chases them. Four of the five were mine, and each looked better than what survived.

- **Per-project staleness buys almost nothing.** The obvious second phase — stamp each project and run only
  the stale ones, as `test-unit-pool.ts` does — founders on shared inputs. All three suites set
  `packages: true` in `SUITE_READS` and all three declare `abuddy-host`, `abuddy-ears` and `abuddy-sdk` as
  dependencies, so **any source edit rebuilds a package and makes all three stale**. It separates exactly one
  case, an edit confined to one workspace's *tests*, worth ~16s there and costing an extension to
  `suiteInputs` plus an inversion of `unit-pool.ts`'s deliberate by-directory stamp key.
- **There is no over-declaration in the step's inputs to exploit.** Three attempts: *move the one spec that
  reads the pack's `dist` elsewhere* — six of the 23 touch `default-setup`, not one; *drop the root
  `vitest.config.ts`, which the integration run does not load* — `harness-setup` and `dependency-runtime`
  read it as data; *declare the published trees per suite* — all three genuinely install them. The step
  re-runs on most changes because it genuinely depends on nearly everything the repo builds, and
  content-fingerprinting already spares it a rebuild that produces identical bytes.
- **`installPublishedPackages` is not the cost.** It looks like the shared expensive primitive — an `npm
  pack` and a `tar -xzf` per published tree, plus a symlink per `node_modules` entry, called from 8 specs
  across all three suites (`packages/publish-checks/src/published-packages.ts:65`). It packs **three** trees
  (`ears`, `sdk`, `ui`) and takes **1.1s**, twice measured: ~9s of 232.7s. Not worth a shared fixture.
- **The birpc timeout cannot be raised.** The obvious answer to a 60s RPC window is a longer window.
  Vitest hardcodes `DEFAULT_TIMEOUT = 6e4` in its birpc chunk and passes no `timeout` at any of its four
  `createBirpc` call sites, so no vitest config reaches it. Recorded because it is the first thing a reader
  will suggest, and it would take a patch or an upstream change rather than a setting.
- **The 34.4s file has no assertion overhead to trim.** `facade-typing.integration.spec.ts` run alone is
  23.1s, of which its eleven visible cases are 5.4s; the rest is `beforeAll` building two real packs and
  typechecking them. Its two `describe`s build independent fixtures (`buildPacks(published)` for `true` and
  `false`) in series inside one file, which is what Phase 4 acts on — the work is necessary, its
  *sequencing* is not.

### Two defects found while surveying

Neither is about speed, and both are in files this work touches.

- **`npm run spec -- <any integration spec>` runs nothing and exits 1.** `packageRun`
  (`scripts/lib/spec-plan.ts`) delegates to `npm test`, whose config `include` excludes
  `*.integration.spec.ts`, so vitest matches no file. 23 of the repo's 369 specs cannot be named. It exits 1
  rather than passing, which is why nothing caught it — and `scripts/lib/spec-cost.ts` already holds the
  mapping that fixes it (`halfOfPath`, `CONFIG_BY_HALF`).
- **`suite-timeouts.spec.ts:34` hardcodes the suite.** `stepForSpec` reads `dir === 'abuddy-cli' &&
  file.endsWith('.integration.spec.ts')` while `INTEGRATION_SUITES` derives the same set, so the 8
  integration specs in `repo-checks` and `publish-checks` are checked against `test:unit:host`'s tier budget
  instead of `test:integration`'s. A restated population where a derived one exists.

## Decisions

Final.

1. **One pooled run, with the project list derived from `INTEGRATION_SUITES`.** A root
   `vitest.integration.config.ts` whose `projects` are each package's integration config, mirroring how the
   root `vitest.config.ts` lists the unit projects. `INTEGRATION_SUITES` (`chain-steps.ts:362`) is already
   derived from which packages have that config, so a package gaining one joins the pool by existing.

2. **Keep the three per-package configs as projects** rather than collapsing them into one root `include`.
   They carry per-project `testTimeout`, which is honored where `poolOptions` is not and which
   `suite-timeouts.spec.ts` checks per tier; and `hasSplit` derives `INTEGRATION_SUITES` from their existence.

3. **`poolOptions` move to the root unchanged, at 50%, in Phase 2 — and change in Phase 3, alone.** They are
   process-wide, so the per-package values stop meaning anything and must move rather than be duplicated.
   Moving them and changing them in one phase makes a birpc flake unattributable to either, and the failure
   mode is intermittent, which is exactly when one-variable-at-a-time stops being a slogan.

4. **The `-w` check becomes a derived-on-both-sides check.** `chain-inputs.spec.ts:402` parses `-w (\S+)`
   out of the script today because an npm script is text. With the pool there are no `-w` flags: it asserts
   instead that the root config's project list equals `INTEGRATION_SUITES`. Same claim, neither side restated.

5. **The constraint belongs on compiler spawns, not on test workers — and a spawn you can delete beats a
   spawn you have to bound.** This is the goal's central correction, and its order matters: building a
   bounded-concurrency gate for a load that halves by deleting two lines is the wrong way round. So Phase 3
   deletes `add-extensions`' two `tsc --noEmit` spawns in favour of the in-process `typecheckPack` *first*,
   which takes the concurrent-compiler count from five to three across 23 files, and only then asks whether
   any cap is needed. A semaphore is the fallback, not the plan; `@abuddy/host/exclusive-lock` is the
   one-token version of it already in the tree if it comes to that.

6. **Twenty clean runs, because five would prove almost nothing.** The birpc failure is a flake, so the
   evidence is asymmetric: **one red run is decisive at any N, and clean runs only ever bound the rate.**
   What they bound it to is arithmetic, and it is worth doing before picking a number — with no failures in
   N runs, the 95% upper bound on the per-run failure rate is:

   | clean runs | rate is at most | cost at ~34s |
   |---|---|---|
   | 5 | **45%** | 3 min |
   | 10 | 26% | 6 min |
   | **20** | **14%** | **11 min** |
   | 40 | 7% | 23 min |

   Five would let a one-in-three flake through. Twenty is eleven minutes for a permanent 2x on the chain's
   binding lane. Record the count either way: "we tried it and it seemed fine" is not a result.

7. **The gate is a static rule, not a runtime one.** Because Decision 5 deletes rather than bounds, what
   has to hold afterwards is a property of the tree: **no integration spec spawns a compiler outside a
   recorded exception list**, and each entry names a real path, the shape `repro`'s exception list already
   has here — *"each must still name a path the check looks at, or it is dead text reading as coverage"*. A
   source-reading spec in `@app/repo-checks`, not a rule in `check:specifiers`, which is about import
   specifiers. Its firing case is one line: add a spawn and watch it fail. It keeps working whether or not a
   semaphore is ever built, where a check on a semaphore nobody built would be dead the day it landed.

8. **Nothing is deleted or skipped to make the number smaller.** These specs build real packs with the real
   CLI and typecheck them; the pack layout they cover is the only one a pack author ever has. The cost is
   what they are for.

9. **Success is measured on `npm run chain`'s wall, not the step's — and no artifact records it.** The step
   is usually but not always the binding lane, and a step that got faster inside a lane that did not is a
   number with no user. Quote the chain, and never quote spec file-time as a cost again.

   The tempting next move is a recorded chain-wall artifact so "before and after" is a command rather than a
   stopwatch. **Don't.** That is a *sample*, and the root `CLAUDE.md` now carries what samples cost: 125 of
   163 `spec-cost.json` entries changed between two idle runs, and it took hysteresis, a band and a
   contention refusal before it could be trusted. All of that, for a question asked twice a year. The
   Done-when already requires the chain's wall before and after, and the `/goal` hook checks Finished-when
   from the transcript — enforced by the mechanism that exists.

## Phases

### Phase 1 — the two defects, which the derivation needs anyway

Independent of the pooling and landable first; Decision 4 leans on `INTEGRATION_SUITES` being the one
definition, and one of these defects is a second definition of it.

- `scripts/lib/spec-plan.ts`: `packageRun` routes a named spec by its half, through that package's
  `test:integration` script for an integration spec. Reuse `halfOfPath` and `CONFIG_BY_HALF`
  (`scripts/lib/spec-cost.ts`) rather than adding a third copy of the mapping.
- `packages/repo-checks/tests/suite-timeouts.spec.ts`: `stepForSpec` derives the integration set from
  `INTEGRATION_SUITES` instead of naming `abuddy-cli`.

**Done when:** `npm run spec -- packages/repo-checks/tests/import-specifiers.integration.spec.ts` runs it and
exits 0; a fast spec in the same package is unchanged; cases in `spec-plan.spec.ts` for both halves.
Mutation: routing an integration spec to the default config fails the new case, and attributing one to
`test:unit:host` fails the timeout budget check.

### Phase 2 — one pooled run, same width

- Root `vitest.integration.config.ts` per Decisions 1-3; root `test:integration` runs it; the per-package
  `poolOptions` move to it **unchanged at 50%**.
- `chain-inputs.spec.ts:402` per Decision 4.
- Audit the two `process.cwd()` uses in `add-extensions` and `add-feature-validate` before running anything.
  `callCli` chdirs because the CLI's commands read `process.cwd()`, so cwd is already load-bearing here and
  a pooled run is where a stray assumption surfaces confusingly.

**Done when:** `npm run test:integration` is one vitest invocation; its wall is recorded against 71s of
vitest and the step's 90-105s, and `npm run chain`'s wall against its own. Expect ~47s, throughput-bound.
The derived-project-list case passes; mutation: dropping a suite from the root config's projects fails it.

### Phase 3 — put the constraint on the right axis

Three steps, in this order, because each one makes the next cheaper to judge (Decision 5).

- **Delete the two deletable spawns.** `add-extensions`' two `tsc --noEmit` runs become `typecheckPack`, the
  same assertion in-process. Concurrent compilers go from five to three across 23 files before anything is
  measured.
- **Then lift the root cap** to vitest's default and run the pooled suite **twenty times** (Decision 6). One
  failure settles it; twenty clean runs bound the rate at 14%, and five would have bounded it at 45%.
- **Then the gate** (Decision 7): a `@app/repo-checks` spec holding integration specs to spawning no compiler
  outside a recorded exception list, each entry naming a real path. It lands whether the cap was lifted or
  kept — it is what stops the count creeping back to five.
- If the cap has to stay, bound the three spawns rather than the twenty other specs, and lift it behind that.

**Done when:** the two spawns are gone and `add-extensions` still fails on a type error it used to catch —
watch it fail, since replacing an assertion's mechanism is exactly where one quietly stops asserting. The cap
is lifted or kept with its run count recorded in the phase and in the config's comment, whose current text
("these specs shell out to `tsc` and `abuddy build`") is wrong either way and is replaced by what is true.
Expect ~34s, now bounded by the longest file. Mutation: a spawn added to an integration spec fails the new
check, and removing an exception's path from the tree fails it too.

### Phase 4 — the floor

Only meaningful once Phase 3 has moved the bound onto a single file.

- Split `facade-typing.integration.spec.ts` at its `describe` boundary so its two independent fixtures build
  concurrently in two files rather than in series in one. Its path under `tests/` still has to mirror what it
  covers (`docs/reference/test-inventory.md`).
- **Split that file and no other.** Vitest parallelizes per file and runs suites within a file in series, so
  what is being fixed is one file doing two fixtures' work — not a package's tests sharing a file, which they
  already do not: the CLI's integration half is 15 files. The schedule says the second and third splits are
  worth 0.0s and 0.0s, so stop after the first, and re-measure rather than continuing on the intuition that
  smaller files must be faster.

**Done when:** the pooled wall is recorded again and the suite is throughput-bound rather than file-bound, or
the phase records that splitting did not move it and says by how little. `spec-cost:update` re-records both
files; never edit the record by hand.

## Deferred

- **Per-project staleness.** Killed by measurement, see Background. Do not re-propose it without first
  showing that the three suites can go stale independently.
- **Narrowing the step's inputs.** Three attempts, all dead, see Background.
- **Caching `installPublishedPackages`.** 1.1s across 8 call sites.
- **The overlap with `test:external-pack:contract`.** That step is 57s, also tier 2, and also builds fixture
  packs with the real CLI; together with this one that is ~150s of tier-2 pack-building per chain. Whether
  they duplicate work is unexamined and is the next question if the chain needs to be materially cheaper.
  Out of scope here, and worth its own survey rather than a guess.
- **The rest of `goal-unit-suite-cost.md`**, which aims at the `test:unit` halves.

## Constraints

- Commit each phase as it finishes, no attribution lines; `git diff --cached` and `git status` first, and
  `git commit -- <paths>` naming only that phase's files — another agent commits in this checkout. Pushing,
  tagging and PRs are on request only.
- No publishing, releases or triggered workflows; dry runs only.
- No real data dirs (`~/Library/Application Support/abuddy*`), no broad `pkill`/`killall`; the app launches
  only with an isolated `ABUDDY_USER_DATA_DIR`.
- No bare `tsc` in `packages/preload`, no `npm install` in the example pack, no version or release metadata.
- The typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- No backward-compat shims: change the signature and migrate every in-repo caller, test, fixture and doc in
  the same change.
- Investigate a failing test rather than loosening it; every new guard and helper gets a mutation check.
- Recorded artifacts move only through their `:update` half: `packages/*/etc/spec-cost.json` through
  `spec-cost:update`, never by hand. A pooled run prefixes each file with `|project|`, which
  `scripts/spec-cost.ts`'s `FILE_LINE` already reads.
- Never quote file-time as wall time. They differ by 3-5x here, and conflating them is why this cost sat
  unexamined for months.
