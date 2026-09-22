> **Done** (on `AS/designations-and-addressing`, `6eb47edc7`, `b753a99dc`, `7af49d2c7`, `59e610eee` and the
> reviews that followed). The text below is the plan as written; the Outcome records where the implementation
> differed. For the current model, see the root `CLAUDE.md` (Event-driven actor system) and
> `packages/abuddy-host/CLAUDE.md` (Packs).

> **Written in session** `e6511a0f-3632-4fff-9504-43d61f8c4bba` (Claude Code, 2026-09-20). Resume it with `claude -r e6511a0f-3632-4fff-9504-43d61f8c4bba`.

```
# Goal: one home for a designation, and one way to address a feature

Implement docs/goals/goal-designations-and-addressing.md on AS/external-pack-authoring, at or after
89133cf71 — the base its Background was surveyed at.
Before Phase 1, confirm the base: `designation?: string` exists on PackSystemDef
(packages/abuddy-sdk/src/framework/pack-registration.ts) and on Plugin
(packages/abuddy-sdk/src/fe/plugin.ts), and `designationsOf` in
packages/abuddy-host/src/packs/pack-registration.ts still reads both `systems` and `features`. If it
doesn't, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `designation` exists on neither PackSystemDef nor Plugin, and `git grep "designation"` outside dist/
  and __generated__/ finds it only on manifest features, PackFeatureDef, PackFERegistration.designations
  and the role lookups.
- No generated pack entry grafts a designation onto a system def or a plugin module.
- Both registrations carry their pack's `id`: `registerPackFE` takes one argument, `BUILT_IN_OWNER` is
  gone, and a built-in pack's frontend contributions unregister like any other pack's.
- A second pack declaring a plugin id another pack registered is refused at registration, by name.
- Every pack plugin is addressed `<packId>.<featureId>`; bare ids are the host's reserved namespace.
- npm run typecheck, npm run test:unit, npm run build, npm test, npm run test:external-pack pass.
- npm run api:update (SDK contract changed) and npm run compile (default-setup regenerated), with etc/
  and the regenerated entries committed.
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
- create a new migration version file: the settings move goes in the latest unreleased target
  (packages/default-setup/src/migrations/0.3.15.ts), per migrations/CLAUDE.md.
- keep `designation` on PackSystemDef or Plugin "for compatibility". Both are deleted.
```

## Background

Surveyed at `89133cf71` on `AS/external-pack-authoring`, and re-checked against `ef358680f`: see
**Since the survey** at the end of this section before acting on a line reference.

### Three ways to name a feature, and one missing layer

| | the name you write | resolved by | identity at runtime | namespaced |
|---|---|---|---|---|
| **System** | `memos`, `default-setup/threads` | generated `systemIds` map (`__generated__/events.ts`) | `e2e-fixture.memos` external, `threads` built-in | name yes, id inconsistently |
| **Plugin** | `memos` | nothing | `memos` | no |
| **Designation** | a role | the registry | a system id (backend) / a plugin id (frontend) | n/a |

A system has a **name** layer over its **id**, so `sendToSystem('default-setup/threads')` works whatever
the id is. A plugin has no name layer: the bare feature id *is* the global identity, for every pack.
Built-in system ids being bare (`generate-entries.ts:900`, `manifest.builtIn ? f.id : …`, duplicated at
`:394`) is incidental, not principled — no comment gives a reason — and it is why the asymmetry reads as
a hidden fallback to default-setup.

### `features[].designation` reaches the registry three times

One manifest field, three encodings:

1. `features[].designation` — static in the generated `features` array. Every designated feature.
2. `systems[].designation` — a runtime `new Map([…])` that codegen emits into **every pack's**
   `pack-entry.ts` (`generate-entries.ts:629-632`). Only designated features that have a system.
3. For external packs, again in `loader.ts:287` from the manifest. Same subset.

`designationsOf` (`pack-registration.ts:44-51`) reads (1) and (2) and reconciles them with
`Object.fromEntries`, a silent last-wins merge whose only job is to undo a duplication that shouldn't
exist. **`pack-registration.ts:48` is the only reader of `PackSystemDef.designation` in the repo** — host,
SDK, API and renderer all checked. Since codegen derives (2) from the same list as (1), they can only ever
agree, and the branch is dead weight.

The two `s.designation!` assertions and the `systemId()` helper follow from it; that helper duplicates
`resolveSystemAddress`'s bare-or-prefixed find (`pack-registration.ts:569`), differing only in its
fallback.

### The frontend has the same duplication, as a hidden binding

`Plugin.designation` is a **public, optional, author-settable field** of `@abuddy/sdk/fe`
(`fe/plugin.ts:11-12`). Codegen spreads over it on every build:

```js
const notes = { ...notes_module, designation: 'notes' } as typeof notes_module;
```

— with the manifest's value, or with `undefined` when the manifest has none. So an author who sets
`designation: 'brain'` in their plugin module and omits it from `abuddy.json` gets `undefined`, silently;
`getDesignated('brain')` then throws *"No feature designated for brain"* at runtime, naming neither the
manifest nor the overwrite. The type's doc comment admits the binding — on hover, in a field the API
invites you to fill.

Its only reader is `fe/pack-store.ts:90`. `PackFERegistration` carries no `features`, only `plugins[]`,
which is *why* the role was grafted onto the author's object.

### The frontend registration doesn't say which pack it is

`PackRegistration` carries `id`; `PackFERegistration` does not. The pack id arrives as an **optional second
argument** instead:

```ts
registerPackFE(registration: PackFERegistration, packId?: string): void   // fe/pack-store.ts:26
```

The renderer passes it for external packs (`packs/pack-loader.ts:97`) and omits it for built-in ones
(`main.ts:100`). Three things follow, all the same root cause — a contribution the store can't attribute to
a pack:

- `packExtensions.set(packId, …)` is guarded by `if (packId)` (`:145`), so a built-in pack's frontend
  contributions are never recorded, and `unregisterPackFE` returns `[]` for it (`:152-154`). They cannot be
  removed.
- The store needed a `BUILT_IN_OWNER = '<built-in>'` sentinel (`:43,110`) to give those contributions an
  owner for `createOwnedStore`.
- ~~`defaultPlugin` is taken from whichever registration arrives first and is **never cleared on
  teardown**, so the pack that supplied it can unregister and leave the app pointing at a plugin that is
  no longer registered.~~ **Fixed since the survey** (`pack-store.ts:84`): the registration that sets it
  records an undo that clears it. The root cause this section is about is unchanged for the other two.

This is the mirror of the designation problem: a fact about the pack with no home on the object, so it gets
carried alongside — and where the designation was grafted *onto* the author's plugin, the pack id is simply
missing and every caller has to remember it.

### What a plugin-id collision does today

Two packs each with a feature named `notes`:

- `fe/pack-store.ts:68` — the second plugin is dropped with a `console.warn` to the renderer console. The
  pack installs "successfully" and has no UI.
- `getPluginEventValidationMap` — the first owner keeps the id, so the second pack's `receivedEventTypes`
  never register and its sends are validated against the first pack's contract.
- `sendToPlugin('notes')`, `emit('notes')` and manifest `sendsTo: ['notes']` all reach the first pack.
- Nothing refuses it. `registerPack` throws on duplicate services, commands, repositories and
  designations; plugin ids are the one contribution deliberately left to shadow (`:493-495`).

The id is **persisted user data**: `settings.plugins.<pluginId>`, `_meta.visibility.<pluginId>` and
`_meta.lastActivePlugin` (`features/settings/be/system.ts:70,115`). Changing the scheme is a migration.
System ids appear in no entity shape and are free to change.

### How much pack code addresses by role today

In `packages/default-setup/src`: 105 literal `sendToSystem`, 70 literal `sendToPlugin`/`emit`, 53
`services.emitter.sendToPlugin` — and **0** `getDesignated`. Designations are declared on 5 features and
consumed only by the renderer (7 sites) and by `sendToBrainSystem`, which is
`sendIncoming({ …, systemId: getDesignated('brain') })`: a hardcoded single-role helper, and the only
role-addressed send that exists.

Only 5 of ~12 features have a designation, so most sends address a feature that plays no role.
Role-addressing cannot replace plugin addressing; it covers the roles, and the plugin name layer covers
the rest. That is why these are one goal.

### Sizing

- 16 tests assert a bare built-in system id.
- 85 literal built-in plugin-id sends in default-setup (its own plugins — the short name survives the
  name map) and 4 in the renderer (host addressing a pack's plugin — these need the qualified name or a
  role).
- `settings.plugins` defaults: one file (`features/settings/settings.ts`).

### Since the survey

Re-checked at `ef358680f`. `fe/pack-store.ts` and `packs/pack-registration.ts` were both reworked after
this was written (recorded undos for a pack's contributions, then one undo log shared by the backend and
frontend registries), so the frontend line references above have moved and are corrected in place. Two
findings change the plan rather than its citations:

- **The `defaultPlugin` teardown bug is fixed.** Phase 4's third bullet and its "Done when" are satisfied
  already; what remains of that phase is recording the pack id, not clearing the default.
- **`registerPackFE` now throws on a pack registering twice**, which it did not at survey time. A phase
  that changes its signature has that guard to keep.

Everything else held: `designationsOf` (`pack-registration.ts:44-51`) is unchanged and
`pack-registration.ts:48` is still the only reader of `PackSystemDef.designation`; `loader.ts:287` still
writes it; `main.ts:100` still omits the pack id for built-in packs.

## Decisions

Final.

1. **`features[].designation` is the only backend source.** `PackSystemDef.designation` is deleted, the
   codegen that fills it is deleted, and `loader.ts:287`'s copy is deleted. `PackFeatureDef.designation`
   stays: it is the manifest's own shape and the Packs UI renders it (`PackInfo.features` →
   `packs/canvas/PackDetail.vue:115`).
2. **`PackFERegistration.designations: Record<role, pluginId>` is the only frontend source**, emitted by
   codegen from the manifest. `Plugin.designation` is deleted and the `{ ...module, designation }` spread
   goes with it, so an author's plugin module is passed through untouched. Deleting the field is the fix;
   documenting the binding is not.
3. **The two registrations stay differently shaped, on purpose.** `PackRegistration` already carries
   `features[]` for settings defaults, `hasPlugin` and the Packs UI, and a designation is a property of a
   feature there. `PackFERegistration` carries no features, so the minimal honest fact is the map, already
   resolved to plugin ids. Adding a `features` array to the frontend registration purely for shape-matching
   would carry data the frontend never reads.
4. **`PackFERegistration` identifies itself**, with an `id` like `PackRegistration`. `registerPackFE`
   becomes single-argument, the `BUILT_IN_OWNER` sentinel goes, a built-in pack's frontend contributions are
   recorded and removable like any other pack's. (Clearing `defaultPlugin` on teardown was part of this
   decision and has since landed on its own.) This is what makes the two types parallel in the way that matters — each self-identifying
   — and is why they keep their current names: `PackRegistration` is the pack plus what it contributes to
   the backend, not "the backend half", since `id`, `boot`, `migrations`, `ears` and `repositories` have no
   frontend counterpart and never will. A rename to `PackBERegistration` would mislabel them.
5. **A designation is a role, not a name.** It need not equal the feature id, and may become many-to-one.
   `build/validate.ts:41` is right; the root `CLAUDE.md:165`, `abuddy-sdk/CLAUDE.md:57` (which claims
   `validateFeatures` checks `designation === id` — it does not) and the CLI's `--designation` rejection
   (`abuddy-cli/src/commands/add/feature.ts:173`) are the stale spec. The CLI's is live code refusing a
   legitimate manifest.
6. **`getDesignated(role)` returns the id that addresses the feature in this process**: its system on the
   backend, its own feature id when it has none (a plugin-only feature), its plugin on the frontend. Stated
   once, in `@abuddy/sdk/designations`, and reflected in `abuddy-host/CLAUDE.md`.
7. **One `systemIdFor(systemIds, packId, featureId)` resolver**, shared by `designationsOf` and
   `resolveSystemAddress`. `designationsOf` uses `flatMap`, so the `!` assertions go.
8. **A duplicate plugin id is refused at registration**, by name, like services, commands, repositories and
   designations. A silent drop into the renderer console is not an install result.
9. **Every pack plugin is addressed `<packId>.<featureId>`, built-in packs included**, with a generated
   name map so pack code writes the short name for its own plugins and `<pack>/<feature>` for a
   dependency's — the same ergonomics as `sendToSystem`, through the mechanism `defineEvents` already has.
   **Bare ids are the host's reserved namespace** (`HOST_PLUGIN_IDS`, today `application`), which Decision 8
   makes safe: a pack feature that would take one is refused.
10. **Built-in system ids are namespaced too** (`default-setup.threads`), so `<packId>.<featureId>` is the
   one identity rule and the name layer is the only thing anyone types. Otherwise Phase 5 moves the
   inconsistency rather than removing it: plugins namespaced for all packs, systems only for external ones.
11. **The settings migration targets 0.3.15**, the latest unreleased version, per `migrations/CLAUDE.md`.
    No new version file.

12. **A role resolves to one feature, and the signature stays singular.** `designation(role)` keeps
    returning one id, `registerPack`'s cross-pack designation throw and `validateFeatures`'s in-pack
    duplicate error both stay, and a role-addressed send takes the single resolved id.

    The five roles are read singularly everywhere and by their nature, not by accident of the current
    shape: `system.get(getDesignated('brain'))` is one actor, `navigateToPlugin(getDesignated('settings'),
    …)` is one destination, and `plugin.id === getDesignated('settings')` is an identity comparison. A list
    has no meaning at any of them — there is no answer to "navigate to which settings plugin".

    The fan-out that does exist sits below the role and belongs there: `sendToBrainSystem` fires "at every
    running flow, through the designated brain system" — one system, broadcasting internally. A many-to-one
    role would want the same shape, so widening stays additive without being built for now.

13. **Phases 5 and 6 land in this goal.** They are the reason for Phases 1–4, not a follow-on.

    Phase 4 refuses a duplicate plugin id; Phase 5's "Done when" requires two packs declaring the same
    feature id to both register with working plugins. Landing 1–4 alone therefore ships a restriction that
    Phase 5 exists to lift, and refuses a pack ecosystem case that today only shadows silently — worse for
    a pack author than either end state. Splitting was considered for risk (5 and 6 carry the only user
    data migration and the only wide caller churn) and rejected: the contract is one contract, and the risk
    is handled by committing phase by phase, which this repo's goal-doc convention already requires.

## Phases

### Phase 1 — one source for a designation on the backend

Delete `designation` from `PackSystemDef`. Delete the `designatedFeatures` / `new Map([…])` /
`.map(s => …)` wrapper from `generate-entries.ts:629-632`, so a generated entry reads plain
`systems: toPackSystemDefs([…])`. Delete `designation: feature?.designation` from `loader.ts:287`.
`designationsOf` reads `features` only. Five test files set a system designation; move each to `features`.

**Done when:** `PackSystemDef` has no `designation`; `npm run compile` and the fixture builds produce
entries without the wrapper; `npm run api:update` committed; unit suites pass.
**Mutation:** a pack whose designated feature has a system still resolves its role — break
`designationsOf`'s feature branch and `registered-lookups.spec.ts` fails.

### Phase 2 — one source on the frontend, and the registration identifies itself

Two halves of one change to `PackFERegistration`, landing together because they touch the same type,
the same codegen function and the same store.

*The designation's source.* Add `PackFERegistration.designations`, emitted from the manifest in
`generateFrontendEntry`, and drop the `{ ...module, designation }` spread so plugin modules import
unchanged. Delete `Plugin.designation`. `fe/pack-store.ts` builds its roles from
`registration.designations` instead of `plugins[].designation`.

*The pack's identity.* Add `PackFERegistration.id`, emitted by the same codegen. `registerPackFE` drops
its optional `packId` parameter and reads `registration.id`; `main.ts:100` and `packs/pack-loader.ts:97`
both stop passing one, and the guard it added against a pack registering twice moves to the new shape.
`packExtensions.set` loses its `if (packId)` guard, so a built-in pack's frontend contributions are
recorded and removable like any other's. Delete the `BUILT_IN_OWNER` sentinel. `defaultPlugin` already
records the undo that clears it, so nothing is owed there beyond keeping it working.

**Done when:** `Plugin` has no `designation` and no generated frontend entry spreads over a plugin module;
`registerPackFE` takes one argument and `git grep BUILT_IN_OWNER` is empty; `unregisterPackFE` returns a
built-in pack's plugins rather than `[]`; `fe-registered-lookups.spec.ts` and
`pack-store-designations.spec.ts` pass against the new sources; `npm run api:update` committed.
**Mutation, three:** a designation in the manifest but absent from `designations` leaves the role
unresolved; a pack registered and then unregistered leaves its plugins behind (the `if (packId)` guard
restored); the undo that clears `defaultPlugin` is dropped and the default still points at the plugin of
a pack that has left. Each must fail a test.

### Phase 3 — one resolver, and the spec corrected

`systemIdFor` shared by `designationsOf` and `resolveSystemAddress`. Correct the root `CLAUDE.md:165`,
`abuddy-sdk/CLAUDE.md:57`, and remove the CLI's `--designation` ≠ name rejection with its usage line.
State Decision 6's rule in `@abuddy/sdk/designations` and `abuddy-host/CLAUDE.md`.

**Done when:** one bare-or-prefixed find in the file; `abuddy add feature --designation` accepts a role
that differs from the feature name, covered by a CLI spec; no doc claims a designation must equal the
feature id.
**Mutation:** `abuddy add feature notes --designation inbox` must succeed and write `designation: "inbox"`.

### Phase 4 — a duplicate plugin id is refused

`registerPack` throws `Plugin collision: id "<id>" — pack "<a>" vs "<b>"`, registering none of the pack,
alongside the existing collision checks. Drop `fe/pack-store.ts:57`'s silent-drop path, or reduce it to a
guard that can no longer fire. Remove the `:474` comment that documents shadowing as intended.

**Done when:** a second pack declaring a registered plugin id is refused by name, and the rollback leaves
the first pack whole (`registered-lookups.spec.ts`).
**Mutation:** remove the check and the new spec fails.

### Phase 5 — plugin identity is namespaced, with a name map

Plugin identity becomes `<packId>.<featureId>` for every pack. Codegen emits a plugin name map beside
`systemIds` so `sendToPlugin`/`emit`/`sendsTo` take the short name for a pack's own plugins and
`<pack>/<feature>` for a dependency's. `HOST_PLUGIN_IDS` stays bare and reserved. The renderer's 4
literal sends take the qualified name or a role. A `0.3.15` migration moves `settings.plugins.<id>`,
`_meta.visibility.<id>` and `_meta.lastActivePlugin`, idempotently.

**Done when:** two fixture packs declaring the same feature id both register with working plugins and
distinct addresses; the migration is idempotent across a development boot; `npm run test:external-pack`
passes.
**Mutation:** the migration skipped leaves a user's pinned plugin and last-active plugin pointing at
nothing — assert both survive, and check the assertion fails without the migration.

### Phase 6 — built-in system ids are namespaced

`generate-entries.ts:899` and `runningSystemId` at `:394` drop the `builtIn` special case, through one
shared helper. The 16 tests asserting a bare built-in system id move to the qualified id. Pack code is
unaffected: own systems keep the short **name**.

**Done when:** no `builtIn ? … : …` id rule remains; `busId` values are `<packId>.<featureId>` for every
pack; the full chain passes.
**Mutation:** a system id built by hand as a bare feature id no longer resolves — `resolveSystemAddress`'s
spec fails.

## Outcome

The goal holds: `designation` is a feature's, declared once in `abuddy.json` and carried on `PackFeature`, not grafted
onto a system def or a plugin module; `BUILT_IN_OWNER` is gone and `registerPackFE` takes one argument; and a role is
addressed through the designations rather than by a bare name.

Two things ended up different from the plan:

- **A feature is addressed `<packId>/<featureId>`, not `<packId>.<featureId>`.** The separator became a slash when the
  ref grew a grammar of its own (`resolveName`, `splitRef`, `FEATURE_ID_PATTERN` in `@abuddy/sdk/ids`), so that neither
  half can contain it and a ref splits one way.
- **Plugin id collisions are no longer refused at registration, because they can no longer happen.** The plan wanted
  registration to reject a second pack declaring a plugin id another had registered. Ownership became structural
  instead: every plugin runs under its pack's ref, pack ids are unique, and neither id may hold a `/`, so no pack can
  produce a ref in another's namespace and there is nothing left to refuse.

## Deferred

- **A role-addressed send** (`sendToRole(role, event)` on `@abuddy/sdk/events` and `services.emitter`,
  replacing `sendToBrainSystem`). It is what issue A asks for. Decision 12 settles its signature — one id
  in, no list — so what is left is the migration: 175 potential call sites and only 5 roles to aim at,
  which is worth its own change rather than a sweep inside this one.
- **Migrating existing sends to roles.** Follows the above. Most sends address a feature with no role, so
  this is a judgement call per call site, not a sweep.

## Constraints

- `PackFeatureDef.designation` is not touched (Decision 1). If a phase seems to need it gone, the design
  is wrong — it is the manifest's shape and the Packs UI reads it.
- Phase 2 changes `PackFERegistration` twice over (a new `designations`, a new `id`) and `Plugin` once.
  All three are one `api:update`, in that phase's commit.
- Phases 1–4 must not change any persisted key. Only Phase 5 migrates user data, and only through
  `0.3.15`.
- `@abuddy/sdk` contract changes in Phases 1, 2 and 5 each need `npm run api:update` with `etc/` committed
  in the same commit; `npm run typecheck` fails until they are.
- Every phase regenerating pack entries runs `npm run compile` for default-setup and rebuilds the fixtures,
  and commits the regenerated files.
- `tests/fixtures` gains a second pack sharing a feature id with the first for Phases 4 and 5; it must not
  break `npm run test:external-pack` for the existing fixtures.
