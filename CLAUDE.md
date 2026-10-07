# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Where a new lesson goes, because this file is loaded into every session and grew to 1,095 lines before
anyone asked.** Three quarters of it was two sections, and the largest single block was a 101-line
post-mortem of a subsystem deleted the day before. The rule it taught was three sentences.

So: **the rule lives here in its imperative form with one citation; its evidence lives in `docs/`.**
A paragraph of measurement, a list of what was tried first, or the history of something that no longer
exists is the sign it belongs there — [`reference/pipeline-lessons.md`](docs/reference/pipeline-lessons.md)
for what a rule cost to learn, [`reference/pipeline-commands.md`](docs/reference/pipeline-commands.md) for
what a flag was measured against, [`reference/recorded-artifacts.md`](docs/reference/recorded-artifacts.md)
for the two recorded artifacts that were built and deleted, and `docs/archive/goals/` for a goal that
closed. This is the repo's own comment rule — *"a comment is for whoever opens the file cold, not for
whoever reads the diff"* — applied to the guide that states it, which is the easiest place to exempt.

There is deliberately **no line-count gate**: that would be a figure with no decision behind it, which the
rule below on figures rejects. The guard is this paragraph, where the next person adding a lesson reads it.

## Overview

AgentBuddy is an Electron desktop app with an actor-based architecture. Both frontend and backend are built on XState state machines that communicate through typed events.

- **Backend** (`packages/api/`) — Node.js server (`node:http` + `ws`) using tRPC: transport, process boot and the composition of the app runtime (`@abuddy/host`: XState actor systems, packs, services) over LMDB persistence (`@abuddy/ears/lmdb`)
- **Frontend** (`packages/renderer/`) — Vue 3 + Tailwind CSS plugin system, each plugin is an XState actor with designated UI areas (canvas, panel)
- **Electron main** (`packages/main/`) — Module-based process manager that spawns the API server and manages windows
- **Preload** (`packages/preload/`) — IPC bridge exposing safe APIs to renderer
- **Default Setup** (`packages/default-setup/`) — the built-in pack: features, steps, and seed sources (actions, prompts, flows, library, notes, FAQs, settings) that `abuddy build` compiles into `packages/default-setup/dist/` from `abuddy.json` `boot.seed` (see `packages/default-setup/CLAUDE.md` and `docs/public-facing/seeds.md`)
- **Repo checks** (`packages/repo-checks/`) — the specs whose subject is the repo's own tooling: the chain's graph and cache keys, the recorded spec costs, and the scripts under `scripts/`. A workspace because a spec needs one, and because `npm run spec` routes a `scripts/` change here (see `packages/repo-checks/CLAUDE.md`)

Monorepo using npm workspaces. Requires Node >= 23.0.0.

## Release metadata

Do not edit release/version metadata unless the user explicitly asks for a release or version bump. This includes `package.json` version fields, `package-lock.json` root package versions, app version constants, release notes, changelogs, and generated release artifacts. The release process owns those changes.

## Backward compatibility

**There is none to keep, and assuming otherwise is the more expensive mistake.** Change a signature, a manifest key,
a published export or a stored field's name outright, and migrate every in-repo caller, test, fixture, template and
doc in the same change. No dual-read of an old key and a new one, no alias, no deprecation window, no shim.

That is not a stylistic preference, it rests on a fact: **no pack exists outside this repo.** Third-party
distribution is not built — `resolveFromRemoteRegistry` (`packages/abuddy-cli/src/commands/install.ts:17`) throws
for every name it is given — so every pack that exists is in this tree, where a rename is a change the typecheck
proves you finished. Weighing a design against packs that might be installed weighs it against nothing, and that
caution has a real cost: it is how a repo with no users takes on the constraints of one.

**The exception is stored user data**, which does exist on disk. A renamed `AppState` field, settings key or entity
attribute moves with a migration (`packages/abuddy-host/src/migrations/CLAUDE.md`); a renamed function or type does
not, because nothing has one saved.

**Revisit this when a third-party pack can actually be installed from a registry.** That is the condition. Until it
holds, "an installed pack might depend on this" has no subject, and a plan that treats it as a constraint should say
so out loud so the claim can be checked.

## What to run after a change

**`npm run chain` costs what you changed.** Each step declares what it reads
(`scripts/lib/chain-steps.ts`), is fingerprinted over exactly that, and is skipped when nothing under it
moved — so working out which suite covers your edit is the graph's job, not yours and not a table here. Run
the chain and it runs the subset; it does not need you to have guessed right.

Measured with `npm run measure`, 2026-10-04, each a median of three real runs rather than a sum of the
parts — so each figure carries its conditions and the table can be re-derived rather than trusted:

| What you changed | What the chain runs | Cost |
|---|---|---|
| nothing tracked | nothing | **0.9s** |
| a doc, a comment, a CLAUDE.md | nothing but that — no step declares `docs/`, and a fingerprint skips every `CLAUDE.md` | **0.9s** |
| one package's source (the renderer) | nine of twenty-eight steps: `test:unit:host` (only the renderer's project), `test:integration`, the typecheck legs whose scope reaches it, `lint:check`, `check:specifiers`, `check:tiers` and `build:app` | **38.6s** |
| nothing is cached (a cold tree) | all 30 steps, on a ten-core budget (`--all`, 2026-10-06) | **182.4s** |

**The one-package row is the one worth reading twice**, because the obvious reasoning about it is wrong.
`build:app` rewrites `packages/*/dist`, which looks like it moves what every app-dependent step reads — and
on that reasoning editing a package the app is built from would cost four times editing one it is not. It
does not. `build:app` runs, and `test:smoke`, `test:packaged-authoring` and `test:external-pack:app` stay
**cached** through it: their keys are over the built app's *content*, and a rebuild from unchanged input
produces the same bytes, so nothing they read has moved. That rests entirely on the build being
reproducible, which is the largest single saving in this table and the one nothing else would notice losing —
`npm run check:repro` is the instrument that keeps it true.

So the shape to carry is that an edit costs the steps whose *inputs* moved, and a step that only consumes a
deterministic build is not one of them. Re-derive it with `npm run chain -- --dry`, which names the ten and
the reason beside each.

`npm run chain -- --dry` prints that plan without running it, and says why each step is or is not cached —
which is the way to find out why something you expected to be skipped is not.

**The inner loop is still `npm run spec`**, and it is still much cheaper than a chain run: with no
arguments it runs the specs your uncommitted changes affect, in every package they touch; with a source
file it runs the specs that import it. One spec file is 1-3s and a package's `tsc --noEmit` is 3s, against
the 38.6s a chain run costs after a one-package edit — **not** against the chain's floor, which is 0.9s and so
cheaper than either. What `spec` saves is not the cost of starting the chain but the cost of what your change
made stale. Use it while you are working, and the chain when you are done. A change to
`scripts/` or to a vitest config counts too: it routes to `@app/repo-checks`, the package holding the
specs that check the repo's own tooling.

**Two answers `spec` cannot get from the module graph**, and it names both rather than passing a run that
skipped them. A *pack suite* resolves the published `dist` while the host projects resolve source, so the
edge to its specs runs only through a build — the same reason editing `@abuddy/sdk` can be green under
`spec` and red under `chain`, which declares that dependency (`scripts/lib/workspace-deps.ts`). An
*integration half* is a second vitest config whose specs the root projects `exclude`, and nothing has to
be built to reach it. `npm run spec:full` runs both. The pack seam is also why a pack's own source runs
that pack's whole suite rather than a root `related` — nothing in the root projects imports it.

**Two more edges run through a build, and they are inside one pack.** A pack's `src/seeds/**` compiles to
`dist/*.seed.json`, which `tests/seeds/` reads against its goldens; its **build inputs** — `abuddy.json`,
which drives codegen into `src/__generated__/`, `package.json`, whose `imports` map is how those generated
specifiers resolve and whose `prepare` runs the codegen, and `tsconfig.json`, which the build compiles with —
are what every spec in the pack goes through. Both are `src -> abuddy build -> artifact -> spec`, so a
*regenerated* tree is covered while editing what generates it reaches nothing. `npm run spec`
names those specs beside whatever the walk did find, and `npm run spec:full` builds the pack and runs them.
The routes are derived from the pack's own layout (`scripts/lib/spec-plan.ts`'s `packBuildEdge`), and
repo-checks' `spec-plan.spec.ts` partitions the packs under `packages/`, so a second pack cannot arrive
unrouted. Before them a seed source was told *"No spec covers …"*, which its goldens refute.

Three things the chain cannot work out for you, because they rewrite files you commit:

- **a public export of `@abuddy/ears`, `/sdk` or `/ui`** — `npm run api:update`, and commit `etc/`.
  `typecheck` fails until you do.
- **default-setup's facade** — the types a dependent pack compiles against, bundled by `abuddy build` into
  `dist/types/pack-types.d.ts` and recorded in `etc/pack-types.api.md`. Run
  `npm run facade:update -w @app/default-setup` and commit the report. **`typecheck` does not notice this
  one; `npm run compile` does**, which is the difference worth knowing: `exports:check` and
  `schema:check` are typecheck legs and `api:check` is a chain step, so it is easy to finish a typecheck and believe every recorded
  artifact is current.
  The check needs no build: it re-bundles the facade from the pack's sources, as `api:check` re-extracts the
  reports it compares, so what it holds the report to is what the pack describes now rather than whatever is
  in `dist`. `abuddy build` warns when the report has fallen behind the bundle it just wrote, which is a
  nudge at the moment the information exists and not the gate — the gate is `facade:check`.
- **a pack's seed source (`src/seeds/`)** — when only `sourceHash`/`rowSha256` moved, re-record
  deliberately with `npm run seed-parity:update -w @app/default-setup`, and never edit a hash by hand.
  Re-recording rewrites a test expectation, not user data; what reaches users is the new `sourceHash`.
  `packages/default-setup/tests/seeds/CLAUDE.md` has the rule for what a golden records.

**`api:check` is a chain step and needs no proxy.** It regenerates the reviewed reports and compares, so it is
a derivation and has no staleness record of its own to go stale. It costs **6.9s** — median of 5, 6.7-7.0s,
measured 2026-10-05 — which is less than `typecheck:pack`, so there is nothing a cheaper stand-in would buy.
Two things keep it there: one API Extractor compiler state per package rather than one per entry, and the
three packages' extractions running at once rather than in the series `npm -w a -w b -w c` gives.

**Do not add a proxy for it, and these are the five reasons.** A hash of the declarations a report is a
function of is the obvious cheap stand-in, and every one of its failure modes is worse than the 6.9s:
a doc-comment edit reddens it though no report can move; a package's stamp fingerprints its *dependencies'*
declarations, so clearing sdk's leaves ui's red and one comment costs two round trips; every fix writes a
committed file, including runs that change no report; it cannot see a hand-edited `etc/*.api.md` whose
declarations never moved, which a derivation simply reads as an input. And it races a rebuild in flight —
more than one process touching this tree is the ordinary case — which matters because **the remedy a proxy
names is a write.** `api:update` run inside that window records a hash of a half-written tree into a
committed file and looks like it worked. A derivation cannot: it compares and writes nothing, so a racing
read fails and the next run passes.

**`packages:check` is a chain step, for the opposite reason**: publint and attw over the five published trees
cost seconds together (its declared `seconds` is in `chain-steps.ts`, and the chain reports any run that
contradicts it, on the machine that table was measured on), so there is nothing to build a proxy for, and
its only other homes were the publish workflow
and a CI file whose triggers are commented out — the artifact checks ran at the one moment they cannot be
cheap. It runs `exclusive`, alone: `attw --pack <dir>` packs a tarball inside the tree it is checking and
`stagePublishTree` removes and recreates that tree, so the two must not overlap. It is not the
dangling-published-path check, which publint cannot be — it skips any target behind a custom condition, which
is how 99 published paths named files no tarball held. `@app/publish-checks`' `published-manifest-paths` is
that one.
**Three kinds of recorded artifact, and the question to ask of a new one is which it is.** A
**derivation** re-takes its answer on every run and compares (`schema:check`, `exports:check`,
`facade:check`, `seed-parity:check`, `api:check`) — a missing input cannot happen to one. **Re-taking it
means running whatever produces it**, which is the half that is easy to skip: a check that compares against
an artifact some earlier command left on disk is a derivation in name only, and goes stale exactly as a proxy
does while reading like one that cannot. A **proxy**
records a hash of what it *believes* the inputs are; **nothing here is one any more**, because a proxy can
go stale from an input nobody listed and its remedy *writes*. A **sample** records a measurement, so
neither check is available to it — **there are none, and do not add one.**

**Price the derivation before reaching for either.** `api:stamp` was a proxy for `api:check` purely because
that cost 55s; at 6.9s the derivation is cheaper to keep, and the proxy's whole justification went with the
speedup. And a sample's apparatus outgrows the decision it informs: `spec-cost.json` was 1,884 lines, twelve
records, a band, a window, a tie rule, a machine field and two idle floors, to decide which of two config
files a spec was listed in — a question nine of twelve packages could not even ask. **The quantity was never
one number**, which no amount of hysteresis fixes: one spec read 2.8s in the fast half and 0.64s in the
integration half, 4.37x apart against a band of 2.5x. The half is a decision now, declared by a filename
(`scripts/lib/spec-halves.ts`), and nothing re-derives it.

[`docs/reference/recorded-artifacts.md`](docs/reference/recorded-artifacts.md) has what each of those cost,
measurement by measurement. **The one sample-shaped thing that remains is the chain's `seconds` table**, and
it is a different case: its subject is one machine by declaration (`MEASURED_ON`), `--record` refuses any
other, and `driftVerdict` recomputes a movement without its largest mover so one step's drift is named as
that step's rather than the table's.

The chain is the whole gate: **CI does not run, on purpose.** `.github/workflows/ci.yml` has its `push`
and `pull_request` triggers commented out while this is a single-contributor repo, so `gh run list` is empty
and always will be. That is not a failure to report, and CI is not a check to cite — the local chain is the
check. The workflow's header says when it goes back on.

**And when it does: CI may fail a check, never a clock.** A runner is smaller and noisier than any
developer's box, so anything gating on wall-clock there manufactures flakes that read as code failures.
Three things keep that true and are worth knowing before changing them: every kill deadline is a declared
class rather than a multiple of a measurement (`scripts/lib/step-timeouts.ts`), `--record` refuses any
machine but the one the cost table was measured on (`isMeasuredSchedule`), and the drift report prints its
numbers but no instruction off that machine. CI already does the right thing where it has its own bound —
`ci.yml`'s `timeout-minutes` is a round number nobody measured — and it is the chain that was the outlier.
**Do not gate any of this on `process.env.CI`**: a CI-gated refusal in this repo never fires, and the one
that was cost thirteen spec files a silent green (`@abuddy/host/build/packages-built`, on `ALLOW_UNBUILT`).
The condition is the machine, which is a fact a run can check.

Things that waste the most time, in order:

- **Running anything at all after a doc or a CLAUDE.md edit.** Nothing means nothing: not
  `typecheck`, not the package's suite, not "just to be safe". No step declares `docs/` and `fingerprintUnit`
  skips every `CLAUDE.md`, so `npm run chain -- --dry` reports every step cached. A full `typecheck` is 11s
  against a doc edit's 0s, and repo-checks' *"prose costs nothing"* holds this claim. The two exceptions are
  a spec that asserts the text and a code fence someone will copy.
  **A comment inside a source file is not one of these.** A fingerprint is over the file's content, so a
  comment moves it like any other edit and every step that reads that file runs. The spec above is about
  markdown and does not reach this half, so `npm run chain -- --dry` is what answers it.
- **Sizing an optimisation from a duration.** Three errors, and `npm run chain -- --dry --all` prints the
  answer to the first two. A step **off** the critical path contributes nothing, because the chain admits
  steps in parallel: `test:unit:pack` is the worked warning — **89% setup overhead**, the most alarming
  ratio in the repo, off the path, so halving it buys zero. A step **on** it is capped by the second-longest
  route, so a long step on a dense graph is worth little — `test:packaged-authoring:author` is 95s of a 118s
  path and buys 19s, because another route sits at 99s. Three proposals in one day were sized by reading a
  duration and all three were bounded by a path nobody had computed. And in the other direction, moving a
  step off the path need not shorten the run, because a cold chain is core-bound; what it shortens is
  whatever was waiting behind it. **Read the path and the saving before measuring a ratio.**
- **Running `npm run build` to test a change no build output depends on.** The renderer and API build from
  source; a CLI or SDK change does not need them rebuilt to be tested.
- **Running an E2E suite to find a bug you have a stack trace for.** Build once with `sourcemap: true`,
  decode the mapping, read the source. Do that before you grep, not after.
- **Re-running the full chain after a fix to a thing the chain already covered.** If the CLI suite caught
  it, the CLI suite proves the fix.
- **Reading the source twice to explain a bug the running app would show you.** One instrumented E2E run is
  decisive where two carefully argued explanations were wrong, and the run you already did wrote the app's
  output to `tests/results/app-<workerIndex>.log`. `tests/e2e/CLAUDE.md` has the method.
- **Reading a chain step's `cached` as "the thing it guarantees is true".** It means only that the step's
  declared inputs have not moved. `packages:ensure` guarantees something its own fingerprint cannot see, so
  it carries a `neverCachedBecause`; the three pool steps keep two layers on purpose, because a pool step's
  inputs are the union of its projects' and so cannot disagree.
- **Running suites concurrently *before the packages are built*.** Two suites that both find a stale package
  race each other's build and fail about the race rather than the code. Run `npm run packages:ensure` once
  first and every later call is a stat and a return.

Six rules that pay for themselves:

- **Measure before you optimise, and before you accept someone else's measurement.** Two proposals here were
  rejected by one command each, both having been argued for at length first.
- **A mutation check is worth more than a re-run.** Breaking the thing on purpose and watching the right
  test fail proves more than running the whole suite again.
- **But a mutation check does not redeem a test that mirrors the code.** A case asserting the
  implementation's shape — send X, expect the single line X's handler contains — fails when that line is
  edited, so the mutation fires and proves nothing: it fired because the test restates the line, not because
  behaviour moved. Ask instead whether the code could be **correct but different**; a case that every
  behaviour-preserving rewrite fails encodes the code, and its failure says no more than the diff.
  **A pure re-route needs no new spec** — the typecheck holds the wiring — and *not* finding a behavioural
  claim is the signal to stop rather than to manufacture one. Reaching for one anyway produces this and its
  sibling, a `toContain` over source text, which is a lint rule in a spec's clothing: that belongs in
  `check:specifiers`, this repo's home for call-site rules, or nowhere.
- **A check that reports nothing may have looked at nothing**, and a green run cannot tell you which. Derive
  the subject from the declaration that defines it, and assert it is not empty — in that order, because the
  first is the half that keeps failing. Where the input is data, **mutate it in the test**: drop the thing
  under test from a copy and assert the answer flips.
- **A result that is partial says so, and there are four shapes — copy one rather than invent a fifth.**
  **Refuse** where the evidence is missing (`packagesBuiltOrRefuse`); **a distinct exit code** where "nothing
  covered this" and "everything passed" are different answers (`npm run spec`'s 3); **a named bucket beside
  the total** where only part of the input is anyone's to fix (`pricedSpecs`' `unpriced`); **a clause on the
  success line** where one claim in the sentence did not hold (the chain's `(N of M cached)`). What none of
  them is: silent.
- **A check that cannot fail today is a gate or an assertion, and they want opposite things.** A gate's
  subject is input, so it needs a firing case. An assertion's subject is the program's own construction, so
  being unreachable is the point — what it needs instead is a comment naming the *edit* that would make it
  fire, because that edit is what you mutate to watch it.
- **A list and its type are one declaration.** Write the list and derive the type from it
  (`const XS = [...] as const; type X = (typeof XS)[number]`), or the other way round — never both by hand.
  Four pairs here were written twice and each had a different failure.
- **A cache needs a key that cannot go stale, or a scope in which it cannot — and a reset hatch is neither.**
  Content-key where the input is a file (path, mtime **and** size), scope where it is a tree. If you reach
  for a hatch anyway, give it a case that fails when it is forgotten.
- **A comment is for whoever opens the file cold, not for whoever reads the diff.** What changed, how many
  copies there used to be, what you measured — that is commit-message material. The test: will this sentence
  still be true, and worth reading, a year from now, to someone who never saw the change?
  **No comment reads as a changelog, and this governs a guide's prose as much as a `//` comment.** Write the
  state of the thing, never its edit history: `it was X until <date>`, `renamed from`, `previously called`,
  `this used to be` and `we changed this to` do not belong in the tree. Keep the lesson and drop the history
  that carried it — a trap is stated as a trap (`two clauses keeping it equal to the inputs cannot fail`), not
  as a story about when it was removed. The git log is where the edit lives, and it is one command away.
- **A comment justifying something by a past failure must name what prevents that failure now.** If it is
  this code, say how it fails; if it is something else, name the file; if it is nothing, say nothing checks
  it. "X is the whole point" cannot be checked; "Y fails when Z" can.

[`docs/reference/pipeline-lessons.md`](docs/reference/pipeline-lessons.md) has what each of these cost to
learn — the measurements, what was tried first, and the commit that closed it.
### What a test may read

**A step says what it reads, and whether it needs the built app follows from that.** `needsApp`
(`scripts/lib/chain-steps.ts`) is derived: a step needs the app when it declares one of `build:app`'s
outputs among its inputs. So there is no second record to disagree with the graph, and the ordering comes
from those same two fields whatever anyone writes. Declaring it instead would need two `check:tiers` clauses
to keep it equal to the inputs, and clauses like that cannot fail — which is what redundancy looks like
rather than what protection looks like.

The rule it holds: a step that does not need the app must not reach one, because the moment it does it has
to run after `build:app`, its real inputs become the whole repo, and it can no longer be cached or
reordered. Four attempts at a cheaper chain each failed on exactly that, because nothing recorded it. A
check that genuinely needs the app declares it — that is an answer, not a failure, and the fix is never to
delete the check.

**`npm run check:tiers` asks the one question the inputs cannot answer.** It follows each step's npm
script as text and looks for the ways this repo launches the app, because a step can launch it while
declaring none of its outputs. Being a scan is the safe direction for that half: a wrong scan reports a
false finding, where a wrong cache key is silent. It goes when the action graph can answer "does this
transitively depend on `build:app`" (`docs/archive/plans/one-action-cache.md`, item 18; the follow-up is
`docs/archive/plans/observed-inputs.md`, now closed).

**`build:app` does not satisfy it.** It writes the app rather than reading one, and the rule is about
reading. That distinction is why this replaced a three-valued `tier`, which lumped the producer in
with its consumers: `docs/archive/plans/tier-split.md` has the evidence, and the budget half of `tier` is now
`SIZE_MS` in `scripts/lib/unit-suites.ts`.

`test:external-pack` is split at that boundary: `:contract` validates, builds and typechecks each fixture
pack and runs its harness specs with no app, before `build:app`, and `:app` runs its Playwright suite after
it. Two scripts rather than one with a flag, because the scan reads a step's scripts as text and a branch it
never takes still reads as a reach.

`test:packaged-authoring` is split the same way: `:author` authors, builds, tests and releases a pack with
no app, `:app` runs that archive against one. They hand over a work dir through `tests/authoring-handoff`,
the author half's declared output and the app half's input, so the edge derives like any other — and that
dir stays **outside** the checkout, or a pack built inside it resolves `@abuddy/*` by walking up to the
workspace `node_modules`, which is the thing the check exists to disprove.
[`goal-test-tiers.md`](docs/archive/goals/goal-test-tiers.md) has the rest, and what each of the four attempts at a
cheaper chain measured — written when the declaration was a tier.

## Commands

**A figure earns its place by sizing a choice, and one a record owns is named rather than copied.** Two
different failures: a figure that informs no decision is weight, and a copy of something `chain-steps.ts`
already knows drifts with nothing to catch it. "One spec file is 1-3s against the 38.6s a
one-package edit costs the chain" earns its place; a count the `--list` flag derives does not.
**Name the floor, never quote it.** A sentence like that one, written against "the chain's 27s floor" and
then copied to two other places, goes on arguing from a number thirty times too large the moment per-step
caching moves the floor to 0.9s — and no check holds any of the three. The figure that earns its place is the
one sizing the choice in front of you; the one a record owns gets named so there is a single thing to
re-measure.

**A third failure, which is neither of those: a measurement a decision cites.** `@app/publish-checks`' guide
kept a spec in the fast half *"on the strength of its five `npm pack --dry-run` calls costing ~1.5s"*, and
it measured 3.74s — 2.5x out, with a placement decision resting on it. Such a figure cannot be derived and
cannot be dropped, so it takes the third option, which is already this repo's convention for a measurement:
**it carries its date and its conditions.** `npm run measure`'s output is the format — *"a number without
its conditions is an assertion; with them it is a citation"* — and a number quoted in prose is under the
same rule as one printed by a command.

**What holds any of this is a case, where the figure is derivable, and nothing otherwise.**
`typecheck-legs.spec.ts` is the worked example: it holds this guide's leg count and the sum of the legs'
declared `seconds`, and leaves the wall time beside them as a dated measurement — *"the derivable half is
derived"*. There is no general check here and should not be: a scan cannot tell a derivable count from a
measurement by looking at one, and holding a *measurement* against a record is the `spec-cost.json` disease
the sample section above records. Three drifts were found by review on 2026-10-06 (a spec count 9 short, the
~1.5s above, and a "closest left" another step had overtaken); review is what catches the third kind, because
a causal claim is an argument and no check holds an argument.

**Script names say whether they write.** Three shapes, and the second word tells them apart:

- `<artifact>:check` / `<artifact>:update` — something recorded that can go stale, and the two halves
  carry the *same* noun: `api:*`, `facade:*`, `schema:*`, `exports:*`, `seed-parity:*`. `check` and
  `update` are reserved as suffixes, so a name ending in `update` is the only kind that rewrites a file
  you would commit.
- `<action>:<scope>` — an action over part of the repo: `typecheck:fe`, `test:unit`, `build:be`. The
  second word is a place, and nothing here writes a tracked file.
- `<action>:<variant>` — a variant of one action: `build:dev`, `test:watch`, `lint:fix`.

The point is that the name is derivable: knowing an artifact tells you both its scripts, without a grep.
Put a new recorded artifact in the first shape and give it both halves, even when one half is trivial —
an artifact with only an update is one nothing will notice has gone stale.

```bash
npm start                # Dev mode (builds the built-in pack without its FE bundle)
npm run start:gen        # Full built-in pack build (npm run compile), then dev mode
npm run build:be         # Build backend only
npm run build            # Build all workspaces. The chain runs build:app instead, which leaves the
                         # built-in pack to compile — building it twice rewrote the dist five steps read
npm run build-prod       # Full production build (build/build.sh)

npm run typecheck        # Every check below, plus check:specifiers — its 17 legs run at once
                         # (scripts/typecheck.ts, legs in scripts/lib/typecheck-legs.ts), which is 65.1s of
                         # single-threaded compilers in 18.0s (the wall measured 2026-10-05). The first two figures are
                         # the table's own — the leg count and the sum of what they declare — and
                         # typecheck-legs.spec.ts holds this line to them, so a leg added or re-costed fails
                         # here rather than leaving the sentence to drift. The wall time is a measurement and
                         # can only be re-measured. Only `packages:ensure` is ordered; the rest are
                         # independent, and `-- --cores 1` runs them one at a time to test that claim or to
                         # read a confusing failure. A failure prints that leg's output alone, and several
                         # legs can fail in one run where the old `&&` chain stopped at the first
npm run typecheck:fe     # Frontend only (vue-tsc)
npm run typecheck:be     # Backend only (tsc --noEmit, plus the api's scripts)
npm run typecheck:ears   # @abuddy/ears only
npm run typecheck:sdk    # @abuddy/sdk only
npm run typecheck:host   # @abuddy/host only
npm run typecheck:ui     # @abuddy/ui only
npm run typecheck:cli    # @abuddy/cli + @abuddy/testing
npm run typecheck:scripts # scripts/ and tests/
npm run typecheck:pack   # @app/default-setup only
npm run exports:check -w @abuddy/ui  # Fails on a stale exports map or a component without an entry

npm run spec             # The specs your uncommitted changes affect, wherever they live.
                         # **Three exit codes**: 1 a spec failed; 2 the name was wide enough to be a search,
                         # so the paths were listed rather than run; 3 the target exists and no spec covers
                         # it, so nothing ran and nothing passed. 3 matters because `vitest related` exits 0
                         # when the graph reaches no spec.
npm run spec:dry [...]   # What the plan would run and what the last run here measured it at, running
                         # nothing (~1.6s). File time summed across workers, never a wall estimate, with
                         # the date it was measured; a spec no run here has seen is named, not counted free.
                         # Nothing is committed and nothing can describe another machine.
npm run spec:full [...]  # The same, plus the two answers the module graph cannot give: the pack suites a
                         # rebuilt dist would reach, and the integration halves behind a second config.
npm run spec -- <target> # You don't say what the target is; it works that out:
                         #   a source file  -> every spec that imports it, transitively, in ANY package
                         #   a spec path    -> that spec        a directory -> every spec under it
                         #   part of a name -> every spec whose path contains it
                         #   a pack's src/seeds/** or a build input -> the walk, plus the specs that read
                         #                     what building it produces (named here, run by spec:full)
                         # Anything from the first `-` goes to vitest untouched, so `-t "a case"`,
                         # `--bail 1` and `--changed HEAD~1` work. The routing is data
                         # (scripts/lib/spec-plan.ts), asserted by repo-checks' spec-plan.spec.ts.
                         # Where a spec belongs: its path under tests/ mirrors the source it covers
                         # (docs/reference/test-inventory.md; repo-checks' spec-placement.spec.ts).
                         # **A pack suite and an integration half are not in a plain run's answer** — one
                         # resolves the published dist, the other is a second config the root projects
                         # exclude. docs/reference/pipeline-commands.md has the blast-radius figures.
npm run chain            # Before a merge: every check in dependency order, cold 158s and warm 0.9s.
                         # Each step is cached on the inputs it declares (scripts/lib/chain-steps.ts), so a
                         # doc edit runs nothing and a one-package edit runs that package's suite. The E2E
                         # suite is opt-in rather than a gate.
                         # **Never pipe a backgrounded run**: it buffers output and prints only a failing
                         # step's, which `| tail` discards and a passing re-run never brings back.
                         # Afterwards, on the machine its table was measured on, it names what the run
                         # contradicted — a step past double its declared `seconds`, one that passed and is
                         # already stale again, one whose measured cost outgrew its timeout rung.
                         #   --dry      the plan, why each step is or is not cached, and **what bounds it**:
                         #              the critical path, plus **the most any step on it could buy**. A
                         #              step off the path runs in the shadow of the ones on it, and a step
                         #              on it is capped by the second-longest route — measured 2026-10-06,
                         #              a 95s step on a 118s path buys 19s, because another route sits at
                         #              99s. Read both before sizing an optimisation. `--dry --all` gives
                         #              the cold chain's, since `--all` plans every step
                         #   --all      every step regardless of its stamp
                         #   --cores N  how much of the machine to spend; this machine's cores by default,
                         #              and a step declares its own width (POOL_WIDTH, core-budget.ts)
                         #   --e2e      run the E2E suite with the chain, ordered after test:smoke
                         #   --record   write each step's measured cost into its table. Needs --all, and
                         #              refuses another machine, another budget, or a busy box
                         #   --force    record anyway, and know the number is forced
                         #   --forget   with --all --record, write every row rather than the drifted ones —
                         #              for a change you know about, not to chase a drift you do not
                         #   --step <name>  with --forget, that one row and no other. **The usual form**,
                         #              and the one the drift report names for you
                         #   --adopt    record on another machine, rewriting MEASURED_ON with the costs
                         #   --no-classify  do not re-run a step that failed while the machine was busy
                         # docs/reference/pipeline-commands.md: what each flag replaced and what was
                         # measured to choose it, including the three guards that do not separate a
                         # correlated drift from one step's.
npm test                 # Playwright E2E tests. **A harness, not a gate** — see below
npm run test:unit        # Vitest, as two pools: the host suites as one root run under the
                         # @abuddy/source condition, and the pack suite on its own resolving the published
                         # dist. Serial, measured — a second lane buys 3% for 87% more work.
                         # The list is scripts/lib/unit-suites.ts, which the chain reads too
npm run test:integration # The expensive half of every suite that has one (@abuddy/cli, @app/repo-checks,
                         # @app/publish-checks), as **one vitest run** over vitest.integration.config.ts's
                         # projects rather than three `npm -w` invocations in series: measured 2026-09-29,
                         # 48.2s pooled against 71s. Which packages those are is derived from the configs
                         # each has (INTEGRATION_SUITES); the root config's project list is checked rather
                         # than derived, because check:specifiers reads these files as text.
                         # **It is the third pool**, not a fourth kind of thing: the same runner as the two
                         # unit pools (scripts/test-unit-pool.ts, over POOLS in scripts/lib/unit-pool.ts),
                         # so it runs only the projects whose inputs moved — a repo-checks edit is 6s of its
                         # 44s. A pool is a resolution and a half; this one shares the host resolution and
                         # differs in the half, which is why its stamps are keyed (dir, half). One key for
                         # both would skip the expensive half on the fast half's record, which is the hole
                         # that keying it this way exists to close
                         # It runs at half the cores, and that is faster than all of them — 48.2s capped
                         # against 52.4s uncapped, since nine workers each running ts.createProgram and
                         # abuddy build put the box at a load of 25-32.
                         # **The birpc timeout the cap was written against is a worker blocking its own
                         # event loop**, not a main thread too busy to answer: measured 2026-09-30, the
                         # main process sits at 6% event-loop utilisation with a worst block of 74ms,
                         # quiet and loaded alike. A worker runs each case synchronously and `await` on a
                         # resolved promise drains microtasks without turning the loop, so a file of
                         # synchronous cases is **one** block however many `it`s it holds — against
                         # birpc's hardcoded 60s window (DEFAULT_TIMEOUT = 6e4, which vitest exposes no
                         # knob for; vitest-dev/vitest#4497, #6479, #8164). Every test passes and the run
                         # exits 1.
                         # The fix is to turn the loop: `afterEach(() => new Promise(r => setImmediate(r)))`
                         # caps a file's *cases* at the longest of them. Six files have it, and
                         # `npm run measure:loop` found the last two — measured 2026-10-06,
                         # `published-sdk-any` was the half's worst block at 13.6s over eight ~200ms cases
                         # and `published-exports` 9.1s over four. Neither was slow; each was a sum being
                         # reported as a block, which is the shape to look for.
                         # **The hook is not a cap on the file**: those two came down to 9.6s and 5.6s, not
                         # to one case, because a synchronous `beforeAll` is its own block — theirs packs
                         # three tarballs through execFileSync. The half's worst block went 13.6s to 11.6s
                         # and its headroom 4.4x to 5.2x. What is left is a setup to make cheaper, and a
                         # single long case the hook can never help: `types-bundler-determinism` is one
                         # test of ~11.6s and is the floor on this headroom now.
                         # **Do not try to split that one.** It is a single `it` that builds the facade
                         # twice — once from the workspace, once from the packed tarballs — and compares
                         # them, so the comparison needs both in one scope: two cases would share a
                         # `beforeAll`, which is its own block and shrinks nothing (watched on
                         # `published-sdk-any`, 13.6s to 9.6s and no further), and two files would need one
                         # to write a hash for the other, which is the cross-file state a determinism test
                         # must not have. The levers are making the two builds faster or leaving it.
                         # **The margin is the thing to watch, not the duration**: it breaches at 5.2x
                         # against a worst observed load inflation of 3.29x, so the trigger is the block
                         # passing ~18s (60s / 3.29), where that load would breach. `measure:loop` is how
                         # you find out; nothing watches it for you.
                         # To reproduce on demand rather than wait for it:
                         #   npm run measure -- --trials 3 --busy 12 "npx vitest run --config vitest.integration.config.ts"
npm run test:unit:host   # Two of the three pools, running only the projects whose own inputs changed
npm run test:unit:pack   # (--project per stale project, one process). Each is a chain step; per-package
                         # staleness lives inside them, so a one-package edit still runs one project.
                         # They cannot be one pool: Node conditions are per process, and vitest shares its
                         # worker pool across projects. Each runs packages:ensure first, since npm pretest
                         # does not fire under a root run, and then prunes the pool stamps no pool would
                         # write — the key gained its half on 2026-10-01 and left a dead file per suite
npm run test:all         # test:unit, then the E2E tests
npm run bench -w @abuddy/ears    # EARS engine benchmark (baseline and tolerance: packages/abuddy-ears/CLAUDE.md)
npm run test:external-pack       # Both halves of the fixture-pack check, for running it by hand
npm run test:external-pack:contract  # validate, build, typecheck, harness specs — no app needed
npm run test:external-pack:app   # each pack's Playwright suite against this checkout (needs npm run build)
npm run test:packaged-authoring  # Both halves, for running it by hand: author, build, test and install a pack
                                 # outside the monorepo from the packed @abuddy/* tarballs (needs npm run build)
npm run test:packaged-authoring:author  # The half that needs no app — eight of its nine phases
npm run test:packaged-authoring:app     # The ninth, against the built app, from the author half's archive
npm run compile          # Build packages/default-setup (abuddy build: compiled seeds, snapshot, types; DSL defs; dist/runtime/index.cjs)

npm run db:query -- "<code>"   # abuddy db query on the dev app's data (also db:exec, db:repl, db:inspect,
                               # db:export, db:import, db:reset, db:clear-settings; the app closed for changes)

# Published API surface (from the root for all three, or inside one of the packages for just it)
npm run api:check        # CI: fails if a public entry's API changed without updating reports
npm run api:update       # Dev: regenerate etc/<entry>.api.md (and etc/<entry>.component.md for UI components),
                         # Both read an @abuddy dependency's built declarations: npm run packages:build first
                         # All three take 6.9s (median of 5, 2026-10-05), run at once by scripts/api-check.ts
                         # rather than in the series npm's `-w a -w b -w c` gives; 12s in that series, and 48s
                         # before one API Extractor compiler state was shared across a package's entries.
                         # A chain step, so a merge runs it and an unchanged tree pays nothing for it

# Built-in pack facade types (from packages/default-setup or with -w @app/default-setup)
npm run facade:check     # CI: fails if the facade the pack's sources describe isn't what etc/pack-types.api.md
                         # records. **Needs no build**: it regenerates the pack's barrels and re-bundles the
                         # facade itself (2.4s, median of 3, 86% idle, 2026-10-06), so `dist` is never its
                         # subject and a build from older sources cannot be mistaken for one
npm run facade:update    # Dev: regenerate etc/pack-types.api.md, off that same re-bundle
                         # Both are `abuddy facade-report [--update]`: it reads one pack's sources and writes
                         # that pack's etc, so it is a CLI command like `validate` and `build`, not a repo
                         # script. As a repo script its normalisation had to live in a third package to be
                         # reachable from both it and the bundler, which is what the wrong home costs.
                         # `abuddy build` warns when the report has fallen behind the bundle it just produced
                         # — free there, and a nudge rather than the gate: failing would mean a pack author
                         # could not start their app until they had rewritten a reviewed artifact mid-change

# Manifest JSON schema (-w @abuddy/sdk)
npm run schema:update    # Regenerate packages/abuddy-sdk/abuddy.schema.json from manifest-schema.ts
npm run schema:check     # Fails if abuddy.schema.json is stale

# Seed goldens (-w @app/default-setup)
npm run seed-parity:check   # Compare seeded rows against tests/seeds/__golden__
npm run seed-parity:update  # Re-record them; deliberate, see "What to run after a change"

npm run measure -- "<cmd>"  # Times a command on a quiet machine and prints a number you can quote:
                         # `48.2s median of 5 (45.0s-49.3s), 92% idle, 2026-09-30`. A number without its
                         # conditions is an assertion; with them it is a citation.
                         #   --runs N          how many (5)
                         #   --against "<B>"   an A/B, interleaved, reported as the median of the pairs,
                         #                     with cores busy per arm
                         #   --trials N        how often does it *fail*? The rate and its 95% upper bound
                         #   --busy N          N CPU burners, so contention is induced rather than waited for
                         #   --idle PERCENT    lower the floor    --force  measure anyway
                         # Refuses below 70% idle, or 80% for a command that records; idle is sampled
                         # between runs, never during one. Prints, never records — a timings file would be
                         # a sample, and the deleted spec-cost.json is what that costs.
                         # **A null A/B is unfalsifiable until the independent variable is shown to have
                         # moved**, and this cannot do that half for you: read the config before guessing
                         # at the knob, run the positive control first, and prefer the thing's own report
                         # (vitest names its worker count) to the cores-busy proxy.

npm run measure:stretch -- <step>  # How much a pool step loses when the box gives it fewer workers — the
                         # `stretches` a rung or a step declares (scripts/lib/step-timeouts.ts). Derives the
                         # command (`measureCommandFor`), this box's width and the width on a box
                         # `SLOWER_MACHINE` times smaller (`coresFor`), and runs them as one `measure
                         # --against`; the ratio of the medians is the figure. **Refuses a step that declares
                         # no `POOL_WIDTH`**: serial work stretches by CPU share, which no flag fakes, so the
                         # answer there is a smaller machine — what each rung's `until` asks for.
                         # Check the arms report the worker counts it names: an A/B whose knob did not turn
                         # reports ~1.0x and reads as a step that does not stretch

npm run measure:loop -- "<cmd>"  # Not how long a command took, but how long each process it started went
                         # without turning its event loop, against the 60s window birpc gives a call and
                         # vitest hardcodes. Per process, worst block first, with the headroom rather than
                         # the block alone — 38s against 60s is one busy afternoon from failing. `elu` says
                         # whether a quiet process was waiting or working.
                         # docs/reference/pipeline-commands.md has the measured habits behind both.
# Lint (root runs every workspace that has one; oxlint, plus eslint in the renderer)
npm run check:idle       # Is this machine quiet enough to measure on, and for which kind of measurement —
                         # `89% idle — quiet enough to record on`, exit 1 below the recording floor.
                         # **Two floors, because what a command leaves behind decides how quiet it needs to
                         # be**: recording needs 80% (`chain --record`), printing needs
                         # 70% (`measure`, `measure:loop`). It reports both and exits on the stricter,
                         # being a pre-flight for --record; a reader who only wants to print is told so.
                         # Two commands refuse when the box is busy and neither could be asked in advance:
                         # `measure` refuses before it runs anything, and
                         # `chain --record` refused *after* the run, which is where the answer arrives too
                         # late — twice on 2026-10-04 that spent 200s to be told the box was 69% idle. The
                         # chain asks first now as well, and this is the same reading as a command, so it
                         # composes: `npm run check:idle && npm run chain -- --all --record`.
                         # **It answers "is it worth starting", not "will this be clean"**: a reading is of
                         # this instant, and a long command is its own load — the chain reads 83% before a
                         # run that ends under the floor. Not a chain step, and must not become one

npm run check:specifiers # Every import rule, over the whole repo (2.5s, one parse and one tree walk). Takes paths to
                         # run only the per-file rules over them (0.9s over one feature), and says which
                         # whole-tree rules it skipped; --rule <id> runs one, --list prints them all
npm run specifiers:fix   # Rewrites the specifiers whose repair the rules compute — an own-module specifier
                         # that names no file, a relative .js whose source sibling exists — and reports the
                         # rest. --dry prints without writing. Verifies each span before splicing and refuses
                         # a whole file when the disk and the reader disagree

npm run lint:check       # Reports; run by npm run typecheck, so it is in the chain. The whole tree is at
                         # zero and the whole pass is about a tenth of a second.
                         # **Only `correctness` is enabled**, in every invocation — so a rule outside that
                         # category is read nowhere in this repo, and an inline disable naming one
                         # suppresses nothing wherever it sits. `no-console` is the one to know: it is a
                         # `restriction` rule, and `console` in a pack's backend is the `backend-console`
                         # pack rule's job, not oxlint's. The scaffold's templates are the one exclusion,
                         # since an unused parameter there is documentation for a pack author. The few
                         # inline disables elsewhere each say why
npm run lint:fix         # Rewrites what it can — oxlint has no fixer for no-unused-vars, so it will
                         # not clear those for you

npm run packages:build   # Build dist/ for @abuddy/ears, @abuddy/sdk and @abuddy/ui, bundle @abuddy/cli and @abuddy/testing
npm run packages:check   # publint + arethetypeswrong on the five published trees (after packages:build).
                         # A chain step; see "api:check is not a chain step" above for why this one is

npm run check:repro      # **A diagnostic instrument, not a gate**, and nothing runs it on a schedule by
                         # design: everything it compares is a chain input, so the chain's freshness sweep
                         # already reports a step that went stale again. What this adds is asking per file
                         # in one run — the sweep fired on PACK_OUTPUTS for days and the diagnosis blamed
                         # esbuild and one file, where this found three and the cause (tsc's union
                         # ordering). Builds everything twice from one input and compares 1295 built files
                         # (54.7s measured 2026-09-28). Run it after bumping a bundler (esbuild, vite,
                         # tsup, tsx), which is when the answer can change, or before cutting a release.
                         # Three outputs are known-irreproducible and reported rather than failed
                         # (KNOWN_IRREPRODUCIBLE, scripts/lib/repro.ts). They are races, so a run where one
                         # agrees is not evidence it is fixed — which is why a stale entry is reported here
                         # and failed everywhere else. docs/archive/goals/goal-reproducible-builds.md has
                         # the measurements
```

### E2E visual testing

**Driving the app now has its own place: `drive/`, run with `npm run drive` (a pack author gets
`abuddy drive`).** That is where an agent debugs and develops against the app — open what you just built,
click through it, read the state back, screenshot it. Scripts there import `drive` rather than `test`,
nothing collects them, and nothing gates on them. **`npm run drive:serve` holds one app open and answers
HTTP instead**, which is what to reach for when a question needs several verbs: a script is a closed
program, so each question costs an edit, a process start and an app launch, where a session answers many.
`docs/public-facing/cli.md` has the verbs.

**One directory here is a gate: `tests/e2e/smoke/`**, as its own chain step (`test:smoke`, 6s). Its four
cases are the ones every other check silently assumes — the app launches without crashing, reaches `connected`, has
its plugins, and runs in its own data dir. Taking the suite off the chain took that with it, which is the
one thing worth paying for.

**The rest is not a regression suite, and is not in `npm run chain`.** It was built to watch the app while
writing a feature, and it became a chain step while the reasoning around it drifted into caching policy —
a question you only ask of a gate. It has not caught a regression. What earns a place here now is a test
that asserts something a future change could break **and** needs the real process boundary; everything
else is either a harness test or a driving script (`drive/`).
`npm run chain -- --e2e` runs it with the chain when you want it — ordered after `test:smoke`, since both
drive Playwright at `tests/results` — and `npm test` runs it alone.

Playwright tests launch the full Electron app and interact via `window.applicationState` (the XState actor). Use to visually verify UI changes.

```bash
npm test                              # Run all E2E tests
npm test -- smoke                    # One directory: smoke, ui or app-integration
DEBUG_E2E=1 npm test                  # With Electron stdout/stderr logging
npm run test:headed                   # Show the app's windows, to watch a test drive it. Under Playwright
                                      # they are never shown or focused (PLAYWRIGHT_VISIBLE, the guard in
                                      # packages/main WindowManager, the splash and the protocol handler)
npm run test:explorer                 # Playwright's UI mode: its test explorer, with a timeline and DOM
                                      # snapshots. Playwright's own window, not the app's — the two are
                                      # orthogonal, and `--debug` is a third thing (the Inspector)
```

This suite takes no screenshots — looking at the app is `drive/`'s job, and `npm run drive` saves to `drive/screenshots/`. The `app` fixture provides `navigate(pluginId)`, `screenshot(name)`, `sendEvent(event)`, `getState()`, `getContext()`, `waitForState(check)`, and `waitForPlugin(pluginId)`.

The fixture is `@abuddy/testing` (`packages/abuddy-testing/src/index.ts`), which every spec imports directly, as a pack's own do. It launches Electron, finds the main window via `window.applicationState`, bypasses onboarding, and provides the `AppHelper` API. External packs share the same fixture — `abuddy init-tests` scaffolds tests in a pack repo, then `abuddy test` runs them in a local checkout (`--app-root`) or a downloaded AgentBuddy Beta (`--app beta`). Set `PACK_DIR=/path/to/pack` to sync/build a pack and wait for its plugins.

For full fixture lifecycle, API reference, and ad-hoc testing pattern, see `tests/e2e/CLAUDE.md`. For external pack testing details, see `packages/abuddy-testing/CLAUDE.md`.

## Architecture

### Event-driven actor system

Every backend **system** and frontend **plugin** is an XState state machine. They communicate via a central event bus:

- **Backend → Frontend**: `broadcastToPlugin(name, event)`, in a system's actions or anywhere else; actions use `services.emitter.broadcastToPlugin`. It goes over the bus, so it reaches **every** window showing that plugin — a plugin runs once per window. The renderer's `sendToPlugin(name, event)` is the other half: straight to this window's actor. **A broadcast does three jobs and only one of them is an answer** — a notification nobody asked for, a view's data fetch, and a command's result — and which one an event is doing decides both its channel and its shape: a notification is never correlated, a fetch wants its answer in a slot keyed by what was asked, and a command's result is **replied** rather than broadcast, correlated by the envelope's call. `packages/default-setup/CLAUDE.md` has the three with the worked examples; getting it wrong is where an answer taken for the wrong request comes from
- **Frontend or backend → System**: `sendToSystem(systemId, event)`, typed with the events each system declares (own systems by feature id, a dependency's as `<dependency>/<feature>`; actions name every system `<pack>/<feature>`)
- **System → System**: `sendToSystem(name, event)`, the same typed send a plugin uses; no pack code looks up another system's actor. `sendToSystem({ role }, event)` reaches whichever system plays a role (`{ role: 'brain' }` with `TRIGGER_BRAIN_EVENT` fires a flow event), and `host/bus` takes `PACK_CHANGED` (`HostSystemEvents`)
- **Child actors are private**: a feature spawns its children with an `id` and no `systemId`, and reaches them through its own snapshot's `children`; another feature sends the feature an event, which it routes to the child (the code plugin routes `<child>.*` events by prefix)
- **Frontend**: a component reaches its own plugin with `usePlugin()` (`@abuddy/sdk/fe`); the host renders each plugin's canvas, panel and chat in a `PluginScope` for it, and the app's Settings view renders each plugin's settings form in one. No pack code looks up another plugin's actor, and no feature imports another's frontend at all (the `cross-feature-imports` pack rule, run by `abuddy validate` for every pack and by `check:specifiers` for this repo's): what a feature offers the rest is its plugin's `Contract` — the state it publishes, read with the `usePluginState`/`readPluginState` its `#generated/fe` generates, and the inbox others may send, which types the sends. `openPlugin` (`#generated/fe`) takes only the names the pack can write (`PluginName`: its own features, its dependencies' `<pack>/<feature>`), so a misspelled target doesn't compile; a target that arrives as data (a link block's) opens through `untypedOpenPlugin(ref, event?)` (`@abuddy/sdk/fe`), which refuses a string that isn't a ref and asks the shell to open the rest: the shell waits for a plugin whose pack's frontend is still loading, and tells the user about a ref no pack provides once loading has settled
- Pack code takes `broadcastToPlugin`/`sendToPlugin`/`sendToSystem` from `#generated/events`; `onConnected`/`onIncoming` come from `@abuddy/sdk/events`. `check:specifiers` rejects the host's raw event paths (its root event bus and API client) and the untyped sends in pack sources
- **Addressing is an envelope**: a send is a message, `{ to, event, from?, via?, client?, sender?, call?, answering? }`, and `event` arrives exactly as the sender wrote it, so an event may carry any field, `pluginId` or `systemId` included. `from` is the id of the pack that sent it, stamped by the sends `#generated/events` builds; `via` is what within that pack made the send when the pack alone doesn't say — `action:<label>` for an action, stamped by the emitter `createActionEmitter` builds per run, the same string that names the action's logger. `from` keeps one meaning, the pack, so nothing parsing it as a `<packId>/<featureId>` ref gets a wrong answer; `via` names a source, of which an action is one — `reportError`'s sends carry the source they were given and no `from`, having no pack to name. Between them every send carries a pack, a source, or both, except `services.emitter` reached outside an action, where neither is in scope. Nothing routes or refuses on either: every diagnostic that reports an undeliverable message names them — the bus's drops, `receiveClientEvent`'s errors, the shell's toast for an in-window send that reaches no plugin (however long it waited for its pack), and the shell's warning for a backend send that does. All of them go through one `senderSuffix` (`@abuddy/sdk/events`), so they word it the same. `client` is the one field that routes, and so the one a sender never sets: it names the connection to deliver to, absent meaning every connection, and the API mints it per WebSocket connection and stamps it on the way in (`createContext`, `packages/api/src/transport/context.ts`) — which is what makes it a return address nobody can forge. `sender` is the other half of a return address: the ref of the participant that sent it, which is what an answer is addressed to. It is stamped where a send is *made* — during the handling of another message, from the delivery in scope — because a pack's generated sends know their pack and not which of its features called them, and it is accepted from the wire where `client` is not, since the client is the only party that knows which of its plugins asked and every caller already holds the API token anyway. A system answers with `reply(event)` from `@abuddy/sdk/events`, which names no address at all: it reads the message being handled and sends to its `sender` on its `client`. Nothing is stamped onto the event, so a return address is never a field of the event — the invariant `outgoing-events.spec.ts` pins. Four doors set the scope — the bus routing to a system, the host handing one to an early system, `sendToPluginActor` (the one function every send to a plugin's actor goes through) and `usePlugin`, so a component's own send is named too — which between them cover every send pack code makes; `reply` throws rather than broadcasting for a send made from nothing (a timer, a subscription, host plumbing). **`call` is the call a message *is* and `answering` the call it *answers*, and between them they are the app's one correlation.** Every send mints a call (`createSends`), `reply` stamps `answering` with the call it was entered under, and a delivery door puts that on the delivered event under a reserved key — which is the only channel to a transition guard, since a guard is handed `{ context, event }` and nothing else. **No event type declares a correlation field, and none should.** Pack code never reads the raw value: it asks `answersCall(event, outstanding)` where it holds one outstanding ask, or keys several with `recordCall`/`settleCall`, both from `@abuddy/sdk/events`; `newCall()` mints one where the id is needed before the send (an `enqueueActions` body). `_callOf` is host-only — a raw call invites `===` against a stored one, which answers *true* when both are absent, so a guard written the obvious way admits an answer nobody asked for. A spec driving a machine with no delivery door in front of it builds an answer with `answerTo` (`@abuddy/sdk/testing`), and the `reserved-event-keys` pack rule refuses a pack writing the key itself. The API's `bus.send` schema names `from`, `via`, `call` and `answering` so a client's send and a backend's answer both keep them, and omits `client` on purpose; every other field a client invents is still dropped there, so a field added to the envelope and not to that schema arrives as `undefined`. The bus, the API's `bus.send` and its subscription, and the renderer route on `to`; messages sent in go to systems, messages sent out to plugins. The subscription routes on `client` too, which is why a window never sees a message that was not for it.

A system's contract declares its `context` and its `incoming`, `internal` and `outgoing` event unions as one type, which `defineSystem<Contract>()` takes and `abuddy.json` names. System code lives in `packages/default-setup/src/features/<name>/be/system.ts`, its contract in `be/contract.ts` beside it; its identity is its feature's, from `abuddy.json`, which codegen passes to `packSystem`; a feature's designation comes only from `abuddy.json` `features[].designation`, and is a role rather than a name: it need not equal the feature id. The bus machine is `createBusMachine` in `packages/abuddy-host/src/bus`; `createAppBus(registry)` there composes it with the app's root event bus (the api's tRPC event sources), and `packages/api/src/runtime/index.ts` starts it. Systems register through the app's registry (`createPackRegistry()` in `packages/abuddy-host/src/packs/registry.ts`, its `registerPack()`). Every pack's systems and plugins run under `<packId>/<featureId>`, built-in packs included — the app itself is the pack `host` (`host/bus`, `host/application`, `host/packs`, `host/settings`), so there is no namespace of bare ids and a pack can't take the id `host`. Pack code names features — its own by id, every other (the host's too) as `<packId>/<featureId>`; the ref it runs under is spelled the same, so a bare name is only short for the pack's own: the sends (`broadcastToPlugin`/`sendToPlugin`/`sendToSystem`) and `openPlugin`, generated in `#generated/events` and `#generated/fe`, resolve the name (`resolveName`, `@abuddy/sdk/ids`, is the one rule; `splitRef` takes a ref apart). The registries resolve what registrations name: a pack registers its `features` keyed by feature id on both sides (`PackRegistration.features`: each one's system, plugin, role, services and settings; `PackFERegistration.plugins`), each registry runs every feature at its ref, and both refuse a key that isn't a feature id (`FEATURE_ID_PATTERN`, `@abuddy/sdk/ids`).

**One name per concern, `untyped` for the unchecked half.** A pack reaches most of the SDK through its generated
facades, which check the name and the payload against what the pack and its dependencies declare. Every such helper
has an untyped twin for a target that arrives as data or for host code, which has no pack to be typed against, and
the twin is the typed name with `untyped` in front: `qx`/`untypedQx` and `tx`/`untypedTx` (`@abuddy/ears`),
`usePluginState`/`useUntypedPluginState`, `readPluginState`/`readUntypedPluginState`, `openPlugin`/`untypedOpenPlugin`
(`@abuddy/sdk/fe`), `broadcastToPlugin`/`untypedBroadcastToPlugin` and `sendToSystem`/`untypedSendToSystem`
(`@abuddy/sdk/events`). The point is that a call site says whether the compiler checked it without anyone reading
the imports, so a new escape hatch takes the prefix rather than a new verb or the same name in another module.

The `_` prefix is a different axis and doesn't combine with it: `_sendToLocalPlugin` and `_rootEvents` are
host-only, which `check:specifiers` enforces by the underscore, and packs may not import them at all — where an
`untyped*` helper is something a pack may use and simply isn't checked on.

**That is the `_` that carries a rule. A `_` on a local or a parameter is an unrelated convention** — a binding
deliberately left unused, as `_z` and `_flowId` are in an action's signature, which oxlint prescribes and nothing
enforces. The two never collide in practice, one being an export and the other never one. The trap is reaching
for the second on dead code: a declaration nobody reads is not deliberately unused, it is simply gone, and
prefixing it hides it from the gate that just found it — which is how seven dead declarations survived a sweep
whose whole point was to remove them.

### SDK packages

`@abuddy/sdk` is the pack-facing API; host-only modules live in the private `@abuddy/host` (`packages/abuddy-host`). Packs, built-in or external, import only `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/ui`; host code (api, renderer, CLI and testing) also uses `@abuddy/host`; default-setup, tests included, does not depend on it. `npm run check:specifiers` rejects `@abuddy/host` in pack sources and CLI templates, and `abuddy build` fails a pack bundle that imports it. Pack code reads relations with `findRelations`/`getRelationStats` and queries untyped with `untypedQx` (`@abuddy/ears`), reaches host-implemented data operations through `services.appData` (reset, backup export/import, whether the user finished onboarding), `services.traceStore` (the volatile trace store), `services.secrets` (the user's API keys as metadata: list, select, rename, delete; never values) and `services.filesystem` (files and folders on disk, as text), and calls models through `services.inference` (AI SDK 7's `generateText`/`streamText`, `createAgent`, `embed`/`embedMany`, `generateImage`, `generateSpeech`, `transcribe` and `rerank`, with `provider:model` ids checked against `providerCapabilities`, `output` as an `Output` or plain data like `{ type: 'object', schema }`, and the key the user selected per provider, never the environment; packs import pure pieces like `tool` from `ai`).

Layers, each importing only the ones above it (`check:specifiers`, `findUpwardImports`, and each `package.json`'s `@abuddy` dependencies):

| Layer | Holds |
|---|---|
| `@abuddy/ears` | the engine, the EARS types, the persistence port (`/lmdb`: the LMDB store) |
| `@abuddy/sdk` | the pack contract and pack runtime: registries of what packs registered, the services' contracts, event sends, logging and error reports over the bound bus, the SDK entities and their repositories, the `HostRuntime` port |
| `@abuddy/host` | the app runtime, and the app's own features: `features/` is the pack `host` (`application`, `packs` and `settings`, each `{be,fe}` as any pack's are), and beside it what every pack runs on — the six app services (`/services`), app state (`/app-state`), `/packs` and `/packs/runtime`, `/bus`, `/migrations`, `/secrets`, the frontend's plumbing (`/fe`) and its database opened outside it (`/database`) |
| `packages/api` | transport (`node:http`, `ws`, the tRPC routers, the log stream), process boot and composition (`runtime/index.ts`); `src/` is one folder per job — `boot/`, `runtime/`, `transport/`, `adapters/` — which `packages/renderer/src` mirrors with `views/` added |
| `packages/renderer` | the frontend composition: binds the frontend port, and composes the host's shell with the window's I/O (the API client, the pack loader, storage, the toast and error page); `src/` is the API's four job folders plus `views/` |

**Those five are the layers worth reading; `findUpwardImports` enforces twelve.** The rest are tooling and
shells — `@abuddy/ui` (which may reach `@abuddy/sdk` and nothing else), `@abuddy/testing`, `@abuddy/cli`,
`@app/main`, `@app/preload` (the narrowest: a sandboxed bridge may not reach the app runtime),
`@app/repo-checks` and `@app/publish-checks` — and what each may import is in `LAYERS`
(`scripts/check-import-specifiers.ts`). A hand-written list says nothing about the workspaces it omits, so
the rule derives its own population instead: a workspace holding code has a layer or is a pack, whose imports
the pack rules govern more narrowly. Deriving it rather than listing it is what surfaces a workspace nobody
added — it found four dependencies three packages imported and none declared.

What crosses to the app follows one rule, **bind resources, derive behaviour**. A resource has identity per running app (the event bus, the engine and its data, the registered packs, services doing I/O on user data or keys) and is a `HostRuntime` member; behaviour over a resource is SDK code, written once for the app, tests and tooling. So event sends, logging and error reports are SDK code over the bound bus, not host implementations. `services` holds nine host services (`HostServices`, reserved names in host's `packs/registry.ts`): the SDK implements `logger` and `emitter` over the bound bus and `repository` from the bound engine, and the app implements six, `appData`, `traceStore`, `inference`, `secrets`, `filesystem` and `settings`: contract types in `@abuddy/sdk/services/<name>.ts`, implementation in `@abuddy/host/services/<name>.ts`, test doubles in `@abuddy/sdk/testing`'s in-memory runtime (`fakeInference`, `addTestSecret`). Host-only modules (`/app-state`, `/migrations`, `/packs/runtime`, `/bus`, `/secrets`) aren't reachable from the SDK.

- `@abuddy/ears` (`packages/abuddy-ears`, see its CLAUDE.md) — the EARS engine, published like the SDK and imported by no other `@abuddy` package: `untypedTx`, `defineEars`, `grantRole`, `repository`/`registerRepository`, the core `EARS` namespace (`Entity = { Relation }`), `BaseEntity`/`EntityShapes`/`ShapeOf`/`EntityNameArg`, etc. The engine is an instance: `createEarsEngine({ persistence?, isEntityType })` returns a new, empty engine that owns its stores, indexes and caches (no `@abuddy/ears` module keeps data at module scope, `tests/no-module-state.spec.ts`), with two faces: `query` (`qx`, `tx`, the finders, relation reads, graph walks, the repository registry) and `admin` (`clear`, `bulkLoadAttr`, direct attribute and relation writes, `edgeStore`, the relation index, the entity-type checker), which only its creator holds. The free functions (`untypedQx`, `untypedTx`, `repository`, the `defineEars` facades…) act on the engine installed with `installEngine(query)` and throw, naming the fix, when none is: `bindHost` installs the app's (`HostRuntime.ears`), `startTestRuntime` a test engine (`resetTestData` replaces it, keeping repositories), and tooling installs or passes its own (`exportFlowsToDSL(dir, { engine })`). A pack's repositories arrive in its registration (`PackRegistration.repositories`), and the host registry's `registerPack` registers them with the installed engine. It's a shared-instance package with the SDK: `SHARED_INSTANCE_PACKAGES` in `@abuddy/host/build/shared-deps` is the one list the bundler externals, the pack loader's bridge (generated `packs/runtime/sdk-modules.ts`, `npm run sdk-modules:update -w @abuddy/host`), the harness bridge and `bundle-package` derive from; `check:specifiers` rejects those consumers naming the packages themselves, and upward imports (`@abuddy/ears` imports no `@abuddy/*`, `@abuddy/sdk` only `@abuddy/ears`, `@abuddy/host` only those two and never the API).
- What the SDK adds to the engine: its `EARS` (the engine's types plus `SDK_ENTITIES`/`SDK_REL_KINDS`) and the SDK entity shapes, from `@abuddy/sdk/types` (and the root), and the SDK entities' repositories from `@abuddy/sdk/repositories` (`flowRepository`, `tnodeRepository`, `actionRepository`, `promptRepository`; default-setup's flows, actions and prompts repositories build their views over them). Packs get typed `qx`/`tx`/`find*`/`createEntityWithDefaults`/`updateEntity`/`getAttr` from `#generated/ears` (a literal entity name must be one the pack or its dependencies declare, its `EntityName`; a name typed `string` passes unchecked; ids from typed queries carry their entity type, a plain `EARS.EntityId` is accepted anywhere; `tx` checks declared fields' values when it knows the entity; the SDK owns Relation and the flow model (Flow, Node, TNode, Action, Prompt), defined in `abuddy-sdk/src/types/sdk-entities.ts`, and no pack declares them; the host declares `AppState` and `Settings`, which packs reach only through `services.settings`), `repository` (typed with the repositories declared in `abuddy.json` `features[].repositories`) from `#generated/repository`, and `broadcastToPlugin`/`sendToPlugin` (keyed by receiving plugin: its own feature's system's outgoing events, plus the inbox that plugin's `Contract` declares, which `abuddy.json` names at `features[].plugin.contract`) and `sendToSystem` (keyed by receiving system; a pack without systems sends to its dependencies') from `#generated/events`. A system's events come from the contract `abuddy.json` names at `features[].system.contract` — a declared type in a leaf module (`be/contract.ts`), read without resolving the machine — so how its entry is declared can't change them; the generated pack entry asserts that `defineSystem<Contract>()` names that same contract. `abuddy build` bundles a pack's facade types into `dist/types/pack-types.d.ts` (and its snapshot), so dependents' facades include them. `check:specifiers` rejects raw `broadcastToPlugin`/`sendToPlugin`/`sendToSystem` imports and `registerRepository` from `@abuddy/ears` in pack sources.
- `@abuddy/ears` also holds the persistence port (`PersistenceSink`, `Partition`/`PartitionPolicy`/`makePolicy`, `makeShardedPersistence`). `@abuddy/ears/lmdb` is the LMDB store: `openLmdbStore({ paths, policy })` returns the store (`sink`, `envs`, `hydrate`, `query`, `close`, `reopen`, `reset`); nothing opens on import. `lmdb` is an optional peer of `@abuddy/ears` that the app installs (`packages/api` keeps it as a dependency for the packaged app). Only `/lmdb` imports `lmdb`: the api's composition (`openAppStore()` in `runtime/index.ts`) opens the store with the app registry's `partitionPolicy` (and `engine: () => engine.admin`, which the store hydrates into and reads relation details from), creates the engine with `store.sink` as its persistence, and binds `createHostRuntime({ store, engine, packs, … })`; host code (`@abuddy/host/services`, `/backup`) takes the store, and the engine's `admin` face, as arguments; packs, pack tests and the pack bridges never load it (`APP_ONLY_EXPORTS`); `check:specifiers` (`findLmdbImports`) enforces it. No code reaches engine state except through an engine's `admin`, which the package's exports enforce: an admin write is a member of an engine's admin face and no entry exports one, so `import { edgeStore } from '@abuddy/ears'` doesn't compile.
- `@abuddy/sdk/events` — messaging: `sendToPlugin`, `sendToSystem` (a system by ref, or `{ role }`), `onConnected`, `onIncoming`, `defineEvents` and the event map types (`HostPluginEvents`, `HostSystemEvents`). Frontend-safe; shared with pack frontends as the `sdkEvents` global. It sends over the bound app's bus (`HostRuntime.transport`), or in the renderer over the frontend port's `client`. `broadcastToPlugin` (and `services.emitter.broadcastToPlugin`) goes through the bus actor, so it's dropped until a client connects, and reaches every window; the renderer's `sendToPlugin` goes straight to this window's actor.
- `@abuddy/sdk/logger` — `createLogger(source, { debug? })` (debug gated per source by `setDebugEnabled`), `reportError` (a system error, sent to the app as `SYSTEM_ERROR`, or with `step` a flow step's error recorded on its TNode) and `onLog`. SDK code over the bound bus: a logger emits redacted log events there (the api prints each once), and with no app bound (the CLI, tooling) writes to the console. Backend pack code doesn't call `console.*` — a pack rule (`@abuddy/cli`'s `build/pack-rules.ts`), so `abuddy validate` and `abuddy build` refuse it for any pack and `check:specifiers` for this repo's; a pack may allow it in `abuddy.checks.json`.
- `@abuddy/sdk/templates` — `executeTemplate`, `createTemplateResolver`. `@abuddy/sdk/env` — `resolveAppContext`, `getAppVersion`. `@abuddy/sdk/runtime` — the one port to the app: `HostRuntime` (`transport.rootEvents`, `ears`, `packs`, `appVersion`, `services`: `appData`, `traceStore`, `inference`, `secrets`, `filesystem`, `settings`, and the optional `redaction`, which tells log redaction which runs of characters are key values this process used — absent in a runtime with no secrets of its own), bound once per process with `bindHost` (the api binds `createHostRuntime(...)`, `startTestRuntime` an in-memory one), and the renderer's `bindFeHost({ application, secrets, client, packs })`; an unbound use throws naming them. The registered packs are an instance too: the program that assembles an app creates one (the api's composition root `createPackRegistry()`, the renderer `createFePackRegistry()`, the harness one per test file, the CLI one per build) and binds its read face (`PackRegistryView`, `FePackRegistryView`); the SDK's registries of what packs registered (designations, steps, artifacts, blocks, seed hooks, seeders, feature settings defaults, commands, pack services, and in the renderer tiptap plugins and DSL types) read the bound one, and no SDK or host module keeps them at module scope. Everything a pack contributes arrives in its `PackRegistration`/`PackFERegistration` (seeders and DSL types included); there's no registry for pack code to write to. Contexts without an app (SDK specs, a pack test filling a registry directly) use `testPacks` from `@abuddy/sdk/testing`. Also the `@internal` `_rootEvents` (the bound bus). `secretsClient` (`@abuddy/sdk/fe`) reads the frontend port's `secrets`; no general API client reaches the SDK.
- `@abuddy/sdk/fe` — pack-facing: `Plugin`, `PackFERegistration`, `safeEvents`, `usePlugin`/`PluginScope` (`fe/actor-system.ts`), `useUntypedPluginState`/`readUntypedPluginState` and `pluginIsRunning` (`fe/plugin-state.ts`: another plugin's state by ref, untyped — the escape hatch beside the typed readers `#generated/fe` generates from each plugin's contract, as `untypedQx` is beside `qx`. They hand back a value and never the actor, and `TSelected | undefined`, since a ref is a name and nothing about a name says the plugin is running; the reactive one follows the plugin arriving and reloading, not only changing), `useShell` (`fe/shell.ts`: the app shell's state and commands, typed by `HostShell`; no pack code holds the shell's actor), `untypedOpenPlugin` (`fe/navigation.ts`), `secretsClient`, the settings composables (`fe/settings.ts`: `useSettingsSection`, `useFeatureSettings`, `useSettingsSave` follow the settings until the calling scope is disposed, so they run in a component's setup and never inside a `computed`; `updateSettings` changes one from outside a scope, such as a machine's action). A change names a section by its own name or a feature by its ref, and the whole path is inside it, etc.
- `@abuddy/host/fe` — host-only: `createFePackRegistry()`, the renderer's registered pack frontends (`registerPackFE`, `getRegisteredPlugins`, app extensions); `createShellMachine`, the app shell over the I/O it's given (`ShellClient`, pack frontends, storage, notify, the event target), which the renderer composes with the window's and a test with fakes; and the `host/packs` feature's frontend (`fe/packs/`), beside the system that answers it — the Packs plugin's machine, pack-frontend loading over `PackFrontendIO` (the window's `import()` and stylesheets), the install a deep link asks for, and `runFrontendMigrations`, the window-storage counterpart of the app's migrations. It re-exports the `host/settings` feature's frontend too (`features/settings/fe/machine.ts`: `createSettingsMachine(io)`, over the restart and report the renderer gives it). `src/fe/index.ts` is where all three features' frontends are named — the package's export surface, which is why naming them there isn't the cross-feature import `check:specifiers` refuses; a port both the shell and the packs feature need (`ShellPackFrontends`) lives at the seam in `src/fe/` rather than in either.
- `@abuddy/host/settings` — the app's settings as a program composing the app needs them: `createSettingsStore({ defaults })` (the one row and its one writer, which checks each next document), `createSettingsService(store)` (what packs reach as `services.settings`), and `document.ts`'s pure operations. The host knows one section, `plugins`, keyed by feature ref; every other section is a pack's contribution (`PackRegistration.settingsSections`, `abuddy.json` `settingsSections`) and opaque to it. The system that answers the Settings view and the machine behind it live in `features/settings/{be,fe}`; the Vue is the renderer's (`packages/renderer/src/views/settings/`).
- `@abuddy/host/packs`, `/packs/runtime`, `/packs/dev-server`, `/backup`, `/build/discover`, `/build/shared-deps`, `/build/source-resolution` — pack registration (`createPackRegistry()`: the registered packs as an instance, with their partition policy and shutdown hooks), discovery, registry, installer, updater, pack layout and module bridge (the CLI imports this barrel, which never imports `/packs/runtime`); the pack runtime the app runs, on the registry it's given (loader, SDK bridge, lifecycle, reload, seeding, the host `packs` system); the `abuddy run` server marker the `pack://` handler proxies to; backups of the LMDB store; build-time pack discovery and host-shared dependency lists; the `@abuddy/source` condition helpers and the check that a process resolves workspace source, not `dist`.
- `@abuddy/host/process-liveness` — what a running process left on disk and whether it is still there: `lockIsHeld`, `recordIsStale`, and `readApiEndpoint` for the port file a running API publishes. The app's own plumbing, so packs never reach it.
- `@abuddy/host/bus` — `createBusMachine`, the backend bus (spawns registered systems, routes events, pack activate/teardown/reload), `createAppBus()`, the app's composition of it, and `receiveClientEvent()`, the check, log and send behind the API's `bus.send`. It never imports the pack loader; the pack test harness runs the same machine.
- `@abuddy/host/migrations` — the app's migrations runners (`runAppMigrations`, `runPackMigrations`; see Migrations below). Host-only, never bridged to packs.
- `@abuddy/host/services` — the host's implementations of the services packs reach through `services` (`app-data.ts`, `trace-store.ts`, `inference.ts`, `secrets.ts`, `filesystem.ts`, `settings.ts`, each named after its contract and delegate in `@abuddy/sdk/services`). `createHostRuntime({ store, engine, transport, appVersion, packs })` (`services/index.ts`) is the only place the app's `HostRuntime` is assembled, over the LMDB store (`appData` and `traceStore` use it); the API's composition binds it. `appData.reset()` resets the whole app: stores and keys, each pack's `onInit` and boot seed, then the host's `runAppMigrations(registry)`. `src/services` holds only those six services and the index (`tests/boundaries.spec.ts`). A service's implementation never lives in the API, which keeps only transport, process boot and composition (`packages/api/tests/source-layout.spec.ts` lists its files); the API's tRPC procedures delegate to host (`receiveClientEvent`, `secretsStore`/`secretsSnapshot`, `getLoadedPackEntries`).
- `@abuddy/host/app-state` — host-only: the app's own state, one `AppState` row (`hasOnboarded`, `version`, `packVersions`, `externalSeedHashes`, `externalSeedDeps`, `builtInSeedHashes`, `builtInSeedFingerprints`, `pluginVisibility`, `lastActivePlugin`) that only host code reads and writes (`appState`); the host registers the entity type next to the SDK's, with `Settings` (`HOST_ENTITY_TYPES`), and no pack may declare either. Packs learn whether the user onboarded through `services.appData.hasOnboarded()`/`completeOnboarding()`, the renderer through the application plugin's `CLIENT_CONNECTED`. Resetting settings doesn't touch it; `appData.reset()` empties it with the rest.
- `@abuddy/host/secrets` — host-only, never bridged to packs: the store of the user's API keys (metadata plain, values AES-256-GCM encrypted in `secrets.json`, the data key in a `KeyVault`: the OS credential store via `@napi-rs/keyring`, or a file in the test environment or after the user allows unprotected storage). Values reach it only through the API's `secrets.*` tRPC procedures, off the event bus (`forwardSecretsChanges()` tells every system that declares it takes `SECRETS_CHANGED` that keys changed, never their values); inference reads them with `secretsStore.keyFor(provider)`. The API logger and error reports redact key-shaped strings.
- `@abuddy/ui` (`packages/abuddy-ui`) — Vue components, editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`). Published as compiled JS (tsdown, with vue-tsc declarations). Packs use the host's copy at runtime: the renderer exposes every export on `window.__abuddy` and the pack FE bundler proxies `@abuddy/ui` imports, unless `abuddy.json` sets `fe.bundleUi`. Contracts and host-shared state (`useShell`, menu state, the tiptap plugin and DSL type lookups) stay in `@abuddy/sdk/fe`; `@abuddy/sdk` must not import `@abuddy/ui`.
- `@abuddy/sdk/utils` — **Node-only**: re-exports everything (pure + Node-dependent). Backend code imports from here.
- `@abuddy/sdk/utils/pure` — **environment-agnostic**: pure utilities only (`compareVersions`, `detectChanges`, `BinaryOperator`, `toMap`, `randomId`, etc.). Frontend/renderer code must import from this path (or a specific sub-path like `@abuddy/sdk/utils/compare-versions`), never from `@abuddy/sdk/utils`.

The freshness rule itself lives in `@abuddy/host/build/packages-built`, and everything that needs it imports it by that name: a relative import of a repo-root script would put the repo root into `@abuddy/testing`'s declaration emit and move every declaration its bundle publishes. `scripts/ensure-packages-built.ts` is only the command over it. The packages' build scripts live in the repo's `scripts/` for the same reason — `build-package.ts` (`@abuddy/ears` and `@abuddy/sdk`, which build alike) and `build-ui-package.ts` — so that no package's own `scripts/` imports a package above its layer, and the layer rule holds as written rather than through a re-export. `check:specifiers` (`findPackageScriptImports`) holds the other half: a package's own `scripts/` imports that package's `src/` and its declared dependencies and nothing else, because a module under the repo's `scripts/` belongs to no package — so `npm run spec` cannot route a change to it back to a spec that covers it, and a package reaching in there is a spec that will one day not run, reported green.

Relative imports in `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/host`, `@abuddy/ui` and `@abuddy/testing` name the `.ts` source (`./query.ts`); tsc (`rewriteRelativeImportExtensions`) and tsdown write `.js` into the output. `npm run check:specifiers` (part of `npm run typecheck`) rejects relative `.js` specifiers there. Workspace tsconfigs that compile this source need `allowImportingTsExtensions`. Generated pack code (`generate-entries`) keeps `.js`.

When adding new utils, put pure functions in the appropriate file under `utils/` and re-export from `pure.ts`. Node-dependent code stays in the existing Node modules and is re-exported only from `index.ts`.

`@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` each declare an exports map whose every entry resolves source under the `@abuddy/source` condition and `dist/` otherwise. **What they publish is that manifest derived, not that manifest**: `stagePublishTree` (`@abuddy/host/build/published-manifest`) writes `packages/<pkg>/publish/` at build time — the manifest without its source branches, without an entry a source branch was the whole of, and without `scripts`, beside a copy of what `files` names. A tarball ships no `src/`, and Node picks a matching condition and *then* requires the file, so a published source branch is a resolution failure for anyone who enables the condition rather than a fallback to `dist` — without the staging step the three maps name 99 files no tarball holds. `@app/publish-checks`' `published-manifest-paths` holds all five published trees to naming only files their tarball contains. **Two of the three maps are written, one is derived**, which is why only one has a staleness check: `@abuddy/ears` (3 entries) and `@abuddy/sdk` (31) list their exports by hand, so the map *is* the definition of public — a module nobody listed is private, and the first import of one fails at resolution with `ERR_PACKAGE_PATH_NOT_EXPORTED`, while `build-package`'s `assertExportTargetsBuilt` catches the other direction, an entry pointing at something that wasn't built. `@abuddy/ui` (69) computes its map from `src/` instead, since a component is public unless it is a spec or under `internal/`; that gives two things that can disagree, so `exports:check` compares them and `exports:update` rewrites the map. Adding a public module to `ui` means regenerating; adding one to `ears` or `sdk` means listing it. **A host config declares that condition outright; a pack's config declares none.** The host configs name it — tsconfig `customConditions`, Vite/Vitest `resolve.conditions`, esbuild/tsup `conditions`, `node --conditions` (the CLI bin's resolve hooks in source mode, the API process the app spawns from source) — and nothing infers it from an install. `npm run check:specifiers` fails a host config that omits it and a pack config that declares it. Two tables in `scripts/lib/import-source-conditions.ts` record the configs that do the opposite on purpose, each with its reason, and report an entry that has stopped applying: `RESOLVES_DIST_BY_DESIGN` (host configs resolving `dist`, such as the API Extractor tsconfigs) and `DECLARES_SOURCE_BY_DESIGN` (pack configs declaring the condition). The second is empty and meant to stay much the smaller of the two: it is for a host-side config that physically sits in a pack's tree, which is usually better moved out, and never for making a pack's own build work — that pack would then build unlike every pack author's, which is the failure the rule exists to prevent. Its doc comment has the full rule.

A pack — built-in (`packages/default-setup`), fixture (`tests/packs/*`) or external — is built and tested by `abuddy build` and `abuddy test`, which resolve the `@abuddy` packages' published `dist`: the one layout a pack author ever has. The app's own builds are host builds and compile that same pack's sources with the condition (`renderer/vite.config.ts`, `api/tsup.config.ts`), so in a checkout that `dist` has to exist and match the source beside it: `npm run packages:ensure` (`scripts/ensure-packages-built.ts` over `@abuddy/host/build/packages-built`) rebuilds it when `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/ui`, `@abuddy/testing` or `@abuddy/cli` is stale, and `npm run typecheck`, `npm test`, `npm run build`, `npm run compile`, `npm run typecheck:pack` and `npm run test:external-pack` all run it first, as `abuddy test` and `abuddy run` do for a pack linked to a checkout. `@abuddy/testing` resolves its built bundle whoever loads it, the repo's own E2E included, so the fixture a pack runs is the one this repo runs. While `npm start` is running, the renderer and the API follow your `@abuddy` source edits live (both declare the condition), but everything `abuddy build` produced for the built-in pack — its compiled seeds, facade types, step build and seed runtime — was made against `dist` as it stood when the command ran, and default-setup's own tsconfig declares no condition, so your editor type-checks it against that `dist` until something rebuilds it. `packages/abuddy-testing/CLAUDE.md` lists every entry point that does. Node commands that load workspace source run through `node scripts/with-source.mjs <command>`, which appends the condition to `NODE_OPTIONS` (`npm test`, the api's `db:*` scripts); run Playwright through `npm test -- <args>`, which carries the condition. The CLI and the API's dev boot fail when they would resolve a checkout's `dist` instead of its source. `npm run packages:build` writes `dist/`; `npm run exports:update -w @abuddy/ui` regenerates the UI exports map after adding or removing a module. To publish a `@abuddy/ui` component, add a `.ts` entry module next to it (`design/button.ts`: `export { default } from './button.vue'; export * from './button.vue';`) and run `exports:update`. TypeScript can't resolve an exports target that is a `.vue` file, so the entry is what consumers import. SFCs without an entry are internal: other `@abuddy/ui` files import them by relative path, and `exports:update` fails if code outside `@abuddy/ui` imports one.

When adding new EARS or FE exports, put them in the correct barrel. Tag exports only the host uses `@internal` and name them `_x`: the underscore is what makes the boundary checkable, so pack code importing one fails `check:specifiers` (and `abuddy build`, for an external pack). A pack that needs one needs it promoted to public API instead. After changing public exports, run `npm run api:update` in `packages/abuddy-sdk` (or `packages/abuddy-ears`, `packages/abuddy-ui`) and commit the updated `etc/*.api.md` reports. A UI component's props, emits, slots and exposed members are reported in `etc/<entry>.component.md`, so changing them needs `api:update` too. The pack-facing SDK exposes no `any` (`published-sdk-any.integration.spec.ts` fails when an export does; use `unknown` or a generic); `@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` support TypeScript 5.7 and later (`packages/typescript-floor`; `ai` 7's declarations need it).

**Typed EARS types are change-controlled.** `abuddy-ears/src/{entities,runtime,typed}.ts`, `abuddy-sdk/src/types/{entities,sdk-entities}.ts` and the generated `PackShapes`/`EntityName` are a specified contract that editor completions depend on. Don't widen or rewrap them to make a call site compile; fix the call site (explicit shape, `EntityName` constraint, `untypedQx` from `@abuddy/ears`). Read `packages/abuddy-sdk/TYPED-EARS.md` and follow its checklist, including checking completions, before any change.

### Data layer (EARS)

Custom entity-attribute-relation graph database (`@abuddy/ears`) backed by LMDB (`@abuddy/ears/lmdb`). All data lives in memory; the store persists writes and hydrates them at boot.

- `createEarsEngine()` — an engine instance (the app creates one at boot; tests and tooling create their own)
- `qx()` — query execution (synchronous, do NOT await)
- `tx()` — transaction execution (synchronous, do NOT await)
- Repository pattern: a feature's `be/repository/index.ts` exports `<name>Queries`/`<name>Commands` objects (usually from `queries.ts`/`commands.ts`), declared in `abuddy.json` `features[].repositories` as `"path#export"`; code reaches them through `repository` from `#generated/repository`
- A pack's repository can expose another package's repository methods (default-setup's `actionQueries.byId` is the SDK's `actionRepository.byId`), so its code reaches its data through `repository` alone. It takes them by reference (`byId: actionRepository.byId`), never wrapped in a function that re-declares the signature, and adds its own views beside them
- Each entity's repository lives with the package that declares it: the SDK's entities' in `@abuddy/sdk/repositories`, a pack's in its features, the host's `AppState` in `@abuddy/host/app-state`. No package reads another's repositories through a cast of the registry, and nor does a pack: `repository as unknown as` is the `repository-casts` pack rule, so `abuddy validate`, `build` and `test` refuse it for any pack and `check:specifiers` (`findRepositoryCasts`) for this repo's packages. The generated facade is exempt, being this cast by design

### Frontend plugin system

Each plugin registers: `id`, `label`, `icon`, `state` (XState machine), `canvas` (required), `panel` (optional). Plugins are spawned on demand by the application actor. State selectors use `useSelector` from `@xstate/vue`. Plugin code lives in `packages/default-setup/src/features/<name>/fe/`. Plugins come from `abuddy.json` `features[].plugin`: `generate-entries` writes them into `src/__generated__/pack-entry-fe.ts`, which the renderer imports through `virtual:built-in-packs` (external packs' load at runtime from `pack://<id>/runtime/fe.js`).

### Key patterns

- **An event either carries data or asks for it, and exactly one asks.** A system handles `SEND_STATE` by broadcasting what its plugin starts from. The bus sends it after every fact that could have changed what a system holds — a client connected, a pack changed, the data was replaced, systems were spawned — so a system wires publishing once instead of once per cause, and a new cause costs it nothing. It is sent after the fact, so a system drops work held over rows that are gone before it describes itself, and only once a client has connected, since entering `clientSeen` asks everyone anyway. Early systems bypass the bus machine and are sent the same pair by `startEarlySystems`
- **A fact is for what publishing cannot fix, so handling one means a system does something special.** `CLIENT_CONNECTED` (the brain tracks whether a client is attached; threads starts onboarding), `PACK_CHANGED { packId }` (settings sends the help a pack brought, and tells each feature whose defaults moved), `DATA_REPLACED` (the brain kills a flow running over rows that are gone). Every other system handles none of them. A client connection reaches systems of external packs with frontend code once the renderer has loaded that frontend (`bus.packClientReady`), and again when its subscription reconnects
- When a feature's settings change (any way: a setting, the settings replaced or reset, a pack's defaults), the app's settings system (`host/settings`) sends its system `FEATURE_SETTINGS_UPDATED { settings, changes }` and its plugin `FEATURE_SETTINGS_UPDATED { settings }`. The SDK declares it for every system (`SystemEvents`) and plugin (`PLUGIN_EVENT_TYPES`), so no pack does, and the bus drops one to a feature running no such actor without a warning
- Use `safeEvents<ReceivableEvents>()` for typed event handling
- Use `breadcrumb()` / `breadcrumbWithParams()` for plugin navigation
- Frontend components should be "dumb" — emit events up to root components which forward to the plugin state machine

### App environment

Environment identity and data paths come from one resolver, `@abuddy/sdk/env` (`resolveAppContext()`). Don't read `NODE_ENV`, `PLAYWRIGHT_TEST` or platform paths to decide which data dir to use.

- The log directory is the one app path the resolver doesn't give you: only the Electron process can ask the platform for it. `packages/main/src/app-context.ts` resolves it once — `app.getPath('logs')`, or `<userDataDir>/logs` when the run was given its own data dir — and hands it to electron-log, to the API (`AGENTBUDDY_LOG_DIR`) and to the IPC that opens the log file, so none of them decides it for itself.
- The Electron main process infers the environment once at startup (`packages/main/src/app-context.ts`): Playwright → `test`; packaged builds → the channel stamped by `build/build.sh` (`production` | `beta`; an unstamped packaged build refuses to start); source runs → `ABUDDY_ENV` if set, else `development`. It passes `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` to the API process.
- Anything started without them throws instead of falling back to production. Manual API boots must pass both, pointing at a copy of user data: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js`. Such an API makes up its own token and writes it to `<copy>/api-token`; send that to call it.
- The API takes calls only with a token. Electron main creates one per app run and passes it to the API (`ABUDDY_API_TOKEN`); an API started without one makes up its own; the app's windows read it through the preload (`api:token`) and send it when connecting, and in development (or when it made up its own) the API writes it to `apiTokenFile` for local tools (`abuddy run`, default-setup's watcher), which send it in `API_TOKEN_HEADER`. That header and the address the API listens on (`API_HOST`, `127.0.0.1` only) are defined once, in `@abuddy/sdk/utils/pure`, so the renderer's client uses the same ones.
- CLI commands pass `{ env }` explicitly (`install`/`uninstall`/`list`/`open` default to production; `-d`/`-b` select dev/beta).

### Migrations

Migrations live with their pack; the host's own (the app's state) live in `packages/abuddy-host/src/migrations/app/`. default-setup's are in `packages/default-setup/src/migrations/`: each file exports a `PackMigration` (`@abuddy/sdk/framework`) with `target`, `description` and `up()`, listed in that folder's `index.ts` and registered with the pack. `@abuddy/host/migrations` (`packages/abuddy-host/src/migrations/index.ts`) holds only the runners, which the API's boot and host's `services.appData.reset()` call through `startPacks()` (after the packs' `onInit`, before the seeds), and a backup import after reloading the data:

- `runAppMigrations(registry)` — the host's own app migrations (moving the app's state, and every pack's stored plugin settings onto their plugins' refs), then the built-in packs' in the app's registry, run when `stored app version < target <= app version` (`getAppVersion()`, the bound runtime's); records `AppState.version`. A prerelease counts as its release (`0.3.15-beta.2` runs the `0.3.15` migrations, again on each new beta), and a development build (`ABUDDY_ENV=development`) runs every pending migration on every boot. A failed migration stops the rest and records nothing, and `startPacks()` then runs no pack migration or seed; the next boot retries. Data with no recorded version is new and at the app version (after the host's migrations moved any older one).
- `runPackMigrations(externalPacks)` — each external pack's migrations, against that pack's own version (`stored < target <= manifest version`); records `AppState.packVersions[packId]`. External migrations never run in `runAppMigrations()`.

Rules for default-setup migrations (details in `packages/abuddy-host/src/migrations/CLAUDE.md`):

- **Target the next release version** — name the file after the version it targets (e.g. `0.2.4.ts` runs when the app is released as 0.2.4+). Several changes for one release go in the same file.
- **Never bump `package.json` version manually** — the release process handles version bumps. Migrations are written ahead of time to target the upcoming release.
- **List it in `packages/default-setup/src/migrations/index.ts`** — import and append to the `migrations` array in version order.
- **Idempotent guards** — always check if the change is needed before applying (e.g. `if (!value) set(value)`), since migrations run again on every development boot, on each beta of their release, and after a reset.

### Path aliases

- Backend: `@/*` → `packages/api/src/*`

## Tech stack

XState v5 (state machines everywhere), tRPC v11 (typed RPC), Vercel AI SDK 7 (model calls through `services.inference`: Anthropic, OpenAI, Google, Groq, Mistral, Cohere), Zod (validation), Vue Flow (node-based editor), Monaco Editor, Tiptap (rich text), xterm.js + node-pty (terminal), LMDB (persistence), Vite (bundler), Oxlint + ESLint (linting).
