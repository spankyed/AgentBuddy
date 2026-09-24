> **Done** (`5485273ac`, `ce4ff5402` on `AS/external-pack-authoring`). The text below is the plan as
> written; later work replaced the per-kind contribution record with one undo log shared by both
> registries (`f5bf8084c`, `ef358680f`), so `registerPack` no longer reads as the table this describes.
> For the current layout, see `packages/abuddy-host/CLAUDE.md`.

> **Written in session** `358d44db-c4f3-4dfe-89d3-40b001a63086` (Claude Code, 2026-09-19). Resume it with `claude -r 358d44db-c4f3-4dfe-89d3-40b001a63086`.

```
# Goal: the registry is the only list of the packs this app loaded

Implement docs/archive/goals/goal-loaded-packs-on-the-registry.md on AS/external-pack-authoring, at or after
9a8202fc3 — the base its Background was surveyed at.
Before Phase 1, confirm the base: packages/abuddy-host/src/packs/runtime/loaded-packs.ts exports
getLoadedPacks/setLoadedPacks/updateLoadedPack/removeLoadedPack/getBuiltInPackInfos/setBuiltInPackInfos/
getLoadedPackEntries/getPacksWithClientLoadedFrontends, and pack-registration.ts holds
`const registrations = new Map<string, PackRegistration>()`. If they don't, stop and say so — the plan
was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- packages/abuddy-host/src/packs/runtime/loaded-packs.ts does not exist, and `git grep getLoadedPacks`
  outside dist/ returns nothing.
- No module under packages/abuddy-host/src holds the loaded packs at module scope: the registry created
  by createPackRegistry() is the only place they live, and tests/packs/registry-state.spec.ts covers
  whatever module now owns them.
- startPacks takes only the registry; runPackMigrations and seedPackData are reached through it.
- tests/packs/two-registries.spec.ts asserts two registries hold their own loaded packs, and its opening
  comment no longer overstates what it checks.
- npm run typecheck, npm run test:unit, npm run build, npm test, npm run test:external-pack all pass.
- npm run api:update if any @abuddy/sdk, /ears or /ui export changed, with etc/ committed.
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
- add a field to PackRegistration (Decision 1). It is the pack contract, generated into every pack by
  generate-entries and pinned in etc/framework.api.md, and a pack cannot know where it was installed.
- keep loaded-packs.ts as a re-export or a thin wrapper. The module goes.
```

## Background

Surveyed at `9a8202fc3` on `AS/external-pack-authoring`.

`packages/abuddy-host/src/packs/runtime/loaded-packs.ts` holds two lists at module scope:

- `_loadedPacks: LoadedPack[]` — the external packs the app loaded
- `_builtInPacks: BuiltInPackInfo[]` — the built-in packs it loaded

The registry beside them is an instance per app (`createPackRegistry()`, `registrations = new
Map<string, PackRegistration>()`), and `tests/packs/registry-state.spec.ts` keeps its modules free of
module-level state. These two lists are the exception.

**They are not a second source of truth. They are one object written to two places.** `LoadedPack` is
`PackRegistration` — minus `receivedEventTypes`, with `systems` as a `Map` rather than an array — plus
two fields the registry is handed and discards: `manifest` and `dir`. In `lifecycle.ts:96,109` the same
`pack` value goes to `registerExternalPacks(registry, [pack])` and then to `updateLoadedPack(pack)`, and
`registerExternalPacks` (`loader.ts:321`) copies eleven fields off it and drops the other two.

**The two lists cannot legitimately diverge.** Every write site writes both from the same filtered set:

| Moment | Where | Why they agree |
|---|---|---|
| boot, built-in | `loader.ts:141,148` | `registry.registerPack(...)` then `loaded.push(pack)` in one `try`; `setBuiltInPackInfos(loaded)` after the loop |
| boot, external | `backend.ts:116,164` | `externalPacks = registerExternalPacks(...)` reassigns to only what registered; `setLoadedPacks` gets that list |
| activate | `lifecycle.ts:97,109` | returns early when `registered.length === 0`, before `updateLoadedPack` |
| teardown | `lifecycle.ts:38,48` | `unregisterPack` then `removeLoadedPack` |
| reload | `reload.ts:114,122` | throws when registration returns empty; `updateLoadedPack` only inside `afterRegister` |

So the module is a **projection** of the registry. This is a deletion, not a reconciliation.

### What the readers actually need

Production reads, all of which want provenance or an id — none wants anything only the module has:

| Reader | Takes |
|---|---|
| `migrations/index.ts:65` | built-in ids |
| `migrations/app/0.3.15.ts:33` | built-in ids, already joined with `registry.getPackRegistration(id)` |
| `loader.ts:67`, `reload.ts:133` | one built-in by id |
| `backend.ts:148`, `packs-system.ts:124` | built-in infos |
| `app-data.ts:30` | `startPacks(registry, getLoadedPacks())` — module state into a registry-scoped call |
| `app-data.ts:44` | `runPackMigrations(getLoadedPacks())` — needs `manifest.{id,version}` + `migrations` |
| `packs-system.ts:185` | an id check only (`.some(p => p.manifest.id === manifest.id)`) |
| `bus/app-bus.ts` | `getPacksWithClientLoadedFrontends()` — needs `dir` |
| `packs-router.ts:10` | `getLoadedPackEntries()` — needs `dir` and identity |

`seedPackData` needs `manifest.id` and `dir`. `runPackMigrations` needs `manifest.{id,version}` and
`migrations`. Both are provenance plus registration.

### What the asymmetry costs

Not correctness — nothing has diverged, because nothing can. **Isolation.**
`tests/packs/two-registries.spec.ts` opens "Registries are instances: two in one process hold their own
packs", and checks designations, steps, services, settings defaults and registrations. It says nothing
about loaded packs, because loaded packs are not on the registry. The guarantee is true for everything
the registry owns and silently untrue for the one list that is not. A harness building one registry per
test file in a shared vitest worker sees the previous file's loaded packs.

### What the change also deletes

`lifecycle.ts:114` and `reload.ts:116` each build `Array.from(pack.systems.keys()).map(featureId =>
`${packId}.${featureId}`)`. `registry.getRegisteredPackSystemIds(packId)` (`pack-registration.ts:363`)
already returns exactly that, from ids `loader.ts:314` wrote in the same shape. Two hand-rolled copies go.

## Decisions

1. **`PackRegistration` does not change.** It is the pack-facing contract: `generate-entries` writes it
   into every pack's `pack-entry.ts`, `etc/framework.api.md` pins it, and a pack cannot know its own
   install directory. Where the app found a pack is the host's knowledge, so it arrives as a second
   argument: `registerPack(registration, origin?)`.

2. **One origin shape for built-in and external packs.** Both answer the same question — where the app
   found this pack, and what it says it is. `PackOrigin` carries `id`, `name`, `version`, `dir`,
   `builtIn`, and for external packs the `manifest` readers already use. `BuiltInPackInfo` becomes an
   alias or is replaced outright; `LoadedPack` becomes `PackRegistration & { origin: PackOrigin }` at
   the seams that still need both.

3. **The registry owns it and `loaded-packs.ts` is deleted**, not moved and not re-exported. Moving
   module state into another module keeps the bug; the point is that the list stops outliving a registry.

4. **`startPacks(registry)` loses its `externalPacks` parameter**, and `runPackMigrations` and
   `seedPackData` are reached through the registry. `app-data.ts:30` currently threads module state into
   a registry-scoped call; that seam disappears rather than moving.

5. **Order is preserved by the Map.** `registrations` is a `Map`, so insertion order holds.
   `getLoadedPackEntries` keeps built-ins-then-externals by asking for each group, not by relying on one
   list's order.

6. **Teardown drops origin with the registration.** `unregisterPack` removes both, so the pairing that
   holds by convention today becomes structural — a teardown that forgets the second call stops being
   expressible.

7. **`getRegisteredPackSystemIds` replaces the hand-built system ids** in `lifecycle.ts` and `reload.ts`.

8. **No back-compat shim.** Each phase migrates every caller, test and doc it touches.

## Phases

### Phase 1 — the registry learns where a pack came from

Add `PackOrigin` and the second argument to `registerPack`. Add the reads: `packOrigin(packId)`,
`builtInPacks()`, `externalPacks()`, `packEntries()`. Both lists still live and are still written
together; nothing is migrated yet.

**Done when:** for every registered pack the registry returns what the module holds, asserted by a new
case in `tests/packs/registration.spec.ts`. `npm test -w @abuddy/host` passes unchanged otherwise.
**Mutation:** registering without an origin leaves the pack out of `externalPacks()`; the new case fails.

### Phase 2 — the built-in readers move

Six production sites (`migrations/index.ts`, `migrations/app/0.3.15.ts`, `loader.ts:67`,
`reload.ts:133`, `backend.ts:148`, `packs-system.ts:124`) and their tests read the registry.
`setBuiltInPackInfos`/`getBuiltInPackInfos` go.

**Done when:** `git grep BuiltInPackInfos` outside `dist/` returns nothing; unit suites pass.
**Mutation:** a built-in pack registered without an origin disappears from the Packs view's list, failing
`packs-system.spec.ts`.

### Phase 3 — the external readers move, and the parameters go

`app-data.ts`, `packs-system.ts:185`, `bus/app-bus.ts`, `packs-router.ts`. `startPacks(registry)`,
`runPackMigrations` and `seedPackData` take the registry. `lifecycle.ts` and `reload.ts` use
`getRegisteredPackSystemIds`.

**Done when:** no production file imports `loaded-packs.ts`; `startPacks` has one parameter; the two
hand-built `${packId}.${featureId}` maps are gone. `npm run test:unit` and `npm test` pass.
**Mutation:** a pack torn down but left registered would be seeded again on reset — assert reset seeds
only registered packs, and check it fails when `unregisterPack` keeps the origin.

### Phase 4 — delete the module and close the guarantee

Remove `loaded-packs.ts`. Extend `tests/packs/two-registries.spec.ts` to loaded packs and fix its opening
comment. Add whatever module now owns the list to `tests/packs/registry-state.spec.ts`'s coverage if it
is not already there. Update `packages/abuddy-host/CLAUDE.md` (the `./packs/runtime` row, the bus
composition paragraph naming `loaded-packs.ts` as the one runtime module the bus imports) and
`src/packs/runtime/CLAUDE.md`.

**Done when:** the file is gone, `git grep getLoadedPacks` outside `dist/` is empty, and the full chain
passes.
**Mutation:** registering a pack in one registry leaves the other's `externalPacks()` empty — the new
assertion fails today and must pass after.

## Deferred

- **The bus's one runtime import.** `bus/app-bus.ts` reads `getPacksWithClientLoadedFrontends` from
  `packs/runtime/loaded-packs.ts`, which `tests/boundaries.spec.ts` allows as the single exception to
  "the bus is clear of `packs/runtime`". Phase 3 turns that into a registry read, which removes the
  exception — but whether `boundaries.spec.ts` should then forbid the import outright is a separate
  call, and the spec's allowance can stay until someone wants it tightened.
- **`receivedEventTypes` asymmetry.** `LoadedPack` never carried it; `PackRegistration` does. Nothing
  reads it off a loaded pack, so the change doesn't touch it.

## Constraints

- `PackRegistration` is untouched (Decision 1). If a phase seems to need a field on it, the design is
  wrong — origin goes in the second argument.
- `tests/packs/registry-state.spec.ts` must keep passing at every phase: no new module-level state,
  including a "temporary" one during the migration.
- The five write sites must stay paired until Phase 3 removes the second write. A phase that writes one
  list and not the other reintroduces exactly the divergence this goal removes.
- `@abuddy/testing`'s harness creates a registry per test file; Phase 3 and 4 must be checked against
  `npm run test:external-pack`, not only the unit suites.
- No `@abuddy/sdk` export should need to change. If one does, `npm run api:update` and commit `etc/`.

## Outcome (2026-09-19)

Implemented in one session, on `AS/external-pack-authoring`. All four phases done, plus a Phase 0 the
survey turned up.

### Per phase

- **Phase 0 (unplanned) — `receivedEventTypes` was being dropped.** Measuring what the refactor would
  delete found the round trip had already lost a field. `PackRegistration.receivedEventTypes` was added
  after the unpack/repack copies were written, and neither was updated, so **every external pack's
  outgoing-event validation was silently off**: `ownedPluginIds` fell back to `features[].hasPlugin`, the
  map stored `null`, and the bus read that as "a pack too old to declare" and checked nothing. Built-in
  packs were unaffected — they take the direct `registerPack(registration)` path.
  `tests/packs/runtime/pack-event-declarations.spec.ts` fails without the fix.
- **Phase 1 — `PackOrigin` on the registry.** Second argument to `registerPack`, stored in an `origins`
  map with the same keys as `registrations`, dropped by `unregisterPack`. Reads: `packOrigin`,
  `builtInPacks`, `externalPacks`, `externalPackTargets`.
- **Phase 2 — the built-in readers.** Six production sites moved; `getBuiltInPackInfos`/`setBuiltInPackInfos`
  gone. Two registration paths needed the origin, not one: the dev-mode built runtime as well as the
  bundled loader.
- **Phase 3 — the external readers and the parameters.** `startPacks(registry)`. `runPackMigrations` and
  `seedPackData` now name what they need (`PackMigrationTarget`, `PackSeedTarget`) rather than taking a
  whole `LoadedPack`, which left their 21 test call sites untouched. `packs-system`'s list scan became
  `registry.packOrigin(id)`. `getLoadedPackEntries` and `getPacksWithClientLoadedFrontends` moved to
  `packs/pack-layout.ts`, beside `LoadedPackEntry` and `packFrontendFiles`, and take the registry.
- **Phase 4 — deletion.** `loaded-packs.ts` is gone; `LoadedPack` lives in `loader.ts`, which produces it.
  `two-registries.spec.ts` covers loaded packs and its opening comment says what it now checks.

### Conventional choices

- `refreshBuiltInPackInfo(registry, packId)` still mutates the origin in place, as it mutated the list
  entry before. Changing that is a separate concern from deleting the duplicate list.
- `PackOrigin.manifest` is optional: a built-in pack has none, and a test may register without one.
  `externalPackTargets()` filters on it rather than asserting.

### Corrections to the Decisions

- **Decision 3 said the module goes, not moves — `LoadedPack` still had to live somewhere.** It went to
  `loader.ts`, the module that builds it. No behaviour rides on it; it is the loader's intermediate value.
- **The Deferred item resolved itself.** `boundaries.spec.ts` allowed the bus one import from
  `packs/runtime`. The bus now reads `packs/pack-layout.ts`, so the exception had no subject and was
  removed; a mutation re-adding a loader import to the bus fails the guard.

### Corrections found after the fact

- **Phase 1 leaked an origin on a refused registration.** `registerPack` writes `registrations` and
  `origins` before the try that registers a pack's extensions, and the catch deleted only the first — so a
  pack refused for a collision stayed listed as one the app had loaded, and the next boot would have
  migrated and seeded it. Caught by auditing the three parallel lists in this module, not by a test, which
  is the point of the first open item below.

### Phase 5 (follow-up, same session) — the class, not the instances

Both open items were closed, and auditing them found a third bug.

- **`LoadedPack` is `{ registration, origin }`.** The unpack/repack round trip is gone: the registration
  the pack's bundle exports is passed to the registry as it is, with its systems completed once (bus id,
  designation, and the manifest's incoming events) instead of array → Map → array. Two hand-written
  13-field lists deleted. The external-pack adjustments (`earlySystem`, `seedManifest`, `partitionPolicy`)
  now take their copies before deleting, so nothing borrowed from the pack module is mutated.
- **`registerPack` has one `contributions` table** in place of three hand-maintained lists. Each entry
  records its undo as it works — not returned at the end, because an entry can throw partway through its
  own items, which is how the seed-hook rollback was already being handled specially. `unregisterPack`
  runs the same undos, so what comes out is exactly what went in.
- **Found while auditing: a type two packs contribute facets of was dropped when either left.**
  `createDefinitionStore.unregister(type)` deleted the key outright, and merging facets across packs is
  a supported, documented case. Reload is a teardown and a registration, so an external pack reloading
  took the built-in pack's facet of any shared step with it until restart. The same shape was in the
  frontend's app-extension slots and DSL types. All three now go through `createOwnedStore`, which keeps
  each contribution with its pack and re-folds the rest.

### Open items

None from this goal. The general lesson is in `abuddy-host/CLAUDE.md`: a contribution keyed by anything
other than the pack id belongs in `createOwnedStore`, and a removal path that re-reads the registration
rather than undoing what the registration did is the shape to look for.

### Final verification

`npm run typecheck` ✅ · `npm run test:unit` ✅ (8/8 suites) · `npm run build` ✅ · `npm test` ✅ (13) ·
`npm run test:external-pack` ✅ (23 + 8 + 1). Mutations checked: origin ignored on register, origin kept on
unregister, origins shared at module scope (fails both `two-registries` and `registry-state`), bus
importing the loader, and `receivedEventTypes` dropped.
