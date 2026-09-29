# Goal: the integration halves run as one pool, and pay only for what changed

> **Written in session** `acfdcbe9-f87e-4349-a1e3-a03cdf58065c` (Claude Code, 2026-09-29). Resume it with `claude -r acfdcbe9-f87e-4349-a1e3-a03cdf58065c`.

```
# Goal: the integration halves run as one pool, and pay only for what changed

Implement docs/goals/goal-integration-pool.md on master, at or after 8c90bd614 — the base its
Background was surveyed at.
Before Phase 1, confirm the base: scripts/lib/chain-steps.ts exports INTEGRATION_SUITES;
scripts/lib/unit-pool.ts exports poolStampFor, poolUnitFor and whyItRuns; the root
test:integration script is three `-w` flags; and `npm run spec -- packages/repo-checks/
tests/import-specifiers.integration.spec.ts` prints "No test files found" and exits 1. If any is
already false, stop and say so — the plan was surveyed somewhere else.
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
- A change inside one integration suite runs that suite's project and says why; the others are
  reported as cached.
- `npm run spec -- <any integration spec>` runs it and exits 0.
- Phase 4 records a measurement and the decision it made, including "neither lever is worth it" if
  that is what it found.
- Checks: npm run typecheck; npm test -w @app/repo-checks; npm run spec-cost:check; npm run chain
  once per phase.
- A final summary: phase -> done/deferred, evidence, the conventional choices made, and the
  measured wall time of the step before and after.
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
- raise maxThreads in Phase 1. It is Phase 4's lever and only with the measurement that earns it.
```

## Background (2026-09-29, at `8c90bd614` on `master`)

`@abuddy/cli`'s integration half is 167.9s — 53% of the repo's 315.9s of recorded spec file-time, and the
largest single cost in the repo's specs. It was deferred out of
[`goal-spec-earns-its-pass.md`](../archive/goals/goal-spec-earns-its-pass.md) and
[`goal-unit-suite-cost.md`](goal-unit-suite-cost.md) as "a separate look, not a blocker".

**That framing is wrong, and correcting it is most of what this goal is about.** 167.9s is *file-time summed
across workers*, which is nobody's wait. Measured:

| | specs | file-time | **wall** |
|---|---|---|---|
| `@abuddy/cli` integration | 15 | 167.9s | **31s** |
| `@app/repo-checks` integration | 3 | 34.2s | **32s** |
| `@app/publish-checks` integration | 5 | 30.6s | **8s** |
| all three, as the chain runs them | 23 | 232.7s | **71s**, and 90-105s as the step measures |

So the question is not why `@abuddy/cli` is slow. It is **why 71s of work takes 90-105s, and why it runs at
all when one of the three changed.**

### 1. The step is three `npm -w` invocations in series

`package.json`'s `test:integration` is `npm run test:integration -w @abuddy/cli -w @app/repo-checks -w
@app/publish-checks`. Three vitest startups, three worker pools, none overlapping, plus three `packages:ensure`
pretests.

Nothing keeps them apart. All three `vitest.integration.config.ts` files declare **identical** resolution —
`['@abuddy/source', ...defaultServerConditions.filter((c) => c !== 'module')]` — so unlike the unit suites,
where `host` and `pack` cannot share a process because Node conditions are per process (`UnitSuite.kind`),
these three can.

Two of the three set `poolOptions: { threads: { maxThreads: '50%' }, forks: { maxForks: '50%' } }` and carry
the reason: these specs spawn `tsc` and `abuddy build`, and an oversubscribed box makes the main thread miss
birpc's 60s window to answer a worker, failing a run in which every test passed. `@app/repo-checks` sets no
cap.

**The repo has already solved this shape.** `test:unit:host` and `test:unit:pack` are one vitest run per pool
with per-project stamps — `scripts/lib/unit-pool.ts`, `scripts/test-unit-pool.ts`,
[`goal-one-job-pool.md`](../archive/goals/goal-one-job-pool.md). The integration halves were left behind as
`-w` flags.

### 2. Any package's `dist` re-runs all three

`chain-steps.ts:522` declares the step's inputs as `[...ROOT, ...INTEGRATION_SUITES.flatMap(workspace),
...PACKAGE_BUILD_OUTPUTS, ...PACK_OUTPUTS]` — the union across three workspaces plus every published
package's `dist`. The step *is* cached, and it is invalidated by most changes, because editing any `@abuddy`
source rewrites a `dist` that `packages:ensure` or `compile` then republishes.

The unit pool already separates these two things: the step's inputs are the union, and inside it
`test-unit-pool.ts` asks `suiteInputs` per project and passes `--project` for only the stale ones. The
integration step has no inside.

### 3. It is often the chain's binding lane

Measured across four chain runs today: `t2` carried `test:integration` and bound the chain in three of them
(94.8s chain / 93.6s lane; 109.0s / 98.5s; 91.5s / 90.4s). The fourth was a cold run bound by
`packages:ensure -> compile -> build:app -> test:packaged-authoring` at 116s. So the wall this goal removes
is mostly real chain wall, not lane slack — but Phase 2's measurement has to confirm that rather than assume
it.

### Two hypotheses measurement killed

Recorded so nobody re-chases them:

- **`installPublishedPackages` is not the cost.** It looks like the shared expensive primitive: 5 `npm pack`s,
  a `tar -xzf` each, and a symlink per `node_modules` entry (`packages/publish-checks/src`, line 65), called
  from 8 specs across all three workspaces. It is **1.1s**, twice measured, so ~9s of 232.7s. Caching it is
  not worth the shared-fixture complexity.
- **The 34.4s file is ~85% `beforeAll`.** `tests/build/facade-typing.integration.spec.ts` run alone is 23.1s,
  of which its eleven visible cases are 5.4s; the rest is two real `abuddy build`s and the tsc runs over
  them. There is no assertion overhead to trim, and its two `describe`s build independent fixtures
  (`buildPacks(published)` for `true` and `false`) in series inside one file.

### Two defects found while surveying

Neither is about speed, and both are in the files this work touches.

- **`npm run spec -- <any integration spec>` runs nothing and exits 1.** `packageRun`
  (`scripts/lib/spec-plan.ts`) delegates to `npm test`, whose config `include` is
  `tests/**/*.spec.ts` minus `*.integration.spec.ts`, so vitest matches no file. 23 of the repo's 369 specs
  cannot be named. It exits 1 rather than passing, which is why nothing caught it — and
  `scripts/lib/spec-cost.ts` already holds the mapping that fixes it (`halfOfPath`, `CONFIG_BY_HALF`).
- **`suite-timeouts.spec.ts:34` hardcodes the suite.** `stepForSpec` reads `dir === 'abuddy-cli' &&
  file.endsWith('.integration.spec.ts')` while `INTEGRATION_SUITES` derives the same set, so the 8 integration
  specs in `repo-checks` and `publish-checks` are checked against `test:unit:host`'s tier budget instead of
  `test:integration`'s. A restated population where a derived one exists.

## Decisions

Final.

1. **One pooled run, with the project list derived from `INTEGRATION_SUITES`.** A root
   `vitest.integration.config.ts` whose `projects` are each package's integration config, mirroring how the
   root `vitest.config.ts` lists the unit projects. `INTEGRATION_SUITES` (`chain-steps.ts:362`) is already
   derived from which packages have that config, so a package gaining one joins the pool by existing.

2. **`maxThreads: '50%'` at the root, and nowhere else.** `poolOptions` are process-wide, so the per-package
   values stop meaning anything and must move rather than be duplicated. 50% is what two of the three already
   ask for, and pooling does not raise the load: one pool of five is what three pools of five in series
   already put on the box. `@app/repo-checks`, uncapped today, drops to five workers over three files, which
   cannot matter. **Raising it is Phase 4's business, not Phase 2's.**

3. **Per-project `testTimeout` stays in each package's config.** Per-project *test* config is honored where
   `poolOptions` is not, and `suite-timeouts.spec.ts` already checks those budgets per tier.

4. **The `-w` check becomes a derived-on-both-sides check.** `chain-inputs.spec.ts:402` parses `-w (\S+)` out
   of the script today because an npm script is text. With the pool there are no `-w` flags: it asserts
   instead that the root config's project list equals `INTEGRATION_SUITES`. Same claim, and neither side is
   restated.

5. **Reuse `unit-pool.ts` rather than write a second pool.** `poolStampFor`, `poolUnitFor`, `whyItRuns`,
   `projectsThatRan` and `projectsThatDidNotRun` are the right shape already, and `INTEGRATION_SUITES` is a
   filter of `UNIT_SUITES`, so the types fit without widening.

6. **A stamp is keyed by suite *and half*.** `unit-pool.ts` keys by directory and says so deliberately —
   *"what a suite verified does not depend on which pool process ran it"*. That held while `host` and `pack`
   ran the same spec files under different resolution. A half runs *different files against a different
   config*, so a suite can be stale for one half and fresh for the other, and one key would report the
   integration half fresh because its unit half just ran. The key becomes `<dir>.<half>`, and that doc comment
   is rewritten with this reason — not quietly inverted.

7. **Phase 4 decides its own fix from a measurement, and is allowed to decide against both.** After pooling,
   232.7s over five workers is 46.5s and the longest single file is 34.4s, so the run is *throughput-bound*
   rather than file-bound — and which of those two it actually is decides which lever applies. Naming the fix
   now would be guessing.

8. **Nothing is deleted or skipped to make the number smaller.** These specs build real packs with the real
   CLI and typecheck them; the pack layout they cover is the only one a pack author ever has. The cost is what
   they are for.

## Phases

### Phase 1 — the two defects, which the derivation needs anyway

Independent of the pooling and landable first; Decision 4 leans on `INTEGRATION_SUITES` being the one
definition, and one of these is a second definition of it.

- `scripts/lib/spec-plan.ts`: `packageRun` routes a named spec by its half, through that package's
  `test:integration` script for an integration spec. Reuse `halfOfPath` and `CONFIG_BY_HALF`
  (`scripts/lib/spec-cost.ts`) rather than adding a third copy of the mapping.
- `packages/repo-checks/tests/suite-timeouts.spec.ts`: `stepForSpec` derives the integration set from
  `INTEGRATION_SUITES` instead of naming `abuddy-cli`.

**Done when:** `npm run spec -- packages/repo-checks/tests/import-specifiers.integration.spec.ts` runs it and
exits 0; a fast spec in the same package is unchanged; cases in `spec-plan.spec.ts` for both halves.
Mutation: routing an integration spec to the default config fails the new case, and attributing one to
`test:unit:host` fails the timeout budget check.

### Phase 2 — one pooled run

- Root `vitest.integration.config.ts` per Decisions 1-3; root `test:integration` runs it; the per-package
  `poolOptions` move to it.
- `chain-inputs.spec.ts:402` per Decision 4.
- Audit the two `process.cwd()` uses in `add-extensions` and `add-feature-validate` integration specs before
  running anything: a pooled run has one process, and a cwd assumption fails confusingly.

**Done when:** `npm run test:integration` is one vitest invocation and its wall is recorded against today's
71s of vitest and the step's 90-105s. `npm run chain` twice, with the chain's own wall recorded — the step is
usually the binding lane, and the chain's number is the one that matters. The derived-project-list case
passes, and mutation: dropping a suite from the root config's projects fails it.

### Phase 3 — per-project staleness

- Extend `suiteInputs` so a half's inputs are its own config and spec files, and key the stamp `<dir>.<half>`
  per Decision 6, rewriting that doc comment with the reason.
- `scripts/test-unit-pool.ts` (or a sibling that shares `unit-pool.ts` — the conventional choice is whichever
  keeps one pool *concept*) passes `--project` for the stale halves only.

**Done when:** touching one file under `packages/abuddy-cli/src` runs that project alone and says why
(`whyItRuns`); the other two report as cached; the step's wall for that case is recorded against 71-105s.
Mutation: clearing one project's stamp runs that project alone; a suite stale in its unit half only does not
drag its integration half in.

### Phase 4 — measure, then pick the lever or neither

The pooled run is either throughput-bound (near 46.5s) or file-bound (near 34.4s), and the measurement says
which:

- **Throughput-bound** → the lever is worker count. Try `maxThreads: '75%'`, and treat the birpc failure the
  config's comment describes as what it is: a *flake*, so one green run is not evidence. Several runs, or
  leave 50% alone.
- **File-bound** → split `facade-typing.integration.spec.ts` at its `describe` boundary, so its two
  independent fixtures build concurrently in two files rather than in series in one.

**Done when:** the measurement is recorded with the number that decided it, and the lever is applied or
explicitly declined. "Neither is worth it" is a valid outcome and must be written down with its number, not
left as silence.

## Deferred

- **Caching `installPublishedPackages`.** Measured at 1.1s across 8 call sites; see Background. Do not build a
  shared fixture for it.
- **The rest of `goal-unit-suite-cost.md`**, which aims at the `test:unit` halves of `default-setup` and
  `@abuddy/sdk`. This goal touches only the integration halves.

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
- Never quote file-time as wall time. The two differ by 3-5x here, and conflating them is why this cost sat
  unexamined.
