# Goal: the checks on a published package live where publishing does

> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-25). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: the checks on a published package live where publishing does

Implement docs/goals/goal-published-package-checks.md on AS/chain-inputs, at or after c4f59a87c — the
base its Background was surveyed at. After goal-test-placement.md lands: its Phase 2 creates the
@abuddy/testing suite that one of the Open decisions here can put the packing fixture in, and its Phase 3
adds the guard this goal's last phase extends.
Before Phase 1, confirm the base: packages/abuddy-cli/tests/helpers/published-packages.ts exists and is
imported by 21 files, of which 9 use its packing exports. If those counts are far off, stop and say so —
the survey was taken somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decision must be settled with the user before Phase 2; if it is
still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — it is a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard or helper is
  mutation-checked.
- No spec whose subject is a published @abuddy package sits in a package that does not publish it, or the
  exception is recorded with a reason and a stale-entry check.
- The packing fixture has one home, reachable by every spec that needs it without a cross-package
  relative import.
- Every suite whose specs moved has been re-recorded with `npm run spec-cost:update -- --suite <dir>`,
  measured with nothing else on the machine.
- npm run typecheck; npm run spec-cost:check; npm run test:integration; npm run chain once at the end.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: another agent works in this checkout and stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- delete or loosen a test to make a number move.
```

## Background (surveyed 2026-09-25 at `c4f59a87c`)

[`goal-test-placement.md`](../archive/goals/goal-test-placement.md) applies one rule — *a spec lives with the thing it can
break* — to five findings. This is the sixth, split out because it is four times the size of any of them
and because, unlike the others, **it has no obvious right answer**: the specs in question have a subject
that belongs to no single package.

Twelve specs in `@abuddy/cli` are about the published `@abuddy` packages rather than about the CLI. They
are 30.2s of that suite's 190.8s:

| ms | Spec |
|---|---|
| 7913 | `tests/build/published-sdk-any.integration.spec.ts` |
| 6820 | `tests/build/published-sdk-types.integration.spec.ts` |
| 5231 | `tests/build/published-exports.integration.spec.ts` |
| 5176 | `tests/build/published-ui-types.integration.spec.ts` |
| 3454 | `tests/build/published-declarations.integration.spec.ts` |
| 1193 | `tests/build/package-freshness.spec.ts` |
| 239 | `tests/build/ui-import-side-effects.spec.ts` |
| 110 | `tests/build/verify-node-modules.spec.ts` |
| 52 | `tests/build/published-specifiers.spec.ts` |
| 28 | `tests/build/published-ui-dist.spec.ts` |
| 15 | `tests/build/checkout-packages.spec.ts` |
| 7 | `tests/build/ui-exports.spec.ts` |

**The family is already split across two packages**, which is the clearest sign it has no settled home:
`published-imports.spec.ts` and `published-sdk-peers.spec.ts` live in `@app/repo-checks`, moved there by
[`goal-one-job-pool.md`](goal-one-job-pool.md) because they import `scripts/lib/published-imports.ts`. So
"where do the `published-*` specs go" has been answered twice, differently, on a mechanical criterion that
happened not to apply to the other twelve.

### What actually couples them: the packing fixture

`tests/helpers/published-packages.ts` is imported by 21 files, which overstates the coupling. Its exports
divide cleanly:

- **`installPublishedPackages()`, `compileConsumer()`, `CONSUMER_MATRIX`, `PACKED_PACKAGES`,
  `TSC_VERSIONS`** — npm-packs `@abuddy/ears`, the SDK and UI into a temp `node_modules` and compiles a
  consumer against them, across the current TypeScript and the 5.7 floor × `node16`/`bundler`. **Nine
  files use these.**
- **`REPO_ROOT` and `PACKAGES_BUILT`** — a path constant and a freshness verdict. **Twelve files use only
  these**, and both are now available from `@abuddy/host/build/packages-built` (`REPO_ROOT` directly,
  `PACKAGES_BUILT` via `packagesBuiltOrRefuse()`, which `@app/repo-checks` already calls). Those twelve
  import a packing fixture to get a path.

That split is what makes the move hard, because the nine real users are not one concern:

| Group | Specs | Subject |
|---|---|---|
| **A — the published artefact** | `published-declarations`, `published-exports`, `published-sdk-any`, `published-sdk-types`, `published-ui-types` | what a consumer gets from `@abuddy/ears`, `/sdk`, `/ui` |
| **B — the CLI, with a packed consumer as fixture** | `facade-typing`, `fe-bundler-host-registry`, `types-bundler-determinism` | `abuddy build`'s bundlers and facade gate |
| **freshness** | `package-freshness` | `@abuddy/host/build/packages-built`'s stamp rule; uses `PACKED_PACKAGES` only to assert `BUILD_UNITS` covers everything packed |

Group B legitimately belongs in `@abuddy/cli`. So wherever Group A goes, the packing fixture cannot simply
go with it — Group B would then reach across a package boundary for a test helper, which is the defect this
family already exhibits.

### Why it matters beyond tidiness

`@abuddy/cli`'s cost record says it is the heaviest suite in the repo. Of its 65 specs, these 12 are about
the published packages and (per `goal-test-placement.md` Finding 1) six more are about `@abuddy/testing`
and `@abuddy/ui`. Those records are not documentation any more — `suite-split.spec.ts` places specs by
them and the chain sizes step budgets from them — so a package that serves as a dumping ground confounds
both, and no care taken over the measurement fixes a mislabelled subject.

### What the chain guarantees now, and what it still does not

Reviewed 2026-09-25 after the chain's cache work landed. Three of these change how a phase below is
written; the last is a confounder that remains, and a number in the docs that is already wrong is in
Constraints.

**A new suite that never runs no longer passes silently.** Phase 2 may create a workspace and add it to
`UNIT_SUITES` and the root `projects` list. The pool runs one vitest with `--project <workspace>` per stale
suite and then stamps them all — and a `--project` filter that matches nothing is *dropped silently* as long
as one other filter matched: measured, `--project @abuddy/ears --project @abuddy/no-such-project` runs ears
and exits 0 with no warning. So a new suite whose workspace name did not match its vitest project name would
be stamped as having passed a run it was excluded from, and would stay cached.

The pool now checks the run against what it asked for and fails naming the projects that never reported.
Note what this does *not* cover: `chain-inputs.spec.ts` compares the **directories** in the root config with
`UNIT_SUITES`, not project names, so the ordering guard Phase 2 satisfies says nothing about this. The
runtime assertion is the one that does.

**`npm run chain -- --all` is usable as a baseline again.** It used to run the two unit pools and let them
skip every project — 2634 tests, green, in seconds. Anything measured with `--all` before 2026-09-25 is not
comparable with anything measured after. Phase 3 and the Finished-when both lean on a chain run, so this is
the difference between a before/after and two unrelated numbers.

**A step that reads what another writes is guarded again, in both directions.** Phase 2's `SUITE_READS`
entry for the built packages means the new suite declares `PACKAGE_BUILD_OUTPUTS`, and a guard now fails if
its `needs` do not follow. The same guard catches the reverse — a declared input that *contains* another
step's output — which is how `typecheck` came to read the E2E suite's screenshots and never cache.

**Still confounded: the built-in pack's runtime bundle is not reproducible.**
[`pack-runtime-nondeterminism.md`](../plans/pack-runtime-nondeterminism.md) has the measurement — three
bytes, about three builds in four. It matters here only in how a Phase 3 run reads: whenever `compile`
actually runs, every step declaring `PACK_OUTPUTS` goes stale for one cycle and the chain prints
*"N steps passed but will run again next time"*. That is the cache verifier, not the drift report, and it is
not caused by anything this goal does. Phase 3's Done-when says which line it means.

## Decisions

Final.

1. **Group B stays in `@abuddy/cli`.** Its subject is the CLI's bundlers and facade gate; a packed
   consumer is the fixture, not the thing under test. Whatever happens to Group A must leave Group B with
   a non-relative way to reach the fixture.
2. **The twelve incidental importers stop using the fixture for a path.** They take `REPO_ROOT` from
   `@abuddy/host/build/packages-built` and, where they need it, `PACKAGES_BUILT` from
   `packagesBuiltOrRefuse()`. This is true regardless of how the Open decision lands, costs nothing, and
   makes the real coupling visible — so it is Phase 1 and lands on its own.
3. **`package-freshness` stays where its subject is.** Its subject is the stamp rule in `@abuddy/host`, not
   the packed output; it reads `PACKED_PACKAGES` only to assert `BUILD_UNITS` covers it. If Phase 1 leaves
   it needing nothing but that one constant, the constant moves to it rather than it moving to the fixture.
4. **No spec is deleted or merged by this goal.** `goal-test-cleanup.md` did that sweep. If a move exposes
   a duplicate, apply its Decision 10 — a duplicate that names the level it adds is not a duplicate.
5. **Re-record, never hand-edit, a cost.** Moving a spec between packages changes which record it is in.
   `npm run spec-cost:update -- --suite <dir>` per touched suite, measured with nothing else running
   (`goal-measured-placement.md`).
6. **Don't reopen cost-based placement or the two pools.** Which half a spec runs in is decided by
   `etc/spec-cost.json` and the dead band; which pool by `UnitSuite.kind`. Both settled.

## Open decision

Settle with the user before Phase 2. Four answers, and the fixture's home is part of each.

| | Where Group A goes | Where the packing fixture goes | Cost |
|---|---|---|---|
| 1 | `@app/repo-checks` | with it, exported for Group B | Two siblings are already there, so the family stops being split. But `repo-checks` is defined as *specs whose subject is a repo script*, and these aren't — the definition widens to "cross-package concerns", and its boundary guard has to widen with it |
| 2 | A new `@app/publish-checks` | with it | Mirrors `repo-checks` exactly, and the subject is genuinely its own. A fourth workspace that exists for twelve specs, and the `published-*` family in `repo-checks` should then move again |
| 3 | `@abuddy/ears`, `/sdk`, `/ui` respectively | promoted to a published `@abuddy/testing` export | The fixture's natural home: `@abuddy/testing` *is* the test-fixture package, `goal-test-placement.md` Phase 2 gives it a suite, and Group B reaches it by a normal import. But `published-exports` and `published-declarations` span all three packages in one consumer install, so they have no single owner and would need splitting or an arbitrary host |
| 4 | Stay in `@abuddy/cli`, with the reason recorded | stays | Honest null option. Publishing is driven from `scripts/publish-packages.ts` and `scripts/bundle-package.ts`, so the *repo* publishes and the CLI is merely where the helper landed — which is an argument for 1, not for 4. Choosing this means recording that `@abuddy/cli`'s cost record includes 30.2s that is not about the CLI, so nobody reads it as a CLI number |

What would decide it: whether "the published packages" is a subject with its own home (1 or 2), or a
property each package owns about itself (3). Option 3 is the only one that makes a spec's location predict
its subject without a new workspace, and the only one that has to answer the spanning problem.

## Phases

### Phase 1 — stop importing a packing fixture to get a path

For each of the twelve files that use only `REPO_ROOT`/`PACKAGES_BUILT`, take them from
`@abuddy/host/build/packages-built` instead. Independent of the Open decision, and it drops the fixture's
apparent reach from 21 files to 9.

**Done when:** `grep -rl helpers/published-packages packages/abuddy-cli/tests` lists nine files, each of
which uses a packing export; `npm test -w @abuddy/cli` and `npm run test:integration -w @abuddy/cli` green.

### Phase 2 — settle and move

Act on the Open decision. Move Group A and the packing fixture to wherever it lands, leaving Group B a
non-relative import (Decision 1). If a new workspace is created, it follows `@app/repo-checks`: private,
`host` kind in `UNIT_SUITES`, `SUITE_READS` entry for the built packages, both vitest configs, an entry in
the root `projects` list in `UNIT_SUITES` order, `pretest` running `ensure-packages-built`, and a
`CLAUDE.md` saying what it is for and what it is not.

**Done when:** every Group A spec is in the chosen home and passes there; Group B passes unchanged with no
relative import crossing a package; the `published-*` specs in `@app/repo-checks` are either with their
siblings or recorded as staying, with the reason. If a new workspace was created, show that its suite **ran**
rather than that it appears — `npm run test:unit:host -- --all` naming it in the output, or the pool's total
test count rising by the specs that moved. A suite can be listed, ordered and stamped without executing, and
"appears in `test:unit:host`" does not distinguish the two.

### Phase 3 — re-record and re-measure

`spec-cost:update` for every touched suite. Then check what the chain now says: `test:integration`'s
`seconds` is measured across the suites that have an expensive half, and this moves ~30s between them.
Re-record it if a run reports drift past the band; leave it if not, and say which.

**Done when:** `spec-cost:check` passes; `npm run chain` is green with no **drift** report, or the drift is
recorded with the measurement behind it. A *"passed but will run again next time"* line is a different thing
— the cache verifier — and after a run in which `compile` rebuilt the pack it is expected and not this
goal's doing; see the confounder above before chasing it.

### Phase 4 — the guard

Extend `goal-test-placement.md` Phase 3's placement guard so that a spec whose subject is a published
`@abuddy` package cannot sit in a package that does not publish it. The mechanical signal available is the
packing fixture: a spec that installs or compiles a published consumer belongs in the chosen home.
Exceptions recorded with reasons and a stale-entry check — Group B is the first entry, and its reason is
Decision 1.

Mutation-check it: put a Group A spec back in `@abuddy/cli` and watch the guard name it.

**Done when:** the guard passes, has been made to fail, and its exception list has a reason per entry.

## Deferred

- **Whether `@abuddy/cli` should own `tests/build/` at all.** After this goal and
  `goal-test-placement.md`, that directory is bundlers, gates and Group B. Whether "the CLI's build
  pipeline" wants its own suite is a separate question and needs the numbers those two goals produce.
- **The consumer matrix's cost.** `published-sdk-any` and `published-sdk-types` are 14.7s between them
  because they compile a consumer across four TypeScript × moduleResolution combinations. Whether every
  combination earns its place is a coverage question, not a placement one.

## Constraints

- **Measure with nothing else on the machine**, and never hand-edit a recorded cost. A spec's cost is its
  wall time under whatever else its half is running.
- **Take the "before" from a run, not from the docs.** The root `CLAUDE.md` still describes the chain as
  17 steps at two lanes costing 190.1s; it is 11 steps at three lanes, measured 173.8s cold and 26.0s warm
  on 2026-09-25. Correcting that table is its own item and is not this goal's job — but using it as a
  baseline would compare against a chain that no longer exists.
- **A guard that cannot fail is worse than none.** Break Phase 4's guard on purpose and watch it fail, in
  a copy or a worktree — a mutation in this shared tree has reached the index before.
- **Another agent works in this checkout.** Check `git status` before committing and name paths
  explicitly.
- **The packed fixture is expensive and shared.** `installPublishedPackages()` npm-packs three packages
  into a temp tree; `@abuddy/cli`'s integration config caps worker threads because these specs spawn
  compilers of their own. A new suite that runs them needs the same cap, and its reason recorded — the
  comment in `vitest.integration.config.ts` has the measurement.
- **Don't relitigate settled decisions.** Cost-based placement, the two pools, the tier table, and
  `goal-test-cleanup.md`'s Decisions 1–10 are final.
