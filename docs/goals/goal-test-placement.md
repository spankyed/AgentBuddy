# Goal: every spec lives with the thing it can break

> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-25). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: every spec lives with the thing it can break

Implement docs/goals/goal-test-placement.md on AS/chain-inputs, at or after e82b960af — the base its
Background was surveyed at.
Before Phase 1, confirm the base: packages/abuddy-testing and packages/abuddy-ui have no `test` script,
packages/default-setup has six specs under src/, and packages/api/tests has only a `unit/` directory. If
any of those is already false, stop and say so — the survey was taken somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decisions must be settled with the user before Phase 4; if either is
still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — it is a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward. Stored user data is the exception: it moves
with migrations.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard or helper is
  mutation-checked.
- Every package with a `src/` either has a suite or is on a recorded list with a reason, and a guard
  fails when that stops being true.
- No spec imports another package's `src/` by relative path, or the exception is recorded with a reason
  and a stale-entry check.
- `docs/reference/test-inventory.md` exists and describes the suite as it is; `docs/plans/test-inventory.md`
  is archived.
- npm run typecheck; npm run spec-cost:check; the suites this goal touches; npm run chain once at the end.
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
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- delete or loosen a test to make a number move.
```

## Background (surveyed 2026-09-25 at `e82b960af`)

[`goal-test-cleanup.md`](goal-test-cleanup.md) swept the suite for tests that could not fail meaningfully
and finished on 2026-09-25. It acted on four of the five verdict classes
[`test-inventory.md`](../plans/test-inventory.md) defined — `KEEP`, `TRIM`, `MERGE`, `DELETE` — and barely
touched the fifth, **`MOVE`: right assertion, wrong level or package.** This goal is that class, plus what
that sweep deferred.

The distinction matters because the two pathologies have different causes. A pinned message is written
wrong once. A misplaced spec is written *correctly* and then left behind when the code moves — so it
accumulates on its own, and the tree records the repo's history rather than its current structure. The
tree says so in its own words: `default-setup/tests/unit/_hybrid/CLAUDE.md` reads *"The directory's name is
historical: these specs once imported the API's EARS and repository modules too."*

### Where the specs are

364 specs in nine package suites, plus 14 E2E and 15 fixture-pack specs.

| Package | `tests/` | `src/` | Suite? |
|---|---|---|---|
| default-setup | 81 | **6** | ✓ |
| abuddy-host | 77 | 0 | ✓ |
| abuddy-cli | 65 | 0 | ✓ |
| abuddy-sdk | 56 | 0 | ✓ |
| repo-checks | 16 | 0 | ✓ |
| api | 15 | 0 | ✓ |
| abuddy-ears | 9 | 0 | ✓ |
| renderer | 8 | 0 | ✓ |
| main | 2 | 0 | ✓ |
| **abuddy-testing** | 0 | 0 | **none** |
| **abuddy-ui** | 0 | 0 | **none** |
| preload | 0 | 0 | none |

### Finding 1 — two packages have no suite, and `npm run spec` cannot reach them

`@abuddy/testing` and `@abuddy/ui` have no `test` script and no `vitest.config.ts`. Six specs about them
live in `@abuddy/cli`, reaching across the boundary by relative path:

| Spec (in `@abuddy/cli`) | Subject |
|---|---|
| `tests/app/app-target.spec.ts` | `abuddy-testing/src/launch-env` |
| `tests/app/app-version.spec.ts` | `abuddy-testing/src/app-version` |
| `tests/build/checkout-freshness.spec.ts` | `abuddy-testing/src/checkout-freshness` |
| `tests/harness/shared-ears.spec.ts` | `abuddy-testing/src/shared-ears` |
| `tests/build/fe-bundler-ui-theme.spec.ts` | `abuddy-ui/src/tailwind-preset` |
| `tests/build/ui-exports.spec.ts` | `abuddy-ui/scripts/exports` |

This is the same class as the `scripts/` hole that
[`goal-one-job-pool.md`](goal-one-job-pool.md) closed by creating `@app/repo-checks`, and it fails louder:

```
$ npm run spec -- packages/abuddy-testing/src/launch-env.ts
→ packages/abuddy-testing: specs importing src/launch-env.ts
Error: Projects definition references a non-existing file or a directory:
  .../packages/abuddy-testing/packages/abuddy-sdk
```

With no config of its own, vitest walks up to the root one and resolves its `projects` list against the
wrong directory. So editing `@abuddy/testing` — whose fixture every pack's E2E depends on, this repo's
included — is checked by nothing you can invoke from the change.

### Finding 2 — `@app/api`'s suite is named `unit` and is mostly app-runtime integration

`packages/api/tests` has one directory, `unit/`, holding 15 specs. Ten boot a runtime: `app-reset`,
`restart-persistence`, `packaged-boot`, `upgrade-from-0.3.14`, `app-database-parity`, `bound-runtime`,
`bus-client-connected`, `host-data-services`, `log-capture`, `secrets`.

The **tier is not the problem** and is not in scope: `SUITE_READS` already declares this suite reads the
pack's `dist`, measured, and tier 1 admits the in-memory runtime. The folder name is the problem, and two
of those specs have host subjects rather than api ones.

### Finding 3 — one spec mocks another package's internal file by relative path

`api/tests/unit/secrets.spec.ts` does `vi.mock('../../../abuddy-host/src/secrets/vault.ts')`. Its stated
subject — the secrets procedures and log redaction — is genuinely the api's. The mechanism is not: it
couples api's suite to host's internal file layout, so renaming `vault.ts` breaks a spec in another
package and host's own suite says nothing.

### Finding 4 — `@abuddy/ui` has 33 recorded component contracts and no behavioural test

`packages/abuddy-ui/etc/*.component.md` pins 33 components' props, emits, slots and exposed members, and
`api:update` keeps them current. Exactly one spec in the repo mounts a Vue component
(`renderer/tests/views/packs/pack-detail.spec.ts`). The two `@abuddy/ui` specs that exist are about its
exports map and its tailwind preset, not its components.

This is a coverage gap rather than a misplacement, and Finding 1 is why it is easy to miss: there is no UI
suite to notice being empty. **Writing those tests is out of scope** (Deferred) — but Phase 2 creates the
suite they would go in, which is the precondition.

### Finding 5 — `default-setup` is the only package with colocated specs

Six, all frontend utilities, and `vitest.config.ts` carries `src/**/*.test.ts` with the comment *"without
this they are silently never run"*:

```
src/features/brain/fe/state.test.ts
src/features/code/fe/utils/fuzzy-search.test.ts
src/features/code/fe/utils/persisted-tabs.test.ts
src/features/database/fe/state.spec.ts
src/features/flows/fe/canvas/__tests__/layout-utils.test.ts
src/features/logs/fe/search.test.ts
```

Colocation is a mainstream pattern and fine on its own terms. Being the *only* package that does it is the
defect, and there are three conventions here, not two: `tests/`, `src/`, and one `__tests__/`. A layout
that needs a config line to avoid silence is one where the next file will be silent.

### Finding 6 — twelve specs about the published packages, split into its own goal

`@abuddy/cli` holds twelve specs whose subject is the published `@abuddy` packages rather than the CLI —
30.2s of that suite's 190.8s. They are the same defect as Finding 1 at four times the size, and unlike the
other five findings they have **no obvious right answer**: their subject belongs to no single package, the
family is already split (two of them live in `@app/repo-checks`), and the packing fixture they share is also
used by three specs that legitimately belong in the CLI. That needs a decision rather than a move, so it is
[`goal-published-package-checks.md`](goal-published-package-checks.md), to be done after this one — its
Phase 2 depends on the `@abuddy/testing` suite this goal's Phase 2 creates, and its Phase 4 extends this
goal's Phase 3 guard.

It matters here for one reason: until it lands, `@abuddy/cli`'s cost record includes 30.2s that is not about
the CLI, so the record cannot be read as a CLI number.

### What the earlier inventory still has open

[`test-inventory.md`](../plans/test-inventory.md) was written 2026-09-19 against
`AS/package-boundaries` at `1dd69172e` and has not been touched since. Its numbers are out — 279 spec
files and 2,211 tests against 364 and roughly 2,654 — it predates `@app/repo-checks`, the CLI suite's two
halves and the cost records, and its per-file references are stale. Checked at this base:

| Its candidate | State now |
|---|---|
| `claude-code-permission-shape.spec.ts` (10 tests on a Zod mirror) | **gone** |
| `_hybrid/actions-export` + `prompts-export` clones (14 → 7) | **merged** into `export-round-trip.spec.ts` |
| `no-engine-state-access.spec.ts` | **gone** (Decision 4) |
| `pack-protocol.spec.ts` (7 tests, no product import) | **still present**, deferred by its Decision 7 |
| three cross-package duplicate titles | **still two files each** |

Two of its conclusions are superseded and must not be re-implemented. Its Decision 12 and 14 — split a
suite by *what a spec does*, and guard that the fast half spawns nothing — were replaced by
[`goal-measured-placement.md`](goal-measured-placement.md): placement is decided by **measured cost** in
`etc/spec-cost.json` with a dead band, and `suite-split.spec.ts` is the guard. Mechanism was a proxy that
said three things wrongly. Its Decision 11 was already struck by the inventory's own Finding 1.

## Decisions

Final.

1. **A spec lives with the thing it can break.** The package whose source a failure would point at owns
   the spec. This is the rule the whole goal implements, and it is the same one the repo already applies
   to repositories and migrations.
2. **Every package with a `src/` has a suite, or is on a recorded list saying why not.** `preload` is the
   expected entry (it has no specs and its own CLAUDE.md explains its build); anything else on that list
   needs a reason a reader can check. A list with a stale-entry check, as this repo does everywhere else.
3. **Cost-based placement is settled and out of scope.** Which *half* a spec runs in is decided by
   `etc/spec-cost.json` and the dead band (`goal-measured-placement.md`). This goal moves specs between
   *packages*, which changes which record they are in — so every phase that moves a spec re-records with
   `npm run spec-cost:update -- --suite <dir>` and never edits a cost by hand.
4. **A new suite is a `host` suite unless it must resolve the published `dist`.** `@abuddy/testing` and
   `@abuddy/ui` are host packages, so they join the root pool as `host` kinds in `UNIT_SUITES`, with
   `SUITE_READS` entries for what they actually read. `UnitSuite.kind` carries why that matters.
5. **Don't reorder or re-tier anything to make this tidy.** Findings 2's tier is measured and correct;
   only the folder name and the two host-subject specs are in scope.
6. **Deleting is not this goal's job.** `goal-test-cleanup.md` did that sweep. Where a move exposes a
   duplicate, apply its Decision 10 — a duplicate that names the level it adds is not a duplicate — and
   merge only then.
7. **The inventory becomes a reference doc, not a plan.** `docs/reference/test-inventory.md` describes the
   suite as it is and is the standing answer to "what tests do we have and where do they belong".
   `docs/plans/test-inventory.md` is archived, since its purpose was to feed a goal that is finished.
8. **Don't regenerate the per-test provenance.** The 2026-09-19 survey `git blame`d every `it(` line
   across 325 commits. Its own Finding 1 showed provenance does not predict a verdict, and none of this
   goal's findings needed it. `git blame` stays a reading aid.

## Open decisions

Settle with the user before Phase 4.

- **Finding 3, the api→host vault mock.** Two honest answers: host exports a seam the api's spec mocks
  through its public surface, keeping one spec; or the vault-failure cases move into host's suite and the
  api keeps only the procedure-level assertions, splitting it. The first keeps the boot-level coverage in
  one place; the second makes each package's suite own its own subject.
- **Finding 5, default-setup's colocation.** Move the six into `tests/unit/`, matching all nine other
  packages and deleting the `src/**` include with its warning comment; or declare colocation the
  convention for FE utilities, check that it is followed, and drop the `__tests__/` variant. Moving is
  cheaper and makes the repo uniform.

## Phases

### Phase 1 — record the suite as it is

Write `docs/reference/test-inventory.md`: the location table above, the seven categories the tree actually
distinguishes (package unit; contract over build output; command/process; repo tooling; app runtime;
fixture pack; E2E), and the five verdict classes from the old inventory, with `MOVE` defined as this
goal's subject. Date it and name the base. Archive `docs/plans/test-inventory.md` with a
`> **Superseded in part**` blockquote pointing at the new doc and at `goal-measured-placement.md` for the
split decisions it got wrong.

**Done when:** the reference doc exists, describes HEAD, and no doc outside `docs/archive/` points at the
old one.

### Phase 2 — a suite for `@abuddy/testing` and `@abuddy/ui`

`vitest.config.ts` and a `test` script for each, declaring the `@abuddy/source` condition as every host
config does. Move the six specs from Finding 1, rewriting their imports to the package's own source. Add
both to `UNIT_SUITES` as `host`, to the root `vitest.config.ts` `projects` list in the same order
(`chain-inputs.spec.ts` asserts they match), and to `SUITE_READS` for what they read. Re-record both
suites' costs and `abuddy-cli`'s.

**Done when:** `npm run spec -- packages/abuddy-testing/src/launch-env.ts` runs those specs instead of
crashing; both new suites appear in `test:unit:host`; `spec-cost:check` passes; `abuddy-cli` is six specs
lighter.

### Phase 3 — the guards that keep placement true

In `@app/repo-checks`, beside `repo-check-boundary.spec.ts` which is the precedent:

- a package with a `src/` has a suite, or an entry in a recorded list with a reason, with the usual
  stale-entry check;
- no spec imports another package's `src/` by relative path, resolving specifiers rather than matching
  text (the boundary spec shows why: `@abuddy/ui` has a `scripts/` of its own).

Both mutation-checked: delete a suite's `test` script and watch the first fail by name; add a
cross-package relative import to a spec and watch the second.

**Done when:** both guards pass, both have been made to fail, and the only entries on either exception
list carry reasons.

### Phase 4 — `@app/api`: the folder name and the two host subjects

Settle the first Open decision, then act on it. Rename `api/tests/unit` to what it holds, or split the
five genuine unit specs from the ten runtime ones. Resolve `host-data-services` and `secrets` per that
decision.

**Done when:** no directory under `packages/api/tests` is named for a level it does not hold; the api's
suite imports no other package's `src/` by relative path; `@app/api` and `@abuddy/host` both green.

### Phase 5 — `default-setup`: one convention

Settle the second Open decision and act on it. If the six move, the `src/**` include lines and their
comment go with them, and `spec-cost.ts`'s `specFiles` walk keeps `src/` only if another package still
needs it — check, don't assume.

**Done when:** `default-setup` has one spec location; its vitest config declares no include that exists
only to stop files being silent; the suite is green and re-recorded.

### Phase 6 — the scan, bounded

Two bounded passes, not a repeat of `goal-test-cleanup.md`'s sweep:

1. **What it deferred.** `pack-protocol.spec.ts` (its Decision 7) and the three cross-package duplicate
   titles from the old Finding 4, each against Decision 10's test: does the second one name the level it
   adds? If not, merge; if so, add the sentence that says so.
2. **What has landed since 2026-09-25.** The specs added by the chain, pooling and placement work are the
   only ones the earlier sweep never saw. Apply the recorded signals — `msg-pinned`, `count-pinned`,
   `no-product-import`, `tests-fixture`, `dupe-title`, `type-only` — to that set alone, and record the
   result in the reference doc.

**Done when:** each deferred item is resolved or recorded with a reason; the signals have been run over
the specs added since the last sweep and the findings are in the reference doc; nothing was deleted that
covers behaviour nothing else covers.

## Deferred

- **Component tests for `@abuddy/ui`** (Finding 4). Its 33 recorded contracts have no behavioural test,
  and that is probably the largest coverage gap in the repo — but it is new test-writing, not relocation,
  and sizing it deserves its own look. Phase 2 creates the suite it would go in.
- **Re-recording the seed-parity goldens** with notes included, still deferred from
  `goal-test-cleanup.md`'s Decision 6.
- **`_hybrid`'s name**, which its own CLAUDE.md calls historical. Renaming a directory of three specs is
  churn unless Phase 5 is moving files there anyway; fold it in if so, leave it if not.

## Constraints

- **Measure before you move, and re-record after.** A spec's cost changes with the suite it runs in
  (`dependency-flow-helpers` read 4.7s in one half and 2.4s in the other). Run
  `spec-cost:update -- --suite <dir>` with nothing else on the machine, and never edit a recorded cost.
- **A guard that cannot fail is worse than none.** Every guard in Phase 3 is broken on purpose and watched
  to fail, in a copy or a worktree — a mutation in this shared tree has reached the index before.
- **Another agent works in this checkout.** Check `git status` before committing and name paths
  explicitly; anything left unstaged can end up in someone else's commit.
- **Don't relitigate settled decisions.** Cost-based placement (`goal-measured-placement.md`), the two
  pools and why they cannot be one (`UnitSuite.kind`), the tier table, and
  `goal-test-cleanup.md`'s Decisions 1–10 are all final. Where this goal's survey contradicts an old
  decision, the table in *What the earlier inventory still has open* says which and why.
- **Nothing in `docs/archive/` gets updated to match the code.** It records the past by design.
