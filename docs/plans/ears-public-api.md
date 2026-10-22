# EARS's API says what it does

**Status:** proposed, not started. Source read at `ff45e4ff7` (2026-10-22); call-site counts are text
searches on that tree, outside `packages/apack-ears`, and the typecheck is the exact count once a signature
moves.
**Scope:** the public API of `@apackdev/ears`: the engine, the write builder, the query builder's entry
points and semantics, and the typed facade. Persistence durability, query performance and a disk-resident
engine are outside it (see [What this is not](#what-this-is-not)).

## Why

EARS is the most reusable thing in this tree, and its API is the part a newcomer can't use without reading
the source. Every quirk below is either a name that promises something the code doesn't do, or one
argument that means two things depending on state the caller can't see. Inside this repo the typed facade
and the people who wrote it absorb that; a pack author doesn't have either, and nor would anyone installing
the package from npm.

Four rules decide every change below:

1. **A name promises its semantics.** `tx` promises atomicity, `where` promises a predicate, `put` with a
   flag promises nothing at all.
2. **One argument, one meaning.** A string is a type or an id because of where it's passed, never because
   of what the engine happens to have registered.
3. **The engine you hold is the engine you use.** `@apackdev/ears` has no ambient state; "the app's engine"
   is a concept one layer up.
4. **A name the engine cannot account for is an error.** Not an empty result, and never a write.

No backward compatibility: every caller, test, fixture, template and doc moves in the same change, per the
root CLAUDE.md.

## The changes

Ordered by how much damage the current behaviour can do, not by implementation order
([Phases](#phases) has that).

### 1. `tx` becomes a builder, and a transaction becomes real

**Today.** Every builder method writes memory and calls the persistence sink immediately
(`transaction.ts`, `self.put` onward). There is no commit and no rollback, so a chain that throws partway
(`safeLink`'s cycle check, `link`'s self-loop check, a caller's own throw between two builders) leaves
everything before the throw in memory and, a microtask later, on disk.

**Change.**

- `engine.transact(fn)` runs `fn` as one unit. Inside it, memory still mutates immediately, so `fn` reads
  its own writes synchronously, and every mutation also appends its inverse to a journal. If `fn` returns,
  the journal is dropped and the sink receives the unit's calls together; if it throws, the journal is
  replayed in reverse, the sink receives nothing, and the error is rethrown.
- The sink gets the unit as a unit: `PersistenceSink` gains `onCommit()` (or the engine forwards the
  buffered calls inside one flush). The LMDB adapter already coalesces into one `transactionSync()` per
  flush (`lmdb/adapter.ts`); a unit must reach one flush whole rather than relying on the microtask lining
  up.
- Nested `transact` joins the outer unit. `transact` is synchronous; an `async fn` is refused (a returned
  promise throws), because an `await` would split the unit silently.
- Outside `transact`, each builder call is its own unit, which is what happens today, now stated rather
  than implied.
- The journal exists only while a unit is open, so code outside `transact` pays nothing. The benchmark
  (`npm run bench -w @apackdev/ears`, +10% median tolerance) covers both paths, with a new case for a
  1,000-write unit.

The builder stops being called `tx` (see 2). The word "transaction" belongs to `transact` alone.

### 2. One argument, one meaning

**Today.** `tx(typeOrId, useProvidedId)` and `qx(start)` decide what a string is by asking
`isEntityType` at runtime (`transaction.ts`, `transaction()`; `query.ts`, `resolveStart`):

- `tx('Memo')` on an engine without that type writes attributes to an entity whose id is `"Memo"`.
- `qx('Memo')` returns nothing instead of failing.
- `qx(['Note', 'Task'])` is a list of types only if *every* item is a registered type; one unregistered
  name turns the whole list into ids.
- `tx(id, true)` is a boolean meaning "this id is new" (44 call sites).
- `qx()` with no argument means every entity, relations included (24 call sites).

**Change.** Each meaning gets its own entry point, and each refuses what it can't account for:

| Today | After | An unaccountable argument |
|---|---|---|
| `tx(type)` | `create(type)` | an unregistered type throws `UNKNOWN_ENTITY_TYPE` |
| `tx(id, true)` | `create(type, { id })` | as above; an id already in use throws |
| `tx(id)` | `write(id)` | an id not in the engine throws `NO_SUCH_ENTITY` |
| `qx(type)`, `qx([types])` | `qx(type)`, `qx([types])` | any unregistered type throws |
| `qx(id)`, `qx([ids])` | `qx.ids(idOrIds)` | absent ids are dropped (a query over ids is a filter) |
| `qx()` | `qx.all()` | — excludes `Relation`, which `findRelations` serves |

`write` throwing for an absent id is the one that will find bugs: today `tx(staleId).put(...)` resurrects
a deleted entity as an attribute-only orphan with no type in the index.

The typed facade already gives ids and names different types (`TypedTx`'s two overloads in `typed.ts`), so
splitting the functions makes the compiler list every typed call site. Only `untyped*` calls with a
`string` argument need reading by hand.

This makes [Part 1 of `undeclared-entity-names.md`](undeclared-entity-names.md#part-1--ears-refuses-a-name-it-cannot-account-for)
the engine's default behaviour; that plan's Parts 2–3 (the console's schema) are unaffected.

### 3. The type is stored, not parsed from the id

**Today.** An entity's type is the substring of its id before the first `-`, computed in two places:
`entityTypeOf` (`attribute-storage.ts`), which keys the entity index, and `entTypeOf` in
`lmdb/adapter.ts`. A type name containing `-` corrupts both and nothing refuses one; an id that doesn't
start with `<Type>-` can't exist. The LMDB `entities` row already records `type` (written on create, and
overwritten when it differs from the prefix), but hydration (`lmdb/hydrate.ts`) never reads that table: it
rebuilds the index from attribute keys, so in memory an entity exists exactly when it has an attribute.

There are also two copies of the type in memory: the index and the `entityType` attribute that `create`
stamps from the id (`transaction.ts`), whose comment records the bug that the two disagreeing caused.
`createdAt` is the same pattern, an attribute stamped beside a `createdAt` the entities row also holds.

**Change.**

- Storage holds `typeOf: Map<EntityId, Entity>`, set by `create` and by hydration, and the index is keyed
  from it. `entityTypeOf` and `entTypeOf` are deleted; nothing parses an id.
- Hydration reads the `entities` table first, so an entity exists because it was created, not because it
  has a value.
- `entityType` and `createdAt` become engine-owned metadata: present on every row a query returns
  (`BaseEntity` still declares both, so the typed contract doesn't move) and refused as attribute names by
  `set`/`add`/`delete` (see 5). They stop being stored as attributes. Text search finds ~50 readers of
  `'entityType'` and ~29 of `'createdAt'` outside the engine; most read rows and need no change, and
  `orderBy('createdAt')` keeps working because the query builder reads metadata the same way.
- Generated ids keep the readable `<Type>-<suffix>` shape, because it helps a human reading a dump; no code
  reads it. A caller-chosen id (`create(type, { id })`) can be any non-empty string.
- `EARS.EntityId` is a `${string}-${string}` template today (`entities.ts`). Loosening it is a change to
  the change-controlled typed contract: follow `packages/apack-sdk/TYPED-EARS.md`'s checklist, completions
  included, before touching it. If the checklist argues for keeping the template, caller-chosen ids keep a
  dash and nothing else here changes.

**Stored data.** Before writing any code, check a copy of a real data dir (`npm run db:inspect` on a copy):
does every entity that has attributes have an `entities` row whose `type` matches its prefix? If yes, the
LMDB format doesn't change and hydration simply starts reading a table it already has. If not, the gap is
closed by an explicit conversion run on a copy, as the root CLAUDE.md requires for stored developer data,
and `LMDB_FORMAT_VERSION` (`lmdb/envs.ts`) goes to 2 so that unconverted files are refused rather than
misread. Runtime code never falls back to the prefix.

### 4. The package holds no ambient engine

**Today.** Every free export (`untypedQx`, `untypedTx`, `repository`, `findRelations`, `grantRole`,
`spawn`, the graph walks, the `defineEars` facades) acts on a module-level engine set by `installEngine`
(`installed.ts`) and throws `NO_ENGINE_INSTALLED` without one. `createEarsEngine()` returns a working
instance, but most of the API ignores it, and two engines in one process means swapping the global (17
files call `installEngine`: 6 in host, 4 in the SDK, 4 in ears' own tests, 2 in the CLI, 1 in
publish-checks).

**Change.**

- `@apackdev/ears` exports the engine factory, its types and pure helpers; everything that reads or writes
  data is a member of `engine.query` or `engine.admin`. `installed.ts` leaves the package.
- `defineEars<Shapes, Names>()` takes the engine to bind: `defineEars<S, N>(() => query)`. A getter rather
  than a value, so a facade can be generated before the engine exists, which is the case for every pack.
- "The app's engine" moves to `@apackdev/sdk/runtime`, beside the bus and the services it already binds
  (bind resources, derive behaviour): `bindHost` holds it, `startTestRuntime` replaces it, and the generated
  `#generated/ears` passes the SDK's getter. Pack code doesn't change shape; it imports the same names from
  the same generated module.
- The `untyped*` twins stay as SDK exports over the bound engine, since that's where a pack reaches them.
  Host code that holds an engine calls its members directly.
- Tooling that installs a private engine today (the CLI's flow compiler, `exportFlowsToDSL`) passes it
  instead, which `exportFlowsToDSL(dir, { engine })` already does.

### 5. One builder vocabulary

**Today.** `transaction.ts`'s builder has 22 members with overlapping meanings:

- `put` and `update` call the same storage function (`updateAttr: put` in `attribute-storage.ts`), and
  `batchPut` and `updateBatch` are the same loop over them.
- `put(k, v, true)` is `add(k, v)`.
- `merge`, `drop` and `dropIf` take `v: unknown` while `put` and `add` are field-typed (`runtime.ts`,
  `TransactionBuilder`).
- Three ways to link: `link` appends a duplicate edge, `linkOne` replaces the edges of that kind to that
  target with one (`edge-store.ts`), and `safeLink` adds cycle and symmetry options.
- Three ways to unlink (`unlink(relId)`, `unlinkIf(kind, target?)`, `unlinkWhere({ kind?, target? })`)
  and two ways to patch (`relPatch` by relation id, `patchLink` by kind and target).
- `ensure(role, scope?)` revokes the role from every entity in the engine when no scope is passed.
- `define` bundles attributes, links and roles (3 callers).
- `destroy(skipPersistence?)` is typed `never`, so code after it reads as unreachable, and its flag is an
  admin concern on the pack-facing face (2 callers pass it).
- Attribute names share a namespace with the engine's own kinds: `put('role', x)` writes a role and
  `put('relationDetails', x)` overwrites a relation's endpoints.

**Change.** Named after the root CLAUDE.md's naming rules (`set`/`delete` for keyed stores):

| Member | Replaces | Note |
|---|---|---|
| `set(k, v)` | `put`, `update` | |
| `setMany(record)` | `batchPut`, `updateBatch` | |
| `add(k, v)` | `add`, `put(k, v, true)` | |
| `merge(k, partial, index?)` | `merge` | field-typed |
| `delete(k)` | `drop(k)` | the whole attribute |
| `deleteAt(k, index)` | `drop(k, i)` | field-typed |
| `deleteValue(k, v)` | `dropIf` | field-typed |
| `link(kind, target, { info?, acyclicIn?, symmetric?, duplicate? })` | `link`, `linkOne`, `safeLink` | idempotent by default: replaces the edge of that kind to that target, as `linkOne` does. `duplicate: true` appends instead |
| `unlink(kind, target?)` | `unlinkIf`, `unlinkWhere` with a kind | |
| `unlinkAll()` | `unlinkWhere()` | |
| `retarget(kind, from, to, info?)` | `patchLink` | |
| `grant(role)`, `revoke(role)` | same | |
| `grantExclusive(role, among)` | `ensure` | `among` is required |
| `destroy()` | `destroy` | returns `void`; `skipPersistence` moves to `admin` |
| `id()` | same | |

The relation-id operations (`unlink(relId)`, `relPatch`) become `engine.query.removeRelation(relId)` and
`updateRelation(relId, patch)`, since they don't act on the builder's entity. `define` is deleted; its
callers write `setMany`, `link` and `grant`.

`set`, `add`, `merge` and the `delete*` family refuse the engine's own kinds (`role`, `relationDetails`)
and its metadata (`entityType`, `createdAt`), throwing `RESERVED_ATTRIBUTE`. Refusing costs no storage
format change; namespacing the keys would.

Whether duplicate edges are wanted anywhere decides `link`'s default: read the 11 `safeLink`, 7 `linkOne`
and every plain `link` caller before Phase 3, and record which (if any) rely on duplicates.

### 6. Query semantics that read as written

**Today.** `where(k)` with no value means "has this attribute", so `where(k, undefined)` can't ask for
absence; matching is `===`, so an object or array value never matches; `page()` cursors are base64 of an
offset (`query.ts`), so a write between pages skips or repeats rows.

**Change.**

- `has(k)` and `lacks(k)` for presence; `where(k, v)` requires `v` and refuses `undefined`.
- `where(k, predicate)` for anything `===` can't express, so object values have an answer.
- `page()` is deleted: text search finds no caller outside the engine. A cursor that survives writes needs
  a stable order key, and nobody has asked for one.
- The builder stays eager and synchronous. How filtering performs is
  [`ears-attribute-filtering.md`](ears-attribute-filtering.md)'s subject; its "no API change" premise holds
  for its own work, which can land before or after this.

## Phases

Each phase leaves the chain green and is one commit.

| Phase | What | Depends on | Done when |
|---|---|---|---|
| 0. Check the data | The stored-data check in 3, on a copy | — | The answer is recorded here, with its date and the data dir's shape |
| 1. Stored type | 3, without the attribute-name refusals | 0 | Nothing parses an id; hydration reads `entities`; `entityType`/`createdAt` are metadata; contract suite and bench pass |
| 2. `transact` | 1 | — | A throwing unit leaves memory and the LMDB files as they were (contract and `lmdb/` specs, each mutation-checked); a returning unit reaches one LMDB transaction; bench within tolerance with and without a unit open |
| 3. The reshape | 2, 5 and 6 in one migration of every call site | 1 | No `tx`, `put`, `update`, `batchPut`, `updateBatch`, `linkOne`, `safeLink`, `unlinkIf`, `unlinkWhere`, `relPatch`, `patchLink`, `ensure`, `define`, `page` in the tree; the reserved-name and unknown-name refusals each have a firing case |
| 4. No ambient engine | 4 | 3 | `@apackdev/ears` has no module-level state, and `tests/no-module-state.spec.ts` drops its one exception |

Phase 3 is one pass on purpose: entry points (2) and builder members (5) appear on the same lines (59 files
call `tx` today), and moving them in two passes touches every line twice. Phase 4 changes imports, not call
shapes, so it stays separate and reviewable.

Every phase that moves a public export runs `npm run api:update` (ears and SDK) and
`npm run facade:update -w @app/default-setup`, and reads the diff. Phase 1 changes written rows (the
`entityType`/`createdAt` attributes stop being stored), so `content-parity:update -w @app/default-setup`
re-records deliberately there and nowhere else.

## Decisions to settle before Phase 3

- **The builder names.** `create(type)` and `write(id)` are proposed. `write` reads well in a chain
  (`write(id).set('title', t)`) and doesn't collide with `updateEntity`; `edit` is the alternative.
- **`link`'s default** (see 5), settled by reading its callers.
- **`EntityId`'s shape** (see 3), settled by TYPED-EARS.md's checklist.

## What this is not

- **Durable persistence.** [`ears-persistence-and-history.md`](ears-persistence-and-history.md) owns flush
  barriers, failed-save state and cross-environment behaviour. `transact` gives it the logical unit it asks
  for; it doesn't make writes durable.
- **The console's transactions.** [`goal-console-transactions.md`](../goals/goal-console-transactions.md)
  becomes a caller: console code runs inside `transact`, and its Phase 1 is this plan's Phase 2.
- **A disk-resident engine** ([`goal-lmdb-only.md`](../goals/goal-lmdb-only.md)). Everything here is
  storage-agnostic; doing this first gives that goal a smaller API to reimplement.
- **Reactivity, a query language, or publishing EARS on its own.** A standalone package also needs a README
  that doesn't assume AgentBuddy and a name that isn't already a well-known requirements-syntax acronym.
  Both are easier once the API says what it does, and neither is in scope here.
