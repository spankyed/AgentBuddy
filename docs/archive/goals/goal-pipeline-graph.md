> **Absorbed by [`goal-test-tiers.md`](goal-test-tiers.md)** (its Decisions 10–18 and Phases 3–6,
> 9). Nothing here was superseded: the graph, the input-coverage guard, the caching and the parallelism are
> that goal's Phases 3–6 and 9, renumbered, and its Decision 12 folds this plan's `Step` table into the
> `ChainStep` that already carries a tier. The two were one goal — caching by fingerprint, which this plan
> rightly refuses to replace with a heuristic, cannot pay while a step's honest input set is the whole repo,
> and separating the checks that need a built app is what makes it narrow. The text below is the plan as
> written; its measurements were taken into that goal's Background.

> **Written in session** `00e10b0f-0852-4401-8b3c-7df01734a7eb` (Claude Code, 2026-09-24). Resume it with `claude -r 00e10b0f-0852-4401-8b3c-7df01734a7eb`.

```
# Goal: the chain is a declared graph that caches, not a shell string

Implement docs/goals/goal-pipeline-graph.md on master, at or after 0f0e57a15 — the base its Background
was surveyed at.
Before Phase 1, confirm the base: the `chain` script in the root package.json is a single `&&` line of
eight commands, and `BUILD_UNITS`, `fingerprintUnit`, `stampedBuild` and `ensurePackagesBuilt` exist in
packages/abuddy-host/src/build/packages-built.ts. If they don't, stop and say so — the plan was surveyed
somewhere else.
Read Background, Spike results, Decisions, Phases and Constraints first. Decisions are final: implement
them, don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `npm run chain` runs from a declared graph: a step names what it needs, a cycle or an unknown
  dependency fails before any step runs, and the run prints one line per step with its status
  (ran | cached) and wall time.
- Every tracked source file is an input to at least one step, and a spec fails when one is not.
- A second `npm run chain` with nothing changed re-runs only the steps that declare no cache, and
  reports the rest as cached. A doc-only change re-runs nothing.
- The E2E step is declared `cache: false`, and the reason is in the table beside it.
- npm run chain (twice: cold, then warm); npm run spec; the guard's mutation check.
- A final summary: phase → done/deferred, measured cold and warm chain times, and the conventional
  choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- add a third-party task runner (nx, turborepo, wireit) — Decision 1 rejects it on evidence, and the
  primitives it would replace are the ones this goal builds on.
- cache the E2E step (Decision 6), or add a remote cache.
- reintroduce `api:check` into the chain: `typecheck`'s `api:stamp` covers it, which the root CLAUDE.md
  records.
```

# Goal: the chain is a declared graph that caches, not a shell string

`npm run chain` is eight commands joined by `&&`. The order is a claim nothing checks, nothing can run
beside anything else, and no step knows what it reads, so every run pays for every step. This goal makes
the graph data, adds the guard that makes caching safe, then caches and parallelises over it.

## Background (2026-09-24, at 0f0e57a15 on master)

### What the chain is now

The root `package.json`'s `chain` script is one `&&` line of eight commands:

```
packages:ensure → compile → typecheck → test:unit → build → test:external-pack → npm test → test:packaged-authoring
```

Two improvements already landed and are **not** part of this goal: `api:check` was dropped from the chain
(`typecheck` runs `api:stamp`, 0.6s against 55s, and the root `CLAUDE.md` records why), and
`packages:ensure` was hoisted so the later steps' copies are a stat and a return. What remains is the
shape: a sequence, in a string.

Its costs, in order of what they prevent:

- **The order is unchecked.** A step added in the wrong position runs against stale inputs and looks
  correct. Nothing declares that `test:external-pack` needs `build`; the `&&` order is the only record.
- **`&&` is the only edge type**, so no two steps can overlap even where they share nothing.
- **No step declares its inputs**, so nothing can be skipped. A doc-only edit pays the full run.
- **A step is not a thing the runner knows about**, so there are no per-step timings. The measurements in
  Spike results below were recovered from log-file mtimes, which is the symptom.

### The mechanism this goal builds on

`packages/abuddy-host/src/build/packages-built.ts` is already a content-addressed task cache, scoped to
five package builds. Everything a task runner needs is there except the edges:

| Task-runner concept | Where it already is |
|---|---|
| declared `inputs` / `outputs` per unit | `BuildUnit` (`:67`), `BUILD_UNITS` (`:97`) |
| content-hash cache key | `fingerprintUnit` (`:178`) over `fingerprintInputs` (`:155`) |
| write the cache only on success | `stampedBuild` (`:299`) — fingerprint taken before the build, stamp written after, so a failed build never reads as fresh |
| invalidate when the runner changes | `STAMP_VERSION` (`:65`) |
| which units need rerunning | `stalePackageUnits` (`:208`) |
| concurrency safety | `withBuildLock` (`:264`) |
| **`dependsOn`** | **nothing. This is the gap.** |

`fingerprintInputs` also takes a `normalise` hook, which is how `api:stamp` asks "could these declarations
have changed a report" and answers no for a doc-comment edit. A glob-and-lockfile cache key cannot express
that.

The file has already reasoned about the trap this goal could fall into, and recorded the arithmetic
(`:140-150`): mtime cache keys are rejected because over 2.5MB they buy 6% of one command, where Bazel
makes that trade over gigabytes.

### The safety net that per-step caching gives up

`packages-built.ts:13` states why `BUILD_UNITS` can under-declare safely:

> *"A unit's `inputs` need only cover what no other unit does, since any stale unit rebuilds all of them."*

All-or-nothing forgives an under-declared input. **Per-step caching does not**: an input a step doesn't
declare is a step that reports a stale pass. That is the worst failure a test system has — green and
wrong — and it is the reason Phase 2 exists and lands before any caching.

### What already selects narrowly

`scripts/spec.ts` (126 lines) resolves a target to the specs that cover it: a source file goes to vitest's
`related`, a path or name to the matching specs, grouped by package so each package's own `test` and
pretest still run. That is the narrow end of the same idea; this goal builds the broad end.

## Spike results (2026-09-24)

No throwaway branch — these were measured by instrumenting one full chain run on master and reading the
per-step logs. Nothing to reuse; the numbers are the output.

**Per-step wall time**, from the log files' mtimes (each log's last write is that step's finish), with the
run's start from the task file's birth time. M-series, warm:

| Step | Took | CLAUDE.md's figure |
|---|---|---|
| `compile` | 11s | 16s |
| `typecheck` | 54s | 53s |
| `test:unit` | 1m44s | 108s |
| `build` | 44s | 60s |
| `test:external-pack` | 43s | 41s |
| `npm test` (E2E) | 30s | 27s |
| `test:packaged-authoring` | 1m11s | 75s |
| **total** | **6m53s** | ~8 min |

The documented figures are accurate; nothing has drifted. `typecheck` came in at 54s *with `lint:check`
now inside it*, so adding lint to the chain cost nothing measurable.

**Where `test:unit`'s 104s goes.** The eight suites report 99.6s against 104s wall, so it is real work
rather than process startup:

| Suite | Wall | Note |
|---|---|---|
| `@abuddy/cli` | 56.0s | reports `tests 249.4s` across workers — already ~4.5× parallel |
| `@app/default-setup` | 15.4s | reports `setup 97.3s` — an expensive per-file setup, undiagnosed |
| `@abuddy/host` | 12.5s | |
| the other five | ~15s combined | |

**`packages:ensure` runs 18 times** in one chain (3 in `compile`, 4 in `typecheck`, 3 in `build`, 6 in
`test:external-pack`, 2 in E2E), each paying a stat pass for nothing once the first has run.

**The concurrency hazard is conditional, and the condition is removable.** `ensurePackagesBuilt`
(`:330-332`) returns before taking any lock when nothing is stale; only `stampedBuild` locks. So the root
`CLAUDE.md`'s warning about concurrent suites describes two suites that both find a package stale and race
each other's build — not suites as such. With `packages:ensure` hoisted, every later call is a stat and a
return, and parallelism is safe. This was hit for real in the session that wrote this doc, before the
cause was understood.

**What was not covered:** whether each step's inputs can be declared completely (Phase 2 proves it), and
whether any step's pass is non-reproducible beyond E2E (Decision 6 assumes only E2E; Phase 3's first warm
run tests that assumption).

## Decisions

Final.

**1. No third-party task runner.** Not nx, turborepo or wireit. They would replace `fingerprintUnit`,
`stampedBuild` and `STAMP_VERSION` — a mechanism this repo has already reasoned about more carefully than
they do, including the `normalise` hook they have no equivalent for and the recorded arithmetic for
rejecting mtime keys. They also bring a config language and, for nx, a daemon, for a seven-step pipeline
on one machine with one contributor. The gap is one field (`needs`), not a tool.

**2. Cache before parallelism.** Parallelism takes 6m53s to about 3m51s on every run. Caching makes the
*second* run cost only what the change invalidated — seconds for a doc edit. Caching also shrinks what is
left to parallelise, so the order is graph → guard → cache → parallelism, and parallelism lands last
because by then it matters least.

**3. The graph is data in one table.** `PIPELINE` in `scripts/lib/pipeline.ts`, one entry per step:

```ts
interface Step {
  needs: readonly string[];      // the edges
  inputs: readonly string[];     // cache key, the same shape as BuildUnit
  outputs?: readonly string[];   // so a downstream step's inputs can name them
  run: string | (() => Promise<void>);
  cache?: false;                 // a step whose pass is not reproducible
  exclusive?: true;              // needs the build lock
}
```

It reuses `BuildUnit`'s input/output shape and `fingerprintUnit`'s key deliberately: one fingerprint
protocol in the repo, one `STAMP_VERSION` to bump.

**4. A cycle or an unknown dependency fails before any step runs.** Validation is part of loading the
table, not a thing the first run discovers.

**5. A step with no outputs caches its pass.** `typecheck` and the test steps produce nothing; what is
cached is that this input set passed. That is standard for lint and typecheck tasks and is where most of
the saving is.

**6. The E2E step is never cached** (`cache: false`, with the reason beside it). It drives real Electron
with real timing and is the likeliest step to be flaky; a flaky pass cached green hides an intermittent
failure indefinitely. 30s is cheap enough to always pay. One documented exception is worth more than a
cache that is subtly untrustworthy.

**7. Skipping is by fingerprint only, never by heuristic.** No "the renderer didn't change, skip E2E".
Skipping because a content hash matched is sound; skipping because a path looks unrelated is a guess, and
with CI off the chain is the only gate.

**8. No remote cache.** One contributor, one machine.

**9. The run reports itself.** One line per step: name, status (`ran` | `cached`), wall time, and a total.
On failure it names the failing step and lists the steps that did not run *because of it*, rather than
leaving "everything after" implied. The per-step timings this goal's own Spike results had to recover from
mtimes are the argument.

## Phases

### Phase 1 — The graph, serial, uncached

- `scripts/lib/pipeline.ts`: the `Step` type from Decision 3 and the `PIPELINE` table, one entry per
  current chain step, with `needs` matching today's `&&` order and `inputs`/`outputs` declared.
- `scripts/chain.ts`: load and validate the table (Decision 4), topologically order it, run the steps
  serially, and report per Decision 9. `chain` in the root `package.json` becomes `tsx scripts/chain.ts`.
- `packages:ensure` stays hoisted, as the graph's root rather than a line in a string.
- No caching, no parallelism: behaviour is what it is today, and the diff is reviewable on the order
  being derived rather than written.

**Done when:** `npm run chain` passes and prints a step/status/duration table whose total matches the
serial time within a few seconds; a deliberately introduced cycle and an unknown `needs` name each fail
before any step runs. **Mutation:** removing `build` from `test:external-pack`'s `needs` reorders the run,
which a spec on the computed order catches.

### Phase 2 — The input-coverage guard, before anything depends on it

- A spec asserting every tracked source file is an input to at least one step's `inputs` (resolved
  through the same directory walk `fingerprintInputs` uses), so an under-declared input is a failing test
  rather than a stale pass.
- Its doc comment says what property it holds and why per-step caching needs it where `BUILD_UNITS` did
  not (`packages-built.ts:13`).

**Done when:** the spec passes over the Phase 1 table. **Mutation:** adding a source file that no step
names, and dropping a directory from one step's `inputs`, each fail it.

### Phase 3 — Caching

- Fingerprint each step with `fingerprintUnit` and stamp it with `stampedBuild`, so a step whose inputs
  are unchanged is reported `cached` and not run. Bump `STAMP_VERSION` once.
- `cache: false` on the E2E step (Decision 6).
- Per-package granularity for `test:unit`: each suite is its own step, since that is where 104s lives and
  a one-package change should not re-run eight suites.

**Done when:** a cold `npm run chain` matches Phase 1's time; a second run immediately after re-runs only
E2E; a doc-only edit re-runs nothing; a one-package source edit re-runs that package's suite and the steps
downstream of it, and no others. Record the cold and warm times in the summary. **Mutation:** touching one
file under a step's declared inputs makes exactly that step and its descendants run again.

### Phase 4 — Parallelism

- Run ready steps concurrently up to a concurrency limit; `exclusive: true` steps take the build lock.
- The safety argument is in Spike results: with `packages:ensure` hoisted, every later
  `ensurePackagesBuilt` is a stat and a return, so the race the root `CLAUDE.md` warns about cannot
  happen.

**Done when:** a cold run is measurably shorter than Phase 1's serial time, with the critical path
reported; two consecutive cold runs agree on which steps passed, so nothing is order-dependent. Record the
measured cold time.

### Phase 5 — Retire the per-change table's arithmetic

- Once a warm chain is seconds, the root `CLAUDE.md`'s "What to run after a change" table stops being
  instructions to follow and becomes documentation of the graph. Rewrite that section to say so: run
  `npm run chain`, which costs what you changed; keep `npm run spec` as the inner-loop tool.
- Keep the measured figures, since they are what justify the design.

**Done when:** the table's rows no longer ask the reader to work out which suite covers their change, and
the section names the graph as the thing that decides. Docs only, so nothing to run.

## Deferred

- **`@app/default-setup` reports `setup 97.3s` against 15.4s wall.** The most suspicious number in the
  run and undiagnosed. An expensive per-file setup paid by every test file; worth profiling on its own,
  and it is a cost caching hides rather than fixes.
- **The `@abuddy/cli` suite at 56s**, 54% of `test:unit`. Already ~4.5× parallel internally; it does real
  `abuddy build` runs per test, and a shared fixture cache is the obvious lever. Which tests dominate is
  unmeasured, so this needs profiling before a proposal.
- **`test:packaged-authoring` at 71s**, mostly npm installs from packed tarballs. A warm `node_modules`
  cache is the lever.
- **Turning CI on.** Off deliberately for a single-contributor repo; the workflow header says when it
  goes back on. A cached graph is what would make CI cheap, but that is a separate decision.

## Constraints

The repo's standing rules (root `CLAUDE.md`) apply:

- commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request;
- no publishing, releases or triggered workflows;
- no real data dirs, no broad pkill, E2E in the `abuddy-test` namespace;
- preload, example pack and release metadata rules;
- typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`);
- published packages: no `any`, the TypeScript floor, `api:update` after export changes with `etc/`
  committed;
- one fingerprint protocol: extend `packages-built.ts` rather than adding a second hashing scheme, and
  bump `STAMP_VERSION` when a stamp's meaning changes;
- measure before optimising, and record the method and the machine with any number;
- mutation-check every new guard;
- run the narrowest check that could fail during the work — this goal's own subject is why.
