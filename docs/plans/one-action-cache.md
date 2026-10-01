# One action cache

## Problem

One concept — **a chain step** — does three jobs that want different granularities: it is the unit of
caching, the unit of execution, and the unit of ordering. Nearly every chain defect this repo has found is
downstream of that, and each has so far been fixed where it surfaced rather than where it came from.

Four symptoms, all the same cause:

- **Two caches over one body of work.** The chain caches per step; `test-unit-pool.ts` caches per suite.
  `chain-inputs.spec.ts` carries a case — *"a pool step and its projects cache on the same inputs"* — whose
  only job is to police two caches agreeing. The root `CLAUDE.md` states the rule being broken, about
  `packages:ensure`: *"Two caches over one body of work is the bug, not the cost."*
- **`typecheck` is 18 heterogeneous legs under one fingerprint.** 32.6s of declared CPU, no per-leg
  caching anywhere in `scripts/typecheck.ts`. A change to `@abuddy/ears` runs `vue-tsc` over the renderer.
- **The integration half has no per-suite cache**, because it is not pooled. Pooling was an *execution*
  decision (process economy, `docs/archive/plans/test-unit-scheduling.md`) and caching came along as a
  passenger. `test:integration` is a raw `vitest run` whose step inputs are `workspace(dir)`, not
  `suiteInputs(dir)`.
- **Scheduling changes cache identity.** A spec's measured cost picks its half, the half picks the step,
  and the step carries the inputs — so making a spec slower can change what it watches. This is not
  theoretical: `suite-reads.spec.ts` measured 2.5s against a 2.5s edge, and the half it would have been
  moved into declares no repo-wide tree. The gate written to watch for this was nearly relocated into
  blindness by its own runtime.

And four escape hatches that exist because the model has no way to say what an action produces:
`cache: false`, `forceArgs`, `neverCachedBecause`, `excludes`.

## Prior art, and the names to use

This repo has independently built most of the local half of a content-addressed build system, and built it
well — but under its own names, which is why none of its answers can be looked up and why the gaps are
hard to see. **The first thing this work should do is adopt the standard vocabulary**, because the names
carry semantics that encode failures other people already hit. Writing a second bespoke system with new
nouns would be motion, not progress.

| here | standard name | prior art |
|---|---|---|
| chain step / `BuildUnit` | **action** | Bazel, Buck2, Gradle (task), Nx, Turborepo, Ninja (edge) |
| `fingerprintUnit` | **action key** | Bazel: inputs + command line + environment — the same triple |
| the stamp store | **action cache** | Bazel, Gradle build cache, Nx computation cache |
| the unit pool | **persistent workers** | Bazel workers, Gradle daemons |
| *(absent)* | **dep file** | Buck2 `dep_files`, Ninja `depfile`, `gcc -MD`, Gradle incremental compile |
| *(absent)* | **hermeticity** | Bazel/Buck2 sandboxing: an undeclared read fails rather than caching wrong |
| `tier` | *(no equivalent)* | genuinely bespoke; see item 17 |

What the repo has and lacks, against that model:

| property | here |
|---|---|
| action graph with declared dependencies | yes — steps and `needs` |
| content-addressed input hashing | yes — `fingerprintUnit` |
| local action cache | yes — stamps |
| persistent workers | yes — the pool |
| per-action output declaration | partial — `outputs` exists, means "exclude from my own key" |
| dep files | **no** |
| hermeticity, or any check in its place | **no** — and all three of this session's undeclared-input defects live here |
| remote cache | no, deliberately |

## Current state (2026-10-01, at `e78f2d154` on `AS/e2e-tests-cleanup`)

| | where | shape |
|---|---|---|
| chain steps | `scripts/lib/chain-steps.ts:484` | 12, hand-declared `inputs`/`outputs`/`needs`/`tier` |
| step fingerprint | `fingerprintUnit`, `@abuddy/host/build/packages-built` | sha256 over declared inputs minus outputs/excludes |
| per-suite cache | `poolUnitFor`, `scripts/lib/unit-pool.ts:35` | `suiteInputs(suite)`, **keyed by directory** — "a suite has one stamp whichever pool runs it" |
| typecheck legs | `scripts/lib/typecheck-legs.ts:34` | 18 legs, 20 tsconfig invocations, **no cache** |
| integration half | `package.json:51` | `vitest run --config …`, no stamps, `workspace(dir)` inputs |
| suite inputs | `suiteInputs`, `chain-steps.ts:413` | ROOT + runner + workspace parts + `workspaceDeps` + 3 flags |

Measured this session: a cold chain is 195.1s against master's 191.2s; the critical path is 109-119s and
is `packages:ensure → compile → build:app → test:packaged-authoring`, which no part of this touches.

## The parts list

### A. The action model

1. **An action.** One (tool, scope) pair: `tsc -p packages/abuddy-host`, `vitest --project @abuddy/ears`,
   `oxlint .`, `abuddy build @app/default-setup`. Roughly 40 where there are 12 steps.
2. **An action registry derived from the tree**, not listed: one action per tsconfig, per vitest project,
   per build unit. A new package gets its actions by existing, the way `PACKAGE_DIRS` already works from
   the root `workspaces` field.
3. **An action key** = hash of (input contents, command line, the environment that affects the result) —
   Bazel's definition, unchanged. Command identity is handled today by the bluntest available means:
   `ROOT` (`chain-steps.ts:216`) puts `package.json` in *every* step's inputs, so editing any npm script
   invalidates the whole chain, and `typecheck` declares `scripts/`, which is where its legs' flags live.
   Correct, and the reason a one-word change to an unrelated script costs a full run. Hashing the command
   an action actually runs is what lets `package.json` come *out* of the inputs.
4. **Every action declares outputs, verification included.** Bazel caches a test by treating its result as
   an artifact: the action writes a status, and caching the test is caching that output like any other.
   That removes the need for a "producing vs verifying" distinction — I had proposed one, and the standard
   model does not need it. It also gives `cache: false` and `neverCachedBecause` somewhere to go: an action
   whose result cannot be represented as an output is simply not cacheable, which is item 7.

### B. Where inputs come from

5. **Dep files**, where the tool reports what it read. Both sources already exist here: `.tsbuildinfo`
   (every workspace tsconfig writes one; `fileNames` is the read set) and `--listFiles` (already relied on
   by `tests/scripts/test-packaged-authoring.sh:332`); `reachableFrom` (`scripts/lib/module-graph.ts:61`)
   for the module graph.
6. **Derived from the tree** — workspace layout, manifests (`workspaceDeps` reads both dependency maps).
7. **Undeclared means uncacheable, not wrong.** This is Gradle's rule and it is strictly better than the
   "safe default" I first proposed: an action that cannot fully declare its inputs and outputs is simply
   not cached. Under-declaration then costs speed, never correctness. **This repo's failure mode — declare
   partially, cache anyway, be silently wrong — is the one Gradle designed out of existence**, and three of
   this session's defects were exactly it. It is the single most valuable item on this list.
8. **Declared**, for actions that can meet item 7 but whose reads no tool reports: runtime reads (the
   git-querying guards, `SUITE_READS.repo`), shell steps, `oxlint`, anything spawning a non-node tool.
9. **A dep file is a proxy, in this repo's own taxonomy** (root `CLAUDE.md`, "Three kinds of recorded
   artifact") — it records what was read last time and can go stale from an input nobody listed. It needs
   the self-check `api:stamp` has, not just a comparison. This is also the known unsoundness of dep files
   generally, which is why Bazel pairs them with sandboxing and Gradle pairs them with item 7.
10. **Verification that declarations cover reads**, generalised from `suite-reads.spec.ts`. This is the
    affordable stand-in for hermeticity, and should be described as that rather than as a check of its own.

### C. The action cache

11. **One store, one format, one entry per action.** Today: chain stamps, pool stamps, package-build
    stamps, `.tsbuildinfo`, `.inputs-hash`, `spec-cost.json`.
12. **The key must not contain the execution plan.** No batch, lane, pool, half or step in it. This single
    rule dissolves symptoms 3 and 4 above.
13. **A key that distinguishes two runs of one scope.** The pool key is the directory, which is correct
    while a suite runs in exactly one pool and wrong the moment it has two halves. Becomes (scope, action).

### D. Execution, separated

14. **Workers.** Group stale actions into as few processes as the tools allow. This is what the pool
    already does well and should keep doing, under the name the rest of the industry uses for it.
15. **Scheduling policy** — lanes, worker caps, `exclusive` (`packages:check` must run alone because
    `attw --pack` writes inside the tree it checks). Policy, not identity.
16. **A worker reports what it ran**, so only those actions are stamped. The pool already does this and the
    reason is recorded: a `--project` filter matching nothing must not stamp a pass.

### E. The action graph

17. **Edges derived from artifacts** — an action reading `packages/*/dist` depends on the action writing
    it. `needs` is hand-declared beside `inputs` that already imply it, and `chain-inputs` has yet another
    case policing their agreement.
18. **Tier derived, not declared.** The one genuinely bespoke concept here, and deriving it is really the
    standard answer reached from the other side: a tier is a position in the dependency graph. An action is
    tier 3 iff it reads app outputs. `check:tiers` currently reads a step's scripts as text to catch a
    tier-1 step reaching the app, which the graph would make unrepresentable.
19. **Cycle and ordering validation**, which the graph gets for free and the current table checks by hand.

### F. Observability

20. **Per-action "why did this run"** — the four stamp states `unit-pool.ts` already distinguishes.
21. **The freshness sweep**, per action rather than per step.
22. **Cost records per action.** `spec-cost.json` generalises; its hysteresis, drift band and contention
    refusal are hard-won and must survive (`scripts/lib/spec-cost.ts`).
23. **Near-edge reporting**, which only stays meaningful once cost stops deciding coverage.

### G. Guards the new model needs

24. Every action's declared inputs cover what it reads (generalise `suite-reads`) — item 10.
25. No two caches over one body of work — assertable once there is one store.
26. An action's key is independent of its worker. Mutation: run the same action in two batches, keys match.
27. The dep-file proxy has a self-check (item 9).
28. An action that cannot declare its outputs is not cached (item 7) — the guard is that no action is both
    uncacheable and stamped.

## What already exists and must be reused, not rebuilt

| piece | where | why it matters |
|---|---|---|
| `fingerprintUnit` / `BuildUnit` | `@abuddy/host/build/packages-built` | the hashing, the exclusion rules, `STAMP_VERSION` |
| `poolUnitFor` + stamp states | `scripts/lib/unit-pool.ts` | per-scope caching already works; this is the model to generalise |
| `reachableFrom` | `scripts/lib/module-graph.ts:61` | AST-based on purpose — regexes invented 61 imports that do not exist |
| `workspaceDeps` / `PACKAGE_DIRS` | `scripts/lib/workspace-deps.ts`, `import-populations.ts` | derived populations, already refusing to be empty |
| `spec-cost`'s band machinery | `scripts/lib/spec-cost.ts` | hysteresis, `DRIFT_SHARE`, contention refusal, `CONTENTION_RATIO_MAX` |
| `chain-output` | `scripts/lib/chain-output.ts` | column composition and the stale-again report |
| the exception-list pattern | 25 instances, 23 guarded | how a declaration that cannot be derived is kept honest |

## Open decisions, to settle before the goal is written

1. **Is `typecheck` one action or twenty?** Twenty keys and twenty stamps against one. Decides whether an
   action is "a command" or "a tool invocation".
2. **Where does the action cache live** — one file, or one entry per action? Twelve stamps today, forty-plus
   after.
3. **How is a dep file invalidated** when the tool that produced it has not run yet (cold tree)? Item 7 is
   the standard answer — no dep file means not cacheable — but that makes a cold run uncached everywhere.
4. **Does the graph keep hand-declared `needs`** during migration, or derive from the first phase?
5. **Is this incremental or a rewrite?** The table is 12 steps and heavily documented; a parallel
   implementation that must agree with the old one is a third cache during the migration.

## Measure before committing to any of it

Three structural changes were pitched in the session that produced this doc and two measured to roughly
nothing. These come first, and the goal doc should not be written until they are in it.

- **Per-leg typecheck caching.** For a handful of representative single-package edits, which legs would a
  per-action key mark stale, and what is the wall time of that subset against the current ~11s? Legs run in
  parallel, so the saving is bounded by the critical leg (`typecheck:fe`, 6.2s), not by the 32.6s of CPU.
- **Per-suite staleness in the integration half.** Does it skip anything in practice, or are its three
  suites always stale together?
- **Action-key overhead at 40 actions.** The chain takes 12 fingerprints today. Forty is more stat and hash
  work on every run, including the warm one, where the whole budget is 0.9s.
- **What item 7 makes uncacheable.** Gradle's rule is the most valuable item and the most likely to cost
  wall time: every action that cannot declare its outputs stops being cached at all. Count them first.

## Explicitly out of scope

- **Adopting Turborepo, Nx, Bazel or Buck2.** Turborepo/Nx would give items 1, 3 and 11 free plus remote
  caching, and give nothing for 5, 10 or 24 — undeclared reads still cache silently, which is the defect
  class this is about. It would also replace heavily-reasoned machinery with a config format, losing the
  reasoning, for a remote-cache win that serves a CI which is deliberately off. Bazel/Buck2 are correct by
  construction via sandboxing and would fight vitest, vite and electron-builder for months. **Borrow the
  model and the names; do not adopt the tool.**
- **Filesystem tracing.** A syscall trace cannot tell "read because it matters" from "stat'd during module
  resolution", and the tools already report what they read.
- **Remote or shared caching.** Single contributor, CI off.

## Unverified — reasoned, not tested

- That 40 actions is the right order of magnitude. It is 20 tsconfig invocations + ~14 vitest projects + the
  build and packaging actions, counted by hand.
- That deriving `needs` from artifacts reproduces today's ordering exactly. Likely, unproven.
- That deriving `tier` from "reads app outputs" reproduces the current three-way split exactly. The
  current check reads a step's *scripts as text*, which catches a reach the inputs do not show.
- That item 7 is affordable here. It is the right rule in Gradle, where most tasks have real outputs; this
  repo is mostly verification, and "a test's result is its output" has to carry more weight than it does
  there.
