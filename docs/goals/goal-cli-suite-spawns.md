> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-24). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: the CLI suite spawns a process only where the process is the thing under test

Implement docs/goals/goal-cli-suite-spawns.md on master, at or after ee0611269 — the base its Background was
surveyed at.
Before Phase 1, confirm the base: packages/abuddy-cli/tests names `CLI` about 70 times and `TSC` 5 times,
tests/helpers/pack-builds.ts exports `run` over execFileSync, and `npm test -w @abuddy/cli` reports around
770 tests. If the counts are far off, re-measure before planning against them — this goal is arithmetic about
where the time goes, and a stale count invalidates it.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't reopen
them or stop to ask.
This can run in a worktree beside goal-test-tiers.md — see "Doing this in a worktree". If you do, `npm install`
inside it rather than symlinking node_modules, or its build stamps and lock are the other checkout's, and take
every measurement with nothing else running.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep going.
No backward compatibility in code: change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new helper is mutation-checked.
- Every remaining `run('node', [CLI, …])` call site is one whose assertion is about the process — an exit
  code, stderr, argv parsing or a tty — and a comment beside it says which.
- `npm test -w @abuddy/cli` passes with the same test count it has today, or more. Not fewer: this goal moves
  work off the process boundary, it does not delete coverage.
- Measured and recorded in the doc: the suite's wall time and total test time before and after, and
  `npm run chain`'s `test:unit` step before and after.
- npm run typecheck; npm run test:unit; npm run chain --all once at the end.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. Conventional
  message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit leaves
  the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- delete or skip a test to make the suite faster. A test that must spawn is an answer, not a failure.
- replace a spawn with an in-process call where the test asserts on the exit code, stderr, argv parsing or a
  tty. Those are testing the process, and the spawn is the point.
- run the suites concurrently while measuring. Every suite already uses all the cores, and a contended run
  gave a 249s figure for what is actually 182.6s.
```

# Goal: the CLI suite spawns a process only where the process is the thing under test

`@abuddy/cli`'s suite is 56s of `test:unit`'s ~100s — the single largest block of time in the pre-merge
chain. It is not slow because a few tests are slow; it is slow because it starts processes. This goal moves
the work that does not need a process boundary off it, and leaves the work that does.

## Background (2026-09-24, at ee0611269 on master)

Measured with `npx vitest run --root packages/abuddy-cli --reporter=verbose`, on an idle machine. An earlier
run taken while another suite was running reported 249s of test time for the same work, which is why the
prompt block says not to measure under contention.

**770 tests, 182.6s of test time, 71 files, ~56s wall** — so the suite is already about 3× parallel across
workers, and the wall time is bounded by its slowest files rather than by scheduling.

Where the time is. The top six files are 97s of the 182.6s:

| File | Tests | Total | Per test |
|---|---|---|---|
| `tests/cli/scaffold.spec.ts` | 9 | 26.8s | 3.0s |
| `tests/build/facade-typing.spec.ts` | 20 | 19.5s | 1.0s |
| `tests/harness/harness-setup.spec.ts` | 6 | 14.2s | 2.4s |
| `tests/cli/db.spec.ts` | 62 | 13.0s | 0.2s |
| `tests/build/types-bundler-determinism.spec.ts` | **1** | **12.1s** | 12.1s |
| `tests/build/fe-bundler-host-registry.spec.ts` | 20 | 11.5s | 0.6s |

And there is no hot test: the slowest 25 across the suite are all between 1s and 1.6s, spread over
`facade-gate`, `scaffold`, `add-extensions`, `component-contracts`, `release` and `db`. Nothing to fix in
one place, which is why this is a goal rather than a patch.

### What is actually being paid for

`tests/helpers/pack-builds.ts` exports `run`, which is `execFileSync`. Across the spec files:

- **`CLI` is named about 70 times** — each one `node bin/abuddy.mjs <command>`, paying node startup plus
  loading the CLI's bundle before the command begins.
- **`TSC` is named 5 times** — each a `tsc` binary spawn, paying process start plus lib loading.

### Both levers already exist here, applied unevenly

This is the important part, and it is why the goal is small in concept:

- **The TypeScript API in-process.** `facade-typing.spec.ts` already does the heavy work with
  `ts.getParsedCommandLineOfConfigFile` and `ts.createProgram` (`:343`, `:392`) rather than spawning `tsc`.
  Five `TSC` spawns remain elsewhere. The SDK does the same thing in `build/module-exports.ts`, so the
  pattern is established in two places.
- **A shared fixture.** `scaffold.spec.ts` already runs `abuddy init` once in `beforeAll` (`:32-34`) for nine
  tests. It is still 3.0s a test, so what remains per test is a build or a typecheck, not the scaffold.

So the work is finishing two patterns the suite already demonstrates, not introducing them.

### What must keep spawning

Some of these tests are *about* the process, and for them the spawn is the assertion:

- exit codes (`run(...).code`), which is most of `db.spec.ts`'s 62 tests
- stderr text a user reads
- argv parsing, including the shapes an author gets wrong
- the first-run prompt, which needs a tty — `test-packaged-authoring.sh` drives it with `expect`

`types-bundler-determinism.spec.ts` is also inherent: its one test builds the types twice, from the
workspace and from the packed tarballs, to compare them (`:87`). Twelve seconds for that is the test.

## Decisions

Final.

**1. The rule is what the assertion is about, not what is convenient.** A test that asserts on an exit code,
stderr, argv parsing or a tty keeps its spawn; the process is the thing under test. A test that spawns in
order to *produce* something and then asserts on files, types or data calls the command in-process. Every
remaining spawn gets a comment saying which it is, so the next reader does not have to guess — and so a new
spawn without one is visible in review.

**2. Coverage does not shrink.** The suite's test count after this goal is the same or higher. Moving work off
the process boundary is the aim; deleting a case is not, and a case that turns out to need a process is
recorded as such rather than removed.

**3. Call the CLI's command functions, not its bin.** The CLI is a module; `bin/abuddy.mjs` is a wrapper that
parses argv and exits. A test producing a built pack should call the build command directly, which skips node
startup and the bundle load. Nothing about the command's behaviour changes, which is the point.

**4. Prefer the TypeScript API over a `tsc` spawn**, as `facade-typing.spec.ts` and the SDK's
`module-exports.ts` already do. A program built in-process also reuses its lib files across calls within a
file, which a spawn cannot.

**5. Share a fixture only where the tests differ in their assertions alone.** `scaffold.spec.ts` shows the
shape: one `beforeAll`, many `it`s. Where two tests need different pack sources they keep their own build —
a shared fixture that has to be parameterised is a spawn with extra steps.

**6. Measure per file, not per test.** The slowest individual tests are a flat 1–1.6s and say nothing; the
file totals say everything. Any claim of improvement in this goal is a file-total table before and after.

**7. Nothing here is a reason to cache the suite.** Making it cheaper is independent of skipping it, and
`goal-test-tiers.md`'s Phase 5 caches `test:unit` per package on its inputs. This goal reduces the cost when
it does run, which is the half caching cannot do.

## Doing this in a worktree, alongside `goal-test-tiers.md`

This goal is a good candidate to run in parallel with that one, and the two barely touch: this one is
`packages/abuddy-cli/tests/**` and `tests/helpers/pack-builds.ts`, while that one is `scripts/`, the packages'
`vitest.config.ts`, `tests/scripts/` and `abuddy-cli/src/commands/test.ts`. The single shared directory is
`abuddy-cli/tests/build/`, where the tiers goal adds specs and this one edits others — different files, which
merge.

**Give the worktree its own `node_modules`.** This is the part that will bite otherwise. The build stamps and
the build lock live under it — `STAMP_DIR = repoFile('node_modules', '.cache', 'abuddy-packages-build')`
(`packages-built.ts:107-108`) — while `packages/*/dist` is per-checkout. A worktree created with a symlinked
`node_modules`, which is how `.claude/worktrees/` has done it, therefore shares a stamp that describes the
*other* checkout's sources: the worktree builds and stamps its own fingerprint, the main checkout reads that
stamp, finds it does not match its sources, rebuilds and overwrites, and both race the one lock. That is
mutual invalidation, not a slowdown. `npm install` inside the worktree gives it its own stamps and lock, and
`findCheckoutRoot()` already resolves to the worktree's root (`:40-45`), so nothing else needs configuring.

**Edit in parallel, measure alone.** Every suite here uses all the cores. Two measured runs at once are not
two measurements: total work went from 348s to 567s when the chain's steps were run in lanes, and a CLI-suite
timing taken under contention reported 249s of test time for what is 182.6s. Phase 1 is labelling and can
overlap with anything; Phases 2 and 3 end in a number, and that number needs an idle machine.

## Phases

### Phase 1 — Label every spawn with what it is testing

- Walk the ~70 `CLI` and 5 `TSC` call sites and put each in one of two groups with a comment: *the process
  is under test* (exit code, stderr, argv, tty) or *the spawn produces something we then assert on*.
- No behaviour change. The output of this phase is the list, in the code.

**Done when:** every `run(...)` call site in `packages/abuddy-cli/tests` carries a one-line reason, and the
summary reports the split — how many of each. That number is what Phases 2 and 3 are sized against.

### Phase 2 — Call the command in-process where the process is not under test

- Add a helper beside `run` in `tests/helpers/pack-builds.ts` that invokes a CLI command in-process and
  returns what the test needs, and convert the Phase 1 "produces something" sites to it.
- Keep `run` for the rest, unchanged.

**Done when:** the converted sites pass unchanged assertions; the file-total table shows the drop; the test
count is the same or higher. **Mutation:** breaking the command's behaviour fails the converted tests the same
way it failed the spawning ones — the in-process path must not be a weaker check.

### Phase 3 — Retire the remaining `tsc` spawns, and share what is shareable

- Replace the 5 `TSC` spawns with `ts.createProgram`, per Decision 4.
- In the files the Phase 1 list shows repeat the same build, hoist it to `beforeAll` per Decision 5.

**Done when:** no `TSC` constant remains in the specs; the file totals for the affected files drop; the suite
passes. **Mutation:** a type error in a fixture still fails the in-process check.

### Phase 4 — Record what is irreducible

- A short section in this doc: the files whose cost is the test, with the reason. `types-bundler-determinism`
  builds twice on purpose; `db.spec.ts` asserts exit codes 62 times; the first-run prompt needs a tty.
- Re-measure the suite and `test:unit`, and put both tables in the Outcome.

**Done when:** the doc names every remaining second that is not going away, so the next person reading "the
CLI suite is 30s" knows which part of it is a floor. Docs only.

## Deferred

- **Caching the suite** — `goal-test-tiers.md` Phase 5, and independent of this (Decision 7).
- **A tsc service shared across *files*.** Vitest gives each file its own worker, so a program cache is
  per-file at best. Sharing across files needs a service process, which is a spawn by another name and wants
  its own measurement first.
- **`test:packaged-authoring`'s npm installs**, which are its own cost and tracked in `goal-test-tiers.md`.

## Constraints

The repo's standing rules (root `CLAUDE.md`) apply:

- commit each phase as it finishes, no attribution lines, `git diff --cached` first; pushing, tagging and PRs
  are on request;
- no publishing, releases or triggered workflows; no real data dirs; no broad pkill;
- preload, example pack and release metadata rules;
- published packages: no `any`, the TypeScript floor, `api:update` after export changes with `etc/` committed;
- investigate failing tests, mutation-check new helpers;
- external packs are first-class: the fixture packs, the example pack and `test:packaged-authoring` keep
  passing, and a pack author's path stays the one this repo tests;
- **measure on an idle machine.** Every suite uses all the cores, and a contended run reported 249s of test
  time for what is 182.6s — a 36% error, larger than anything this goal is likely to save in one phase.
