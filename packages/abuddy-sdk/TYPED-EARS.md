# Typed EARS: type contract and change control

The typed EARS helpers are the main way pack authors touch data, so their types are a product surface, not an implementation detail. Their behavior was specified deliberately and is pinned by tests. **Don't change them to make a single call site compile.**

## Files covered

The engine's types moved to `@abuddy/ears` (`packages/abuddy-ears`); the SDK keeps the names and shapes it adds, and codegen the pack's.


- `packages/abuddy-ears/src/entities.ts`: the core `EARS` namespace (`EARS.EntityId`), `BaseEntity`, `ShapeOf`, `EntityNameArg`
- `packages/abuddy-ears/src/runtime.ts`: `QueryBuilder`, `TransactionBuilder`, `FieldValue`, `FieldValues`
- `packages/abuddy-ears/src/typed.ts`: `defineEars` and the `Typed*` helper signatures behind `#generated/ears` (the functions it returns act on the installed engine; `src/engine.ts`'s `EarsQuery` is untyped)
- `packages/abuddy-sdk/src/types/entities.ts`: the SDK's `EARS`, aliasing the engine's types and adding the SDK's entity types and relation kinds
- `packages/abuddy-sdk/src/types/sdk-entities.ts`: `SdkEntityShapes` and the SDK-owned entity shapes (Relation and the flow model: Flow, Node, TNode, Action, Prompt). `Settings` is default-setup's entity, declared in its `abuddy.json` with `SettingsEntity` as its shape; the host's `AppState` isn't in any pack's `EntityName`
- `packages/abuddy-sdk/src/build/generate-entries.ts` (`generateEars`): the generated `PackShapes`, `EntityName` and `Node` override

## The contract

**No `any`.**
- Nothing pack-facing exposes `any`. `tests/build/published-sdk-any.spec.ts` in `@abuddy/cli` enforces it.
- An entity type without a declared shape reads as `BaseEntity & Record<string, unknown>`, so its values need narrowing.

**Shapes.**
- `ShapeOf` is deliberately non-distributive (see its comment).
- `PackShapes['Node']` is the pack's step node union: its own and its dependencies' `XNode extends NodeBase` types. It's `NodeBase` when no step defines one.

**Field parameters.**
- They're typed as `keyof ShapeOf<S, E> & string`, and picked rows as `Pick<ShapeOf<S, E>, K>`. This covers `where`, `pick`, `pickOne`, `linksPick`, `orderBy`, `distinct`, `groupBy`, `getAttr`, `getAttrs`, `findWithFields`, `findByIdWithFields` and `updateEntity`.
- This form is what gives editors field-name completions and makes a typo's error list the valid fields.
- For a union shape, such as `Node` rows, only the fields every member has are accepted.
- A query whose fields vary by member, or are only known at runtime, uses `untypedQx` from `@abuddy/ears` on purpose. The brain trigger queries in default-setup are the example. (It's the same untyped `qx` an engine's query face has, `createEarsEngine(...).query.qx`.)

**Entity names.**
- A literal entity name must be one the pack, its dependencies or the SDK declares (`EntityName`). A name typed `string` passes unchecked (`EntityNameArg`).
- The explicit-shape overloads (`findAll<T>(name)`) also accept a runtime name: supplying `T` leaves the
  name's `E` at its `string` default, so `findAll<Shape>('Tpyo')` compiles by design. Without a type
  argument the same call is checked.
- A generic helper constrains its name to `EntityName`, or opts out with `as string`.
- Overload order in `typed.ts` is part of the contract. `qx`'s name overloads come before its id overloads: in the other order, editors offer no entity names in `qx('…')`. It's also the order the runtime resolves a seed in (a registered entity type first, then an id).

**Ids.**
- Typed queries return ids tagged with their entity type (`ids()`, `first()`, `pick`'s `id`, a row's `id`).
- A plain `EARS.EntityId` carries no tag and is accepted wherever a tagged id is, including `includes` and `Set.has`. Only an id tagged with a different entity type is rejected.
- Link ids use `NoInferType`, so a result passed straight into a generic function keeps its shape.
- **A hyphenated literal is structurally an id, so a misspelled entity name containing a dash takes the
  id overload instead of failing the name check** (`qx('user-note')` compiles, matches nothing at
  runtime). `EntityId<E>` is `` `${string}-${string}` `` with an *optional* `__entity` brand, and that one
  property is both why a bare literal qualifies and why `E` infers from a real id — the hole and the
  inference are the same thing. Narrowing the overload to check the literal's prefix was measured: it
  breaks entity-type inference from a tagged id in ten places, because the literal must be captured at an
  inference site while `E` must come from the brand, and a bare literal has no brand. The fix is to make
  the brand **required**, so only an engine-returned id or an explicit cast is an id; every existing
  `as EARS.EntityId` keeps working and plain strings need one. It is not done, because entity names here
  are PascalCase without dashes, so no realistic misspelling reaches it — and this is change-controlled
  ground, so it needs the checklist below rather than a drive-by.

**Writes.**
- `tx` from `#generated/ears` checks declared fields' values when it knows the entity: seeded with a declared name or a tagged id.
- Undeclared fields are accepted, and a plain id leaves every write unchecked.
- So `put` and `add` take a field *name* of any string (`put<K extends string>`), and an undeclared one
  gets `unknown` for its value. This is deliberate — EARS stores attributes a shape need not declare —
  but it is inconsistent with `updateEntity`, which does check names against the shape. Writing through
  `updateEntity` gets completions and a typo's error; writing through `tx().put()` does not.

**Which `EARS` to import.**
- Pack code imports `EARS` from its `#generated/ears` by default.
- The SDK's `EARS` (`@abuddy/sdk`) is fine for `EntityId`, the SDK-owned constants and the shared EARS types (`AttrKind`, `RoleKind`, `Blueprint`…). That covers build facets and SDK-level code. Its `EntityId` is the same type the generated one aliases, and a pack's name (`EARS.Entity.Note`) doesn't exist on it, so a wrong import fails to compile.
- The one hazard is the SDK's `EARS.Entity` as a type. It's open (any string), so a value annotated with it passes the entity-name check unchecked, reads with the generic shape, and compiles with a typo. Use it only when an open name is intended, as in default-setup's create step (`entityTypeTarget`, any entity type a flow names); otherwise annotate with the generated `EARS.Entity` or `EntityName`, which are closed.

**Defaults.**
- `QueryBuilder<E = string, S = {}, N = string>` and `TransactionBuilder<E = string, S = {}>` keep the helpers from `@abuddy/ears` (and an engine's `query` face) unchecked.

**Compatibility.**
- `@abuddy/ears` and `@abuddy/sdk` support TypeScript 5.7 and later (`packages/typescript-floor`). These types keep their `NoInferType` workaround from when the floor was 5.3.

## Before changing any of these types

1. **Treat it as a design change.** Get agreement on the new behavior first. If a call site doesn't fit the contract, change the call site instead:
   - an explicit shape
   - an `EntityName` constraint
   - a runtime name typed `string`
   - the untyped `qx` (`untypedQx`)
2. **Run the type tests** that pin the contract:
   - default-setup: `tests/unit/typed-query-builder.spec.ts`, `branded-entity-id.spec.ts`, `entity-shape-registry.spec.ts`, `sdk-type-safety.spec.ts`, and `npm run typecheck:pack`
   - `@abuddy/cli`: `tests/build/facade-typing.spec.ts` (a real dependent pack under bundler and node16, against both the workspace source and the packed `@abuddy/ears` and `@abuddy/sdk`) and `tests/build/published-sdk-any.spec.ts`
3. **Mutation-check every rule you touch.** Break it on purpose and confirm a test fails.
4. **Check editor completions and error messages.** `tests/build/facade-typing.spec.ts` in `@abuddy/cli` checks the positions below with the TypeScript language service, under both module resolutions and against the published package. Extend it when you add a field or name parameter, and still look at anything it doesn't cover.
   - Field positions should list the entity's fields: `qx(EARS.Entity.X).pick(['|'])`, `.where('|')`, `.orderBy('|')`, `getAttr(id, '|')`, `findWithFields(EARS.Entity.X, ['|'])`.
   - Entity-name positions should list entity names: `qx('|')`, `findAll('|')`, `createEntity('|')`, `.linksTo(kind, '|')`, `.ofType('|')`.
   - A typo (`where('titel')`) should produce an error that lists the valid fields.
   - Compare against the previous version with the TypeScript language service (`getCompletionsAtPosition`), not just by compiling.
5. **Update the API reports** (`npm run api:update` in `packages/abuddy-ears` and `packages/abuddy-sdk`) and review the `abuddy-ears/etc/index.api.md` and `abuddy-sdk/etc/types.api.md` diffs as part of the change.

## Incidents

- **Union field typing (2026-09-14).**
  - What happened: to make brain's trigger queries compile against the new `Node` union, the field parameters were rewritten as conditional and mapped types (`FieldArg`, `FieldsArg`, `PickedOf`). That added runtime field names and union-member fields to every field-keyed API.
  - Why tests missed it: everything compiled and every type test passed. But field completions disappeared from `pick`, `pickOne`, `linksPick`, `getAttr` and `findWithFields`, and typo errors became "not assignable to type 'never'".
  - Resolution: reverted, and the two queries use the untyped `untypedQx` (`@abuddy/ears`). The completions test in `facade-typing.spec.ts` now guards these positions.
- **No entity names in `qx('…')` (found 2026-09-14).** `qx`'s id overloads came before its name overloads, so editors offered no names there. Fixed by putting the name overloads first; the seed resolution matrix in `typed-query-builder.spec.ts` pins that nothing else changed.
