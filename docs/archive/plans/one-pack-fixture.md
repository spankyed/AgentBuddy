> **Done** (branch `AS/one-pack-fixture`), in the four phases below:
> `b6e551b5b` the package, `f890484a4` the options, `e48f613b2`/`83f6d498a` the adoption, `fcfbfa835` the
> guardrail. The text after this block is the plan as written, which means its headline number is wrong; the
> corrected one is the first thing this records.
>
> **98 sites write a pack manifest, not 101, across 55 files — and the count was never the work.** Of the 98,
> **54** are in the two packages that may import an `@app/*` package, and of those only **28** are a manifest
> written inline for a tree of their own. **11 of them, in 8 files, became `packFixture`;** the rest are four
> shapes left alone with a reason each, listed in `packages/pack-fixtures/CLAUDE.md`: a `'{}'` discovery
> marker, a patch of a pack something else scaffolded, a manifest that *is* the subject with no tree around
> it, and the installed shape, which is `@abuddy/host`'s artifact. The plan's **Unverified** item — *"that
> every one of the sites wants the builder"* — resolves to no, and the four shapes are the answer.
>
> **The finding worth keeping is that eligibility is a layer question.** The other 44 sites are in
> `@abuddy/host`, `@abuddy/sdk`, `packages/api` and `@app/default-setup`, which may not import an `@app/*`
> package at all, so a hand-written manifest there is the only option available. The guardrail therefore
> derives its scope from which packages *declare* `@app/pack-fixtures` rather than claiming the repo — which
> is also why it needs no exemption list, and has none.
>
> **Three of the four Decisions landed; two options were not built, and the reason is composition.** Decision
> 3's `built`/`modules` and Decision 4's `beforeBuild` are absent: `buildPack(dir)` already takes a directory,
> so a caller that must mutate a scaffolded tree between writing and building does it between two calls, and a
> hook to express that would only be the sequence spelled a second way. What shipped instead is what the
> literals asked for — `manifest` merging over the default, `rawManifest` verbatim (both at once throws, since
> a merge cannot express an absent key), `at`, `files` and `nodeModules`.
>
> **Phase 4 took the lesson it was written to take.** The predicate reads the syntax tree: fs bindings come
> from each file's own `node:fs` import however it is spelled, and a finding requires
> `JSON.stringify(<object literal with an id>)` reaching a write. Measured on the tree it shipped against:
> 108 files examined, 0 findings, and four mutations watched — reintroducing one hand-written manifest fires
> by file and line, dropping the object-literal requirement fails three cases *including two allowed shapes*,
> hard-coding the fs names fails the never-imported-fs control, and emptying the population fails naming
> itself rather than passing over nothing.

# One way to write a pack fixture

> **Retargeted 2026-10-02 (branch `AS/one-action-cache`), from "a fidelity ladder".** It was compiled
> 2026-09-29 on the premise that integration specs are *over-provisioned* — that naming four fidelity rungs
> would let specs drop to a cheaper one and attack the suite's cost. Its own **Unverified** section called that
> a hypothesis and said what to do if it failed: *"If every spec is already at the right rung, record that and
> stop."* The survey was taken, and it failed.
>
> **What survives is the other half of the same Problem statement, and it is 7.7× what was recorded.** Six
> places were said to write a pack manifest as a string literal; there are **46 files and 101 sites**. So this
> is a duplication plan now, with `packFixture` as the primitive and a checkable end state, and it says up
> front that it will make the suite neither faster nor slower.
>
> The retired reasoning is in **Closed** rather than deleted, because it was right to ask.

## Problem

**46 files write a pack manifest as a string literal, across 101 sites** — in `@abuddy/cli`'s suite,
`@abuddy/host`'s and `@abuddy/sdk`'s. Nothing holds one of them to the manifest schema, so a renamed key is 101
edits that no typecheck finds, and a new pack rule cannot be exercised from a fixture every spec shares.

Beside that, the primitive that would fix it is in the wrong package. `packFixture`
(`packages/abuddy-sdk/src/testing/pack-fixture.ts`, 62 lines, 23 call sites) sits in **`@abuddy/sdk`'s reviewed
published surface** — `etc/testing.api.md:140`, governed by `api:check` and `api:stamp`, shipped in the
tarball — for something no pack author has a use for: it materialises a pack directory to test *pack tooling*.
Its own comment names the condition for moving: *"the first one that does is the signal to move this and
`population` to an `@app/*` package, rather than to write a second fixture."* Two packages consume it now
(`@app/repo-checks`, `@abuddy/cli`), so the condition is met twice over.

## What the survey found, and what it could not settle

**The cost the rungs were for is not available.** 26 integration specs, 276.7s of recorded file time, the
heaviest six being 154.3s of it. Read, rather than timed: those specs' fixtures are distinct **per case**,
because the fixture *is* the input under test.

- `fe-bundler-host-registry` has one shared `beforeAll` — the published install, already hoisted — then seven
  cases and an `it.each`, each building a different pack shape to assert a different bundler behaviour.
- `scaffold` has 14 cases and 14 fixture calls. Its names say which need a build (*"adds a feature, builds,
  typechecks and packs a verified archive"*) and which do not (*"rejects a feature id that is not an
  identifier"*) — and the ones that do not already run in **1-6ms**.

So the specs already sit at the rung they need, and "dropping to a cheaper rung" has almost nothing to drop.

**One number is left unsettled, and is not quoted anywhere here.** Splitting hook time from case time through
vitest's JSON reporter did not reconcile — the same five `dependency-graph` cases read 3.06s in a six-file run
and 10.37s alone — so the earlier *"`facade-typing` is 77% `beforeAll`"* is neither confirmed nor refuted. The
finding above does not rest on it: at any hook share, that `beforeAll` builds four packs across two module
variants, and a rung renames those builds rather than removing them, which is what Decision 5 predicted of a
cache ("expect few hits").

## Decisions

1. **A new private `@app/pack-fixtures` workspace**, and `packFixture` moves there. Re-checked 2026-10-02 and
   every premise holds.

   **Not `@abuddy/testing`**: its three exports still point at `./dist/package/dist/*.js` with **no source
   branch** — deliberately, so a pack's run sees what a pack author sees — so every fixture edit would need
   `packages:build` first, and a fixture library with that loop gets worked around within a month.

   **Not `@app/publish-checks`**, though it is cheaper (`@abuddy/cli` already depends on it): its subject is
   what we publish, and the published rung packs `publishedTreeDirs()` from *this* checkout
   (`installPublishedPackages`, still there). A general fixture home there makes it two packages in one, which
   is what `@app/repo-checks` was extracted from `@abuddy/cli` to undo. `@app/repo-checks` is out for the
   mirror reason, and because `@abuddy/cli` would then depend on a checks package.

2. **`population` stays in `@abuddy/sdk/testing`.** `@app/default-setup`'s tests use it (verified: one file)
   and a pack may not import an `@app/*` package. Only `packFixture` moves.

3. **Fidelity is a parameter, not a ladder.** `built` and `modules: 'workspace' | 'published'` are what
   `facade-typing`'s `buildPacks(published)` already toggles by hand, so they belong on the builder as options.
   What is *not* built: four named rungs as a vocabulary, a rung declared at every call site, and the claim
   that declaring one attacks the suite's cost.

   **The in-memory harness is not a rung or an option.** `setupPackTests` takes a *registration object* and
   runs a pack's code; this materialises a *directory*. Different axes, and conflating them is the actual
   mistake. One cross-reference from each side.

4. **A `beforeBuild` hook, because the archetype needs one.** `facade-typing` runs `abuddy add step` and
   rewrites the scaffolded types between writing files and building. A `materialise({ files })` that cannot
   express that cannot replace the call site it exists for.

## Plan

### Phase 1 — the package, and `packFixture` moved

- New `@app/pack-fixtures`: `package.json` (private, `exports: { ".": "./src/index.ts" }`, mirroring
  `@app/publish-checks`), `tsconfig.json`, `vitest.config.ts`, `CLAUDE.md`, and an entry in
  `scripts/lib/unit-suites.ts`. `workspace()` picks up its chain inputs.
- Move `packFixture` and its spec, repoint the 23 call sites, delete the source export, run `npm run api:update`
  (`etc/testing.api.md` loses a line and `typecheck` fails until it does), and rewrite the comment that
  anticipated this move to record that it happened and why `population` did not.

**Done when:** `npm run spec -- packages/pack-fixtures/…` routes and runs; `import-specifiers.integration` and
`pack-rules` pass; `spec-placement`, `repo-check-boundary` and `chain-inputs` are green with no exception added
for the new package; its spec-cost row is recorded through `spec-cost:update`; `packFixture` appears in no
`etc/*.api.md`.

### Phase 2 — grow the builder to what the literals actually write

Read the 101 sites before adding an option. They are the specification: a manifest literal that `packFixture`
cannot express is either a missing option or a spec testing something that is not a pack.

- Add options for what recurs, and nothing for what does not. `built` and `modules` from Decision 3 land here,
  as does `beforeBuild`.
- **Reuse, do not reimplement**: `preparePack`, `buildPack`, `callCli` and `installPublishedPackages` already
  do the work; this should mostly move code.

**Done when:** every one of the 101 sites is expressible, demonstrated by converting the five most different —
`facade-typing` (two packs, a dependency edge, both module variants, a mutation between scaffold and build) is
the archetype, and if the builder cannot express that file it is the wrong shape and this is where that shows.

### Phase 3 — adopt it, file by file

46 files, each conversion independently revertible and independently reviewable. No atomic switch.

**Behaviour before anything else.** Every converted spec must pass *and fail* for the reasons it did before:
break what it asserts and watch the converted version fail. Porting a fixture is exactly where a spec quietly
stops asserting — replacing a spawned `tsc` with an in-process one hit this once already.

**Done when:** `pack-builds.ts` keeps only what is not fixture materialisation (`callCli`, `typecheckPack`,
`run`), and no spec writes `abuddy.json` by hand.

### Phase 4 — the guardrail, which is what makes this a floor

A `@app/repo-checks` spec: **no test outside `@app/pack-fixtures` materialises a pack by hand.**

**Derive the predicate, not just the population — this is the part that matters.** The spawn gate written
alongside this plan had a derived population, a non-empty expected list, a mutation case and a negative
control, and was still blind to nine of the twelve files it was about (`0a070a7b3`): it restated *what to
look for* as a hand-written list of spawner names and a regex over argument text. Every one of those four
techniques validates the mechanism; none asks whether the predicate is right. So read what the syntax says —
`scripts/lib/process-spawns.ts` is the worked example, binding names from each file's own import — and where
an oracle is cheap, check against it once rather than trusting the static answer.

**Then the empty-result problem, which is real but smaller.** A check whose success *is* `[]` cannot tell
"nothing offends" from "the detector broke", and here the emptiness is permanent by design: a successful
migration leaves no exceptions to compare against. So build in the ability to fail:

- **Assert the population is non-empty** — report how many files were examined and fail by name at zero.
- **A positive control**: feed the detector a synthetic hand-rolled fixture and assert it is flagged.
- **A negative control**: feed it a spec using the builder and assert it is not, so the rule cannot pass by
  flagging everything.

**Done when:** the rule fires on the synthetic offender and stays silent on the synthetic compliant file, on
every run; the population guard fails against an empty directory; and any surviving exception names a path
that still exists.

## Verification

- Per phase: `npm run typecheck`, `npm test -w @app/repo-checks`, `npm run spec-cost:check`, and
  `npm run chain` once at the end.
- **No timing claim is part of any done-when.** This plan buys schema conformance and one edit instead of 101;
  it is expected to leave the suite's cost where it is. A regression needs a reason; an improvement is a
  surprise worth recording, measured with `npm run measure` rather than by hand — five numbers in
  `goal-integration-pool` were wrong for exactly that reason and three reached commit messages.

## Unverified — reasoned, not tested

- **That every one of the 101 sites wants the builder.** Some may be testing manifest *parsing*, where a
  literal is the subject. Phase 2 reads them; the ones that stay are an exemption list with a reason each.
- **That `installed` (a pack placed in a data dir) is wanted.** Build it when a caller asks; the installer
  specs may be better left alone.

## Closed, recorded so they are not re-raised

- **Rungs as a cost mechanism, and "the rung is declared at every call site".** Surveyed 2026-10-02: the heavy
  specs' fixtures are per-case and distinct because the fixture is the input under test, and the cases that
  need no build already pay nothing. There is no cheaper rung to drop to. `goal-integration-pool` produced
  four "measured, declined" outcomes and they were the cheapest results in it; this is a fifth.
- **A content-keyed build memo.** Measured: a fixture build is 1.4s warm and the fixtures are mostly unique.
  Caching was a side effect, not a reason, and the plan that proposed it predicted few hits.
- **A content-keyed build cache as the justification.** Same measurement, stated before any of this was built.
- **`@abuddy/testing` as the home.** Its exports resolve `dist` with no source branch, so every fixture edit
  would need a rebuild; and the published rung needs a checkout, which an external consumer lacks.
- **`@app/publish-checks` and `@app/repo-checks` as the home.** Cheaper by one edge each, rejected on cohesion.
- **Folding `setupPackTests` in as a rung.** It takes a registration, not a directory. Different axis.

## Risks

- **A new workspace has six registration points** — `unit-suites`, vitest config, spec-cost record,
  CLAUDE.md, its own suite (`spec-placement` requires one), chain inputs. `packages/repo-checks/CLAUDE.md`
  records what the last extraction cost and why it was still right; read it first.
- **Phase 3 is 46 files of mechanical change with no speed payoff**, which is the kind of work that gets
  abandoned half-done and leaves two ways to write a fixture instead of one. Phase 4 is what stops that being
  the resting state, so it is not optional and not last-if-there-is-time.
- **Shared checkout.** Another agent commits in this tree. Read a file before a whole-file write and use
  `git commit -- <paths>`; a full-file `Write` over a doc another session was editing went unnoticed for
  several commits during `goal-integration-pool`.
