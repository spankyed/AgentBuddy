# Pack fixtures: a fidelity ladder

## Problem

There are **five ways to stand up a pack for a test** and **six places that write a pack manifest as a
string literal**:

| mechanism | what it makes |
|---|---|
| `@abuddy/testing`'s `setupPackTests` | a pack's code running in memory, from a registration object |
| `abuddy-cli/tests/_support/pack-builds.ts` | files + `node_modules` symlink + `abuddy build`, in a temp dir |
| `tests/fixtures/*` | checked-in pack directories for `test:external-pack` |
| `publish-checks`' `installPublishedPackages` | the packed tarballs installed as a consumer sees them |
| `abuddy test` | a pack's own suite, in its own repo |

The cost is not duplication for its own sake. It is that **no spec can express the cheapest fidelity that
would answer its question**, so each reaches for whatever the neighbouring file did. `facade-typing` is
77% `beforeAll`; the integration suite is ~228s of worker time across 23 files.

`packFixture` (`packages/abuddy-sdk/src/testing/pack-fixture.ts`) is already the nucleus, carrying the right
doctrine — *"a fixture too thin for a rule to fire is a case that passes because it could not fail"* — and a
stated growth condition: *"the first one that does is the signal to move this and `population` to an `@app/*`
package, rather than to write a second fixture."* Its only consumer is `@app/repo-checks`, so that condition
is met.

**This is a consolidation change, not a performance one.** Measured 2026-09-29: a fixture `abuddy build` is
**1.4s warm**, and the fixtures are mostly unique — `facade-typing` alone builds four packs across two module
variants with a mutation between scaffold and build. A content-keyed build cache would rarely hit. Any
speedup comes from specs *dropping to a cheaper rung*, and how many are over-provisioned is unmeasured.

## Current state

The rungs already exist, unnamed and spread across three packages:

- **files on disk** — `packFixture` (`@abuddy/sdk/testing`), complete by default: both subpath maps, a
  manifest declaring a feature's two halves, and the files those paths name.
- **+ `node_modules`** — `preparePack` (`pack-builds.ts`): write the tree, symlink a modules dir.
- **+ built** — `buildPack` → `callCli(dir, 'build')`. `callCli` runs the CLI **in-process** (chdir,
  captured console, `process.exit` swapped for a throw), so this is not a subprocess.
- **+ published modules** — `installPublishedPackages` (`@app/publish-checks`): `npm pack` of
  `publishedTreeDirs()` — ears, sdk, ui — into a temp `node_modules`, 1.1s. Repo-local: it needs a checkout.

`facade-typing`'s `buildPacks(published: boolean)` is the archetype that uses four of these at once.

## Decisions

1. **A new private `@app/pack-fixtures` workspace**, and `packFixture` moves there.

   **Not `@abuddy/testing`**, for two mechanical reasons that outrank its better name: its exports point at
   `./dist/package/dist/*.js` with **no source branch** — deliberately, so a pack's run sees what a pack
   author sees — so every fixture edit would need `packages:build` first, and a fixture library with that
   loop gets worked around within a month. And the published rung packs `publishedTreeDirs()` from *this
   checkout*, which an external consumer does not have, so the top rung could not travel.

   **Not `@app/publish-checks`**, though it is cheaper (source exports, private, already owns the published
   rung, `@abuddy/cli` already depends on it): its subject is what we publish, and a general fixture ladder
   makes it two packages in one — which is what `@app/repo-checks` was extracted from `@abuddy/cli` to undo.

2. **`population` stays in `@abuddy/sdk/testing`.** `@app/default-setup`'s tests use it and a pack may not
   import an `@app/*` package. Only `packFixture` moves.

3. **Four rungs on one axis, with an orthogonal modules choice.**

   | rung | what exists | replaces |
   |---|---|---|
   | `source` | files on disk, no `node_modules` | `packFixture` |
   | `linked` | + `node_modules` symlink | `preparePack` |
   | `built` | + `abuddy build` output | `buildPack` |
   | `installed` | + placed in a data dir | the installer specs |

   `modules: 'workspace' | 'published'` is orthogonal — exactly what `buildPacks(published)` toggles by hand.

   **The in-memory harness is not a rung.** `setupPackTests` takes a *registration object* and runs a pack's
   code; this materialises a *directory*. Different axes, and conflating them is the actual mistake. One
   cross-reference from each side.

4. **A `beforeBuild` hook, because the archetype needs one.** `facade-typing` runs `abuddy add step` and
   rewrites the scaffolded types between writing files and building. A `materialise({ files })` that cannot
   express that cannot replace the call site it exists for.

5. **Memoise the build, keyed on the materialised tree — not on the inputs.** Hash the directory *after*
   files, dependencies and `beforeBuild` have been applied, and cache the build against that hash plus the
   CLI bundle's and published trees' fingerprints. This captures a hook's effect without hashing a function,
   and caches the expensive half while paying the cheap half. Expect few hits.

6. **The rung is declared at every call site, and that is the point.** It makes over-provisioning visible in
   review, and it is the only mechanism here that attacks the 228s.

## Plan

### Phase 1 — the package, and `packFixture` moved

- New `@app/pack-fixtures`: `package.json` (private, `exports: { ".": "./src/index.ts" }`, mirroring
  `@app/publish-checks`), `tsconfig.json`, `vitest.config.ts`, `CLAUDE.md`, and an entry in
  `scripts/lib/unit-suites.ts`. `workspace()` picks up its chain inputs.
- Move `packFixture`, migrate its one consumer
  (`repo-checks/tests/import-specifiers.integration.spec.ts`), delete the source export, and rewrite the
  comment that anticipated this move to record that it happened and why `population` did not.

**Done when:** `npm run spec -- packages/pack-fixtures/…` routes and runs; `import-specifiers.integration`
passes; `spec-placement`, `repo-check-boundary` and `chain-inputs` are green with no exception added for the
new package; its spec-cost row is recorded through `spec-cost:update`.

### Phase 2 — the ladder, with `facade-typing` as its first caller

- Implement the rungs over the existing primitives. **Reuse, do not reimplement** — this should mostly move
  code.
- Port `facade-typing.integration.spec.ts`, because it is the archetype: two packs, a dependency edge, both
  module variants, a `beforeBuild` mutation. If the ladder cannot express that file, it is the wrong shape
  and this is where that shows.

**Done when:** `facade-typing` uses the ladder, the same eleven cases pass, and a deliberately broken
completion still fails. Wall time recorded before and after; no faster is acceptable, a regression needs a
reason.

### Phase 3 — migrate the remaining callers, one rung at a time

`dependency-graph`, `types-bundler-determinism`, `fe-bundler-host-registry`, `add-feature-validate`,
`add-extensions`, and `repo-checks`' `import-specifiers.integration`.

**Record the rung each actually needs**, and where that is lower than today's, say so in the commit. This is
the phase that produces the number Phase 2 cannot: how much of the suite was over-provisioned.

**Done when:** no integration spec calls `preparePack`/`buildPack` directly; `pack-builds.ts` keeps only what
is not fixture materialisation (`callCli`, `typecheckPack`, `run`); the six manifest literals become one
default plus per-case overrides.

### Phase 4 — the guardrail

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
- **A negative control**: feed it a spec using the ladder and assert it is not, so the rule cannot pass by
  flagging everything.

**Done when:** the rule fires on the synthetic offender and stays silent on the synthetic compliant file, on
every run; the population guard fails against an empty directory; and any surviving exception names a path
that still exists.

## Verification

- Per phase: `npm run typecheck`, `npm test -w @app/repo-checks`, `npm run spec-cost:check`, and
  `npm run chain` once at the end.
- **Behaviour before cost.** Every migrated spec must pass *and fail* for the reasons it did before: break
  what it asserts and watch the ported version fail. Porting a fixture is exactly where a spec quietly stops
  asserting — replacing a spawned `tsc` with an in-process one hit this once already.
- **Timing, if quoted at all**, comes from the measurement harness (its own item: refuses to run above an
  idle threshold, repeats N times, reports median and spread). Not hand-rolled `date +%s` loops — five
  numbers in `goal-integration-pool` were wrong for exactly that reason and three reached commit messages.

## Unverified — reasoned, not tested

- **That any spec is over-provisioned.** The 228s is real; that a cheaper rung would answer the same question
  is a hypothesis. Phase 3 measures it. If every spec is already at the right rung, record that and stop —
  `goal-integration-pool` produced four "measured, declined" outcomes and they were the cheapest results in it.
- **That the memoisation ever hits.** Decision 5 builds it because it is a few lines once the hash exists,
  not because there is evidence for it.
- **That `installed` is wanted.** Build it when a caller asks; the installer specs may be better left alone.

## Closed, recorded so they are not re-raised

- **A content-keyed build cache as the justification.** Measured: a fixture build is 1.4s warm and the
  fixtures are mostly unique. Caching is a side effect here, not a reason.
- **`@abuddy/testing` as the home.** Its exports resolve `dist` with no source branch, so every fixture edit
  would need a rebuild; and the published rung needs a checkout, which an external consumer lacks.
- **`@app/publish-checks` as the home.** Cheaper by one edge, rejected on cohesion.
- **Folding `setupPackTests` in as a rung.** It takes a registration, not a directory. Different axis.

## Risks

- **A new workspace has six registration points** — `unit-suites`, vitest config, spec-cost record,
  CLAUDE.md, its own suite (`spec-placement` requires one), chain inputs. `packages/repo-checks/CLAUDE.md`
  records what the last extraction cost and why it was still right; read it first.
- **Shared checkout.** Another agent commits in this tree. Read a file before a whole-file write and use
  `git commit -- <paths>`; a full-file `Write` over a doc another session was editing went unnoticed for
  several commits during `goal-integration-pool`.
