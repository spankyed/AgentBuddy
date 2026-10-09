> **Done** (`214a720a7`, `5bb3aafdb`, `11adaa32c`, `89133cf71` on `AS/external-pack-authoring`). The text
> below is the plan as written; the apply and migration targets were afterwards derived from
> `PackManifest` with `Pick` rather than restating its fields (`48ead0c3e`). For the current layout, see
> `packages/abuddy-host/src/packs/runtime/CLAUDE.md`.

> **Written in session** `358d44db-c4f3-4dfe-89d3-40b001a63086` (Claude Code, 2026-09-20). Resume it with `claude -r 358d44db-c4f3-4dfe-89d3-40b001a63086`.

```
# Goal: an external pack content after the packs it depends on, and an apply that failed for want of one is retried

Implement docs/archive/goals/goal-pack-apply-order-and-retry.md on AS/external-pack-authoring, at or after
ce4ff5402 — the base its Background was surveyed at.
Before Phase 1, confirm the base: `applyPackContent` in packages/abuddy-host/src/packs/runtime/apply.ts
records `packContentRevisions` for a failed content as well as a successful one, and
`externalPackTargets` in packages/abuddy-host/src/packs/pack-registration.ts returns packs in
registration order. If they don't, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- A pack content after every installed pack it declares a dependency on, and a dependency cycle is
  reported and written in a stable order rather than hanging or throwing.
- A pack whose content failed is written again once any pack it depends on has written since, and is still
  not re-applied when nothing that could change the outcome has changed.
- `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`, `npm run test:external-pack`
  all pass.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

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
- make a failed content retry on every boot. `loader.spec.ts`'s "doesn't re-import unchanged failing content
  data on every boot" is a deliberate contract, not an oversight (Decision 3).
- reorder pack loading, registration or activation. Only the order packs are written and migrated in
  changes (Decision 2).
```

## Background

Surveyed at `ce4ff5402` on `AS/external-pack-authoring`.

Two faults, which look like one because they show together.

**Nothing orders the packs.** `startPacks` (`packs/runtime/start.ts`) content every external pack with
`applyPackContent(registry.externalPackTargets())`, and `externalPackTargets` returns them in registration
order, which comes from `discoverPacks`'s `readdirSync` — near enough alphabetical, and unrelated to what
depends on what. A pack declares `dependencies` in its manifest (`Record<packId, versionRange>`,
`manifest-schema.ts:222`), and `checkDependencies` (`pack-installer.ts:164`) uses that at install time to
report a missing one. Nothing uses it to decide what content first. There is no toposort in host or SDK.

Only external → external edges matter. `startPacks` runs `runRegisteredBootApplies` (the built-in packs')
before `applyPackContent`, so a dependency on a built-in pack is already satisfied.

**A failed content is never retried.** `applyPackContent` records `packContentRevisions[packId]` for a failed content as
well as a successful one (`apply.ts:85`), and the skip test is `storedHashes[packId] === currentHash`. So a
pack that failed keeps its `lastError` and is skipped on every later boot until its own compiled data
changes. When the failure was "the pack I depend on hadn't written yet", its own data never changes, and
the pack stays broken until it is reinstalled.

The cross-boot case is the one ordering alone can't fix: pack B is installed before pack A, B content and
fails, A is installed later and content, B is still skipped.

**The recording is deliberate, and half right.** `loader.spec.ts`'s "doesn't re-import unchanged failing
content data on every boot, and keeps its lastError" pins it. A pack whose flow is genuinely invalid should
not re-import its whole content on every boot forever. What is wrong is not that a failure is remembered; it
is that the hash is asked a question it can't answer. `packContentRevisions` means "the data we last ran", and
the skip rule reads it as "the data we last ran *successfully*, and nothing else has changed since".

## Decisions

1. **Content order is dependency order**, from each pack's manifest `dependencies`, over the installed
   external packs. Edges to packs that aren't installed external packs (built-ins, missing dependencies)
   are dropped: built-ins have already written by then, and a missing one is reported at install.

2. **Only the order packs are written and migrated in changes.** The sort goes in `externalPackTargets`,
   which feeds `runPackMigrations` and `applyPackContent` and nothing else. Load, registration and activation
   order are untouched — they decide which pack wins a designation or a plugin id, and changing them is a
   different change with a different blast radius.

3. **A failed content is retried when something that could change the outcome has changed**, which is its own
   compiled data (today's rule, kept) or the apply state of a pack it depends on. Not on every boot: a pack
   with a genuinely invalid flow and settled dependencies stays skipped, which is the contract
   `loader.spec.ts` already pins.

4. **What a failed attempt was up against is recorded, not inferred.** `AppState.packContentDeps` holds, per
   pack whose last content failed, a fingerprint of its dependencies' content hashes at that moment. A pack that
   content cleanly has no entry. The skip rule is then: same data, *and* either the last attempt succeeded or
   the dependencies are as they were. A new `AppState` field needs no migration — `appState.get()` fills a
   missing one with `{}`.

5. **A cycle is reported and written, not refused.** Two packs depending on each other is a pack-authoring
   mistake that must not stop an app from booting, so the packs in it are still written — in an order that
   is arbitrary but deterministic, since no order satisfies a cycle — and the cycle is logged naming the
   packs in it.

6. **Built-in packs are not ordered.** `runRegisteredBootApplies` content them in registration order, and
   default-setup is the only one. When a second built-in pack with a boot apply exists, this is the place
   to look.

## Phases

### Phase 1 — the order

A pure `packContentOrder(packs)` over `{ id, dependencies }`, returning them so every pack follows the
installed packs it depends on, with a cycle reported and its packs still returned. `externalPackTargets` returns
its result.

**Done when:** a spec covers a chain, a diamond, an edge to a pack that isn't installed, a cycle (every
pack still returned, once, and the cycle logged), and a stable order for packs with no edges between them. `npm test -w @abuddy/host` passes.
**Mutation:** returning the input unsorted fails the chain case.

### Phase 2 — the record of what a failed attempt faced

`AppState.packContentDeps: Record<string, string>`, written by `applyPackContent` when an apply fails and cleared
when one succeeds. `appState.updatePackEntry` gains the ability to clear an entry.

**Done when:** a failed content leaves a `packContentDeps` entry and a successful one leaves none.
**Mutation:** not clearing it on success makes a later successful re-apply leave a stale entry; assert on it.

### Phase 3 — the skip rule

`applyPackContent` skips a pack when its hash matches *and* its dependency fingerprint matches what the last
failed attempt faced (or the last attempt succeeded). The `lastError` handling is unchanged.

**Done when:** a pack that failed for want of a dependency is written again on the run after that
dependency content, and a pack that failed with settled dependencies is not.
**Mutation:** dropping the dependency half of the rule fails the first; dropping the hash half fails
`loader.spec.ts`'s existing "doesn't re-import unchanged failing content data on every boot".

### Phase 4 — the docs

`abuddy-host/CLAUDE.md` (the applying paragraph and the `AppState` field list),
`src/packs/runtime/CLAUDE.md` (the boot sequence's content step), `src/app-state/index.ts`'s field comment,
and `docs/public-facing/content.md` if it describes when a pack re-applies.

**Done when:** no doc still says a failed content is retried only when the pack's own data changes.

## Deferred

- **Ordering built-in packs' boot apply** (Decision 6).
- **Retrying an apply whose dependency was installed but never written** — the fingerprint covers a
  dependency that content, not one that is installed and has nothing to apply. Its hash is `''` before and
  after, so a pack that failed against it is not retried. Reachable only if a dependency ships no compiled
  content and the dependent's failure was about something else it provides.

## Constraints

- `loader.spec.ts`'s existing content tests are the contract. A phase that makes one of them fail has got
  Decision 3 wrong, not the test.
- `applyPackContent` takes `PackContentTarget` (`{ manifest: { id }, dir }`), which its 20-odd test call sites
  build by hand. Widening it to carry dependencies means touching all of them: prefer reading the
  dependency fingerprint from state the function already has, or extend the target with an optional field.
- No new module-level state: `tests/packs/registry-state.spec.ts` covers the registry modules.
- The sort must be stable, so an app with no dependencies between its packs content them in the same order
  it does today.

## Outcome (2026-09-20)

All four phases done, on `AS/external-pack-authoring`.

### Per phase

- **Phase 1 — the order.** `packContentOrder` in `packs/pack-discovery.ts`: a DFS in input order emitting
  post-order, so it is stable for packs with nothing between them. `externalPackTargets` orders every
  installed external pack and then narrows to `packIds`, rather than ordering the subset: a subset's order
  has to agree with the whole.
- **Phase 2 — the record.** `AppState.packContentDeps`, and `updatePackEntry` takes `undefined` to remove an
  entry.
- **Phase 3 — the skip rule.** `dependencyState` folds the dependencies' content hashes into one string,
  reading both `packContentRevisions` and `contentRevisions` so a dependency on a built-in pack counts. State is read
  per pack inside the loop, not once outside it, so a pack sees what its dependencies written in the same
  run.
- **Phase 4 — the docs.** `abuddy-host/CLAUDE.md`, `packs/runtime/CLAUDE.md` (the module table, the boot
  sequence and the `contentManifest` note), the `AppState` field comment, and `docs/public-facing/content.md`.

### Conventional choices

- `PackContentTarget.manifest` and `PackMigrationTarget.manifest` are `Pick<PackManifest, …>`, so the ~20
  test call sites that build `{ manifest: { id }, dir }` by hand were untouched, as the Constraints asked.
  They first restated the fields, with `dependencies?` written optional for exactly that reason; picking
  them takes the optionality from the manifest, where a pack with no dependencies declares none, and makes
  a field leaving `PackManifest` a build failure here.
- The cycle warning names the packs in it (`a -> b -> a`), logged once per sort.

### Corrections to the Decisions

- **Decision 5 claimed a cycle's packs keep their input order.** A DFS post-order can't promise that —
  `[a→b, b→a]` comes back `[b, a]`. The decision now says arbitrary but deterministic, which is what any
  order of a cycle is worth.

### Open items

The Deferred section stands: built-in packs' boot apply are not ordered (default-setup is the only one
with a boot apply), and a dependency that is installed but has nothing to apply reads the same as one that
has never written, so a pack that failed against it is not retried.

### Final verification

`npm run typecheck` ✅ · `npm run test:unit` ✅ (8/8 suites) · `npm run build` ✅ · `npm test` ✅ (13) ·
`npm run test:external-pack` ✅ (23 + 8 + 1). Host suite 473 tests.

Mutations, each failing the right test: the order returned unsorted · edges followed to packs not in the
list · a pack reachable twice emitted twice · the cycle not reported · the cycle guard removed (recursion)
· the dependency half of the skip rule dropped · the hash half dropped (which fails the existing
"doesn't re-import unchanged failing content data on every boot") · the record not written on failure · not
cleared on success · the fingerprint ignoring the dependencies' hashes · state read once outside the loop.
