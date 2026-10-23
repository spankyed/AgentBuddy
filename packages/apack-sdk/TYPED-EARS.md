# Typed EARS: type contract and change control

The typed EARS helpers are the main way pack authors touch data, so their types are a product surface, not an implementation detail. Their behavior was specified deliberately and is pinned by tests. **Don't change them to make a single call site compile.**

## Files covered

The engine's types moved to `@apackdev/ears` (`packages/apack-ears`); the SDK keeps the names and shapes it adds, and codegen the pack's.


- `packages/apack-ears/src/entities.ts`: the core `EARS` namespace (`EARS.EntityId`), `BaseEntity`, `ShapeOf`, `EntityNameArg`
- `packages/apack-ears/src/runtime.ts`: `QueryBuilder`, `WriteBuilder`, `FieldValue`, `FieldValues`
- `packages/apack-ears/src/typed.ts`: `defineEars` and the `Typed*` helper signatures behind `#generated/ears` (the functions it returns act on the engine its getter returns, `boundEars` for a pack; `src/engine.ts`'s `Ears` is untyped)
- `packages/apack-sdk/src/types/entities.ts`: the SDK's `EARS`, aliasing the engine's types and adding the SDK's entity types and relation kinds
- `packages/apack-sdk/src/types/sdk-entities.ts`: `SdkEntityShapes` and the SDK-owned entity shapes (Relation and the flow model: Flow, Node, TNode, Action, Prompt). Preferences use the host settings contract, without a pack-owned `Settings` entity; the host's `AppState` isn't in any pack's `EntityName`
- `packages/apack-sdk/src/build/generate-entries.ts` (`generateEars`): the generated `PackShapes`, `EntityName` and `Node` override

## The contract

**No `any`.**
- Nothing pack-facing exposes `any`. `published-sdk-any.integration.spec.ts` in `@app/publish-checks` enforces it.
- An entity type without a declared shape reads as `BaseEntity & Record<string, unknown>`, so its values need narrowing.

**Shapes.**
- `ShapeOf` is deliberately non-distributive (see its comment).
- `PackShapes['Node']` is the pack's step node union: its own and its dependencies' `XNode extends NodeBase` types. It's `NodeBase` when no step defines one.

**Field parameters.**
- They're typed as `keyof ShapeOf<S, E> & string`, and picked rows as `Pick<ShapeOf<S, E>, K>`. This covers `where`, `pick`, `pickOne`, `linksPick`, `orderBy`, `distinct`, `groupBy`, `getAttr` and `updateEntity`. A list field's `where` also takes one of its elements, which the value index answers.
- This form is what gives editors field-name completions and makes a typo's error list the valid fields.
- For a union shape, such as `Node` rows, only the fields every member has are accepted.
- A query whose fields vary by member, or are only known at runtime, uses `untypedQuery` from `@apackdev/ears` on purpose. The brain trigger queries in default-setup are the example. (It's the same untyped `query` an engine has, `createEarsEngine(...).query`.)

**Entity names.**
- A literal entity name must be one the pack, its dependencies or the SDK declares (`EntityName`). A name typed `string` passes unchecked (`EntityNameArg`).
- The explicit-shape overloads (`findAll<T>(name)`) also accept a runtime name: supplying `T` leaves the
  name's `E` at its `string` default, so `findAll<Shape>('Tpyo')` compiles by design. Without a type
  argument the same call is checked.
- A generic helper constrains its name to `EntityName`, or opts out with `as string`.
- A name and an id go to different functions: `query(type)`/`create(type)`/`upsert(type, id)` take a name,
  `query.ids(id)`/`write(id)` an id. An id passed where a name is meant is a compile error (it is no declared
  name), and in the untyped twins too, whose name parameters are `TypeName<E>`: a dashed literal or an
  `EntityId`-typed value becomes `never`. A name typed `string` passes, and the runtime refuses it when it
  isn't a registered type.
- Overload order in `typed.ts` is part of the contract wherever a function still has more than one.

**Ids.**
- Typed queries return ids tagged with their entity type (`ids()`, `first()`, `pick`'s `id`, a row's `id`).
- A plain `EARS.EntityId` carries no tag and is accepted wherever a tagged id is, including `includes` and `Set.has`. Only an id tagged with a different entity type is rejected.
- Link ids use `NoInferType`, so a result passed straight into a generic function keeps its shape.
- **`query('user-note')` is a compile error**, now that no entry point takes a name *or* an id (Incidents
  below has why the type alone could not fix it).

**Writes.**
- `create`, `upsert` and `write` from `#generated/ears` check declared fields' values when they know the entity: started from a declared name or a tagged id.
- Undeclared fields are accepted, and a plain id leaves every write unchecked.
- So `set` and `add` take a field *name* of any string (`set<K extends string>`), and an undeclared one
  gets `unknown` for its value. This is deliberate — EARS stores attributes a shape need not declare —
  but it is inconsistent with `updateEntity`, which does check names against the shape. Writing through
  `updateEntity` gets completions and a typo's error; writing through `write().set()` does not.
- The engine's own attributes (`id`, `entityType`, `createdAt`, `role`, `relationDetails`) are refused by
  every attribute write at runtime, not by the type.

**Which `EARS` to import.**
- Pack code imports `EARS` from its `#generated/ears` by default.
- The SDK's `EARS` (`@apackdev/sdk`) is fine for `EntityId`, the SDK-owned constants and the shared EARS types (`AttrKind`, `RoleKind`, `Blueprint`…). That covers build facets and SDK-level code. Its `EntityId` is the same type the generated one aliases, and a pack's name (`EARS.Entity.Note`) doesn't exist on it, so a wrong import fails to compile.
- The one hazard is the SDK's `EARS.Entity` as a type. It's open (any string), so a value annotated with it passes the entity-name check unchecked, reads with the generic shape, and compiles with a typo. Use it only when an open name is intended, as in default-setup's create step (`entityTypeTarget`, any entity type a flow names); otherwise annotate with the generated `EARS.Entity` or `EntityName`, which are closed.

**Defaults.**
- `QueryBuilder<E = string, S = {}, N = string>` and `WriteBuilder<E = string, S = {}>` keep the untyped operations (`untypedQuery`, `untypedWrite`, … from `@apackdev/sdk/ears`, and an engine's own) unchecked.

**Compatibility.**
- `@apackdev/ears` and `@apackdev/sdk` support TypeScript 5.7 and later (`packages/typescript-floor`). These types keep their `NoInferType` workaround from when the floor was 5.3.

## Before changing any of these types

0. **Check Incidents first.** Two of the things most often reported as bugs here — `query('user-note')`
   compiling, and `findAll<T>('Tpyo')` skipping the name check — have been investigated and measured. The
   first has two failed fix attempts recorded with their blast radius; the second is the contract. Do not
   re-derive them.
1. **Treat it as a design change.** Get agreement on the new behavior first. If a call site doesn't fit the contract, change the call site instead:
   - an explicit shape
   - an `EntityName` constraint
   - a runtime name typed `string`
   - the untyped twins (`untypedQuery`, `untypedCreate`, `untypedUpsert`, `untypedWrite`)
2. **Run the type tests** that pin the contract:
   - default-setup: `tests/typed-query-builder.spec.ts`, `branded-entity-id.spec.ts`, `entity-shape-registry.spec.ts`, `sdk-type-safety.spec.ts`, and `npm run typecheck:pack`
   - `@apackdev/cli`: `packages/apack-cli/tests/build/facade-typing.integration.spec.ts` (a real dependent pack under bundler and node16, against both the workspace source and the packed `@apackdev/ears` and `@apackdev/sdk`) and `packages/publish-checks/tests/published-sdk-any.integration.spec.ts`
3. **Mutation-check every rule you touch.** Break it on purpose and confirm a test fails.
4. **Check editor completions and error messages.** `packages/apack-cli/tests/build/facade-typing.integration.spec.ts` in `@apackdev/cli` checks the positions below with the TypeScript language service, under both module resolutions and against the published package. Extend it when you add a field or name parameter, and still look at anything it doesn't cover.
   - Field positions should list the entity's fields: `query(EARS.Entity.X).pick(['|'])`, `.where('|')`, `.orderBy('|')` and `getAttr(id, '|')`.
   - Entity-name positions should list entity names: `query('|')`, `findAll('|')`, `createEntity('|')`, `.linksTo(kind, '|')`, `.ofType('|')`.
   - A typo (`where('titel')`) should produce an error that lists the valid fields.
   - Compare against the previous version with the TypeScript language service (`getCompletionsAtPosition`), not just by compiling.
5. **Update the API reports** (`npm run api:update` in `packages/apack-ears` and `packages/apack-sdk`) and review the `apack-ears/etc/index.api.md` and `apack-sdk/etc/types.api.md` diffs as part of the change.

## Incidents

- **Union field typing (2026-09-14).**
  - What happened: to make brain's trigger queries compile against the new `Node` union, the field parameters were rewritten as conditional and mapped types (`FieldArg`, `FieldsArg`, `PickedOf`). That added runtime field names and union-member fields to every field-keyed API.
  - Why tests missed it: everything compiled and every type test passed. But field completions disappeared from `pick`, `pickOne`, `linksPick`, `getAttr` and `findWithFields`, and typo errors became "not assignable to type 'never'".
  - Resolution: reverted, and the two queries use the untyped `untypedQuery` (`@apackdev/ears`). The completions test in `facade-typing.integration.spec.ts` now guards these positions.
- **`query('user-note')` compiled: the dash heuristic (investigated 2026-09-18; resolved by the split below).**
  - What it was: `EntityId<E>` is `` `${string}-${string}` `` with an *optional* `__entity` brand. The query and
    write entry points each took a name *or* an id, and the dash was the only thing telling those apart. So a misspelled
    entity name containing a dash fails the name check and lands on the id overload.
  - **Four things depend on that one shape**, which is why it looks fixable and isn't: the dash
    discriminates name from id; the *optional* brand is what lets `E` infer from a tagged id; the
    looseness is what lets real literal ids be written (`id === 'TNode-Root'`, `'Settings-app' as
    EntityId<'Settings'>`); and a plain `string` is *already* rejected, which is why `as EARS.EntityId`
    casts are everywhere. The hole and the ergonomics are the same property.
  - **Attempt 1 — check the literal's prefix in the overload** (`Id & IdArg<N, Id>`, where `IdArg` maps a
    literal prefix that isn't a declared name to `never`). Correct in isolation; **10 type errors** in the
    repo, all legitimate calls. Cause: to check the literal you must capture it at an inference site, but
    `E` must come from the brand, and the two cannot both infer from one argument — so `E` collapsed and
    rows lost their shapes (`brain/be/repository/index.ts`, `brain/be/system.ts`).
  - **Attempt 2 — make the id marker required** (`& { readonly __earsId: true }`, entity tag left
    optional). Passes every documented property in isolation — `E` still infers, a plain id still goes
    where a tagged one is expected, casts still work, `'user-note'` is rejected. **17 type errors** in the
    repo: `id === 'TNode-Root'` comparisons (`database/be/repository/trace-query.ts`,
    `database/fe/state.ts`), literal ids passed in `browser/be/repository/commands.ts`, and an array cast
    in `apack-ears/tests/engine/persistence.spec.ts`. All correct code.
  - **Conclusion: there is no type-level fix that leaves current behaviour unchanged.** Anything that
    stops `'user-note'` being an id also stops `'TNode-Root'` being one.
  - **The design that gets both properties** is to stop overloading, and that is what landed
    ([`ears-public-api.md`](../../docs/archive/plans/ears-public-api.md)): `query(type)` beside `query.ids(id)`, and
    `create(type)` beside `write(id)`. The `EntityId` template stays, so literal ids still compile.
- **No entity names in `query('…')` (found 2026-09-14).** `query`'s id overloads came before its name overloads, so editors offered no names there. Fixed by putting the name overloads first, and moot since ids moved to `query.ids`; the completions test still guards the position.
