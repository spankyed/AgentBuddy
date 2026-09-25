> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-24). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: the CLI suite spawns a process only where the process is the thing under test

Implement docs/goals/goal-cli-suite-spawns.md on master, at or after ee0611269 — the base its Background was
surveyed at.
Before Phase 1, confirm the base: packages/abuddy-cli/tests/helpers/pack-builds.ts exists and exports `run`
and `TSC`, packages/abuddy-cli/src/commands/build.ts exports `buildCommand`, and
packages/abuddy-cli/tests/cli/scaffold.spec.ts and tests/build/facade-typing.spec.ts exist. If they don't, stop
and say so — the plan was surveyed somewhere else.
Then re-measure with Decision 6's recipe before sizing anything: the numbers below are from 2026-09-24, this
goal is arithmetic about where the time goes, and a stale table invalidates it.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't reopen
them or stop to ask.
This can run in a worktree beside goal-test-tiers.md — see "Doing this in a worktree". A symlinked node_modules
is fine until Phase 2 touches abuddy-cli/src, which is a build input; give the worktree its own before that.
Take every measurement with nothing else running.
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

This needs no new seam and no public API change: the commands are already exported functions
(`src/commands/build.ts` exports `buildCommand(args)` and `build(args)`), and these tests already import from
`../../src/…` — `app/app-target`, `app/beta-app`, `app/playwright`, `build/be-bundler`, `build/dsl-defs` and
others. So Phase 2 is reaching for a door that is open, and `packages/abuddy-cli/src` should not need to
change. If a command turns out to swallow something a test needs, say so in the summary rather than widening
the published surface for a test's convenience.

**4. Prefer the TypeScript API over a `tsc` spawn**, as `facade-typing.spec.ts` and the SDK's
`module-exports.ts` already do. A program built in-process also reuses its lib files across calls within a
file, which a spawn cannot.

**5. Share a fixture only where the tests differ in their assertions alone.** `scaffold.spec.ts` shows the
shape: one `beforeAll`, many `it`s. Where two tests need different pack sources they keep their own build —
a shared fixture that has to be parameterised is a spawn with extra steps.

**6. Measure per file, not per test.** The slowest individual tests are a flat 1–1.6s and say nothing; the
file totals say everything. Any claim of improvement in this goal is a file-total table before and after, and
this is how the table in Background was produced — the reporter gives per-test lines, and the totals have to be
summed:

```bash
npx vitest run --root packages/abuddy-cli --reporter=verbose 2>&1 \
  | grep -oE "✓ tests/[^ ]+\.spec\.ts.*[0-9]+ms$" > /tmp/cli-all.txt
python3 - <<'EOF'
import re, collections
tot, cnt = collections.Counter(), collections.Counter()
for l in open('/tmp/cli-all.txt'):
    m = re.match(r'✓ (tests/\S+\.spec\.ts).*?(\d+)ms$', l.strip())
    if m: tot[m.group(1)] += int(m.group(2)); cnt[m.group(1)] += 1
for f, ms in tot.most_common(12): print(f'{f:52} {cnt[f]:5} {ms/1000:7.1f}s')
print(f'{sum(cnt.values())} tests, {sum(tot.values())/1000:.1f}s in {len(tot)} files')
EOF
```

It counts only passing tests, which is what you want while comparing two green runs.

**7. Nothing here is a reason to cache the suite.** Making it cheaper is independent of skipping it, and
`goal-test-tiers.md`'s Phase 5 caches `test:unit` per package on its inputs. This goal reduces the cost when
it does run, which is the half caching cannot do.

## Doing this in a worktree, alongside `goal-test-tiers.md`

This goal is a good candidate to run in parallel with that one, and the two barely touch: this one is
`packages/abuddy-cli/tests/**` and `tests/helpers/pack-builds.ts`, while that one is `scripts/`, the packages'
`vitest.config.ts`, `tests/scripts/` and `abuddy-cli/src/commands/test.ts`. The single shared directory is
`abuddy-cli/tests/build/`, where the tiers goal adds specs and this one edits others — different files, which
merge.

**The symlinked `node_modules` is fine for most of this, and not for one part.** `.claude/worktrees/` creates
`node_modules` as a symlink to the main checkout, which puts the build stamps and the lock there too
(`STAMP_DIR = repoFile('node_modules', '.cache', 'abuddy-packages-build')`, `packages-built.ts:107-108`) while
`packages/*/dist` stays per-checkout. That only matters when the two checkouts disagree about a *build input*,
because `unitStaleReason` (`:190-205`) compares a stamp against the inputs, and
`packages/abuddy-cli/tests` is not one — the `@abuddy/cli` unit's inputs are the root manifests,
`scripts/bundle-package.ts`, `abuddy-cli/{bin,src,package.json,tsconfig.json}` and `abuddy-host/{src,package.json}`.

So Phase 1, and every edit confined to `tests/`, leave the fingerprint identical to master's and the shared
stamp stays valid for both checkouts. Two things do need care:

- **Only if a phase changes `abuddy-cli/src`**, which Decision 3 says it should not need to: the commands are
  already exported and the tests already import them. Should that change, `src` *is* an input, the two
  checkouts' fingerprints diverge from that commit, and each `packages:ensure` rebuilds what the other just
  built — so give the worktree its own `node_modules` (`npm install` inside it) at that point.
  `findCheckoutRoot()` already resolves to the worktree's root (`:40-45`), so nothing else needs configuring.
- **A fresh worktree has no `packages/*/dist`**, so its first `packages:ensure` finds the outputs missing and
  builds — taking the lock that, under a symlink, is the main checkout's. Do that build once, alone, before
  starting parallel work rather than discovering it as a race.

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

## Outcome (2026-09-25)

Implemented on `AS/cli-suite-spawns`, in a worktree, because another session held the main checkout.

### What changed

| Phase | Result |
|---|---|
| 1 Label every spawn | 32 sites, each with a reason: **14 produces, 8 process, 3 typecheck, 7 inherent** |
| 2 Call commands in-process | the 14 `produces` sites now call `callCli()`; `buildPack` with them |
| 3 Retire the `tsc` spawns | the 3 `run(TSC, …)` sites now call `typecheckPack()`; both `TSC` constants gone |
| 4 Record what is irreducible | this section |

`callCli` takes the two pieces of global state the commands assume — they read `process.cwd()` rather
than a root, so it chdirs and restores, and a failing command calls `process.exit`, so that is swapped
for a throw and reported as a code. Both are safe only because vitest forks a process per file and runs
its tests in sequence, which is what the suite does; a `it.concurrent` in a converted file would break
it, and that is the condition that would make this worth revisiting.

### Three things the Background got wrong, corrected here

- **"`CLI` is named about 70 times"** counts *mentions* (72). The `run()` idiom has **32 spawn sites**,
  in five files. Phases 2 and 3 were sized against a number roughly twice the real one.
- **"`TSC` is named 5 times"** is right, but only 3 were `run(TSC, …)`. The other two spawn a *named
  TypeScript version* from the floor matrix (`published-packages.ts`, `published-exports.spec.ts`) and
  cannot go in-process: the point is which compiler runs.
- **Decision 6's recipe bypasses the suite's `pretest`.** `npx vitest` skips it, and
  `published-packages.ts:39` exists precisely to catch that, so the recipe fails whenever `dist` is
  stale — 21 files failed on the first attempt. Run `npm run packages:ensure` first. Worse, the suite
  repairs itself mid-run, because the specs that spawn the CLI rebuild stale packages as a side effect,
  so a bypassed run half-fails and then goes green on a retry with nothing changed.

### What is irreducible, and why

- **`db.spec.ts`** — 62 tests over its own `spawn`/`spawnSync` helpers, asserting exit codes and stderr.
  The process is the subject (Decision 1), and it is already the cheapest of the big files per test.
- **The 7 nested vitest runs** (`harness-setup.spec.ts`, one in `scaffold.spec.ts`) — they assert that a
  pack's *own* test run behaves: isolation refused, concurrency refused, the right specs collected. The
  runner is the thing under test.
- **`types-bundler-determinism.spec.ts`** — one test, ~11.5s, builds the facade twice on purpose, from
  the workspace and from the packed tarballs, to compare them. The second build is the assertion.
- **The TypeScript floor matrix** — spawns each supported `tsc` version.
- **The first-run prompt** — needs a tty, driven with `expect` in `test-packaged-authoring.sh`.

Beyond the `run()` idiom this goal set out to fix, **30 further spawn-primitive call sites live in 22
spec files**, most of them a local helper that a file then calls many times. They were not labelled:
this goal's Finished-when names the `run('node', [CLI, …])` shape, and that shape is now fully
accounted for. Labelling the rest is the obvious next slice, and `db.spec.ts` is most of it.

### Measured

Every number below was taken on a **contended machine** and none is a clean figure. Another session
was building and testing in the same checkout throughout; the 1-minute load average is given with each
reading, and for reference the suite's own baseline was taken at load 12.

A 34-hour runaway `abuddy generate-entries` (PID 83105, orphaned, 98.5% of a core, started ~Sep 23) was
found and killed before any of this. It had been consuming a core during the Background measurement too,
which is part of why that 182.6s does not reproduce.

The honest comparison is the four affected files, A/B back to back so contention hits both:

| | wall | test sum | load |
|---|---|---|---|
| before, spawning | 65.9s | 181.0s | 37 |
| after, in-process | **34.6s** | **89.9s** | 47 |

The in-process run was ~2× faster while carrying *higher* load, so that ratio is conservative. An
isolated probe of three builds of one pack, the mechanism on its own: **14.1s spawned, 7.4s
in-process**, the first call paying esbuild/vite/tailwind's load and the rest at ~2.15s against ~4.7s.

**The whole-suite and `test:unit` figures this goal asks for are not recorded, because no run on an idle
machine was possible.** The last full run went green on every file this goal touched and timed out one
test in `import-specifiers.spec.ts` — a file untouched here, whose 187 tests pass in 17s alone — at a
load average of 109. Take those two numbers before claiming the goal's headline.

### One flake found on the way, in a file this goal did not touch

`import-specifiers.spec.ts > findInternalPackageImports > holds for the repo` scans the whole repo and
takes **2445ms against vitest's default 5000ms timeout** — it passed at load 12 and timed out at 9135ms
under load. It has half its budget in hand on an idle machine, so any 2x slowdown fails it, and a
contended `test:unit` is exactly that. Nothing here changes it or its input; it passed in the
post-change CLI suite at load 37-82 and failed only in the wider `test:unit`.

It wants an explicit timeout, or to be a tier-1 check that does not race other suites. Until then it
will keep failing for reasons that have nothing to do with the change under test — which is the most
expensive kind of red.

### Coverage

764 tests before, 764 after (759 passing, 5 skipped in both; the skips are `fe-bundler-ui-theme` and
`snapshot-entity-names`, gated on build output and unrelated to this work). Nothing was deleted.

Both new helpers are mutation-checked: with `generateEntries` skipped in `build()`, all three converted
spec files fail as they did when they spawned; with a type error injected into the `CONSUMER` fixture,
all four typecheck cases fail with `src/consumer.ts(161): error TS2322` — naming the file, line and code,
where the spawn reported only a non-zero exit.

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
