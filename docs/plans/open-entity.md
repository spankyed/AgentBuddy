# Opening an entity is one verb, and no caller names a plugin

Status: planned after complete [discovery without activation](discovery-without-activation.md),
as ordered by [manifest maturity](manifest-maturity.md). Re-audit the survey against the naming result. The catalog owns declared entity-to-feature destinations; activation binds the
handler. Keep one `openEntity` verb, but do not implement the old registry lookup as a second inventory.
The survey below is historical input: current `ReferenceTypeConfig` still has `navigate`, so the claim
that it was already removed is not a current-code assertion.

## Context

"Show the user this thing" is done **eleven times in six vocabularies**, and every one of them names a
plugin and an event:

| event | senders |
|---|---|
| `NOTE.OPEN` | three `navigate` closures in `features/notes/fe/references.ts` |
| `SELECT_THREAD` | `features/threads/fe/references.ts` |
| `EDIT_DOCUMENT`, `NAVIGATE_TO_FOLDER` | `features/library/fe/references.ts` |
| `ACTION.SELECT` | `features/code/fe/features/actions/ActionsPanel.vue:468`, `extensions/steps/action/form.vue:356` |
| `PROMPT.SELECT` | `features/code/fe/features/prompts/PromptsPanel.vue:475` |
| `FLOW.SELECT` | `features/brain/fe/components/StepNodeDetails.vue:136`, `:140` |

Each is declared in the owning plugin's `Contract.inbox`, which makes a feature's **internal** navigation
event part of its public surface. So every consumer has to learn a per-feature string and a per-feature id
field (`noteId`, `documentId`, `folderId`, `id`, `actionId`, `promptId`, `flowId`), and a consumer that holds
only an entity — the host, a link, a content item — cannot address any of them, because nothing in the app
maps an entity type to the feature that is its home.

**The direction is inverted.** A feature should not publish how to open its things; it should declare that it
*is* their home and handle one generic event, the way `TRAIL_CLICK` already works — the host sends one event
with a discriminator and the feature maps it onto its own states (`apack-sdk/src/fe/route-trailer.ts`).

**Outcome:** one public verb, `openEntity(id)`. No ref and no event name at any call site, so addressing the
wrong plugin stops being a mistake that can be made rather than one that is checked.

## The shape

Three pieces, and nothing else.

**One event, declared once for every plugin**, as `FEATURE_SETTINGS_UPDATED` already is
(`apack-sdk/src/events/index.ts:287`), so no pack declares it:

```ts
export type OpenEntity = { type: 'OPEN_ENTITY'; id: EARS.EntityId };
export const PLUGIN_EVENT_TYPES = eventTypes<FeatureSettingsUpdated | OpenEntity>()(
  'FEATURE_SETTINGS_UPDATED', 'OPEN_ENTITY');
```

**One contract field**, beside the `state` a plugin publishes and the `inbox` it opens:

```ts
// features/notes/fe/contract.ts
export interface Contract {
  state: NotesState
  inbox: …
  opens: 'Note'        // EntityName — the compiler checks it against the pack's declared entities
}
```

**One public function**, beside `openLink` (`apack-sdk/src/fe/navigation.ts:33`):

```ts
export function openEntity(id: EARS.EntityId): void
```

and the feature handles it as it handles a trail click:

```ts
OPEN_ENTITY: { guard: { type: 'entityIs', params: { entity: 'Note' } }, target: '.viewing', actions: 'openNote' }
```

## Decisions

**1. The event carries the id and nothing else.** `{ entity, id }` is one fact in two representations that
can disagree, which is the defect this plan exists to remove, not one to reproduce in the payload. The id *is*
the type: `entityTypeOf` (`apack-ears/src/attribute-storage.ts:21`) reads it, and its own header states the
rule — *"the `entityType` attribute is a denormalised copy of it, so the two must never disagree."* It is
module-exported and not in the public barrel; this promotes it.

**2. `opens` is a contract field, not a new manifest key.** A contract can be a declared build input that codegen reads
with `declaredTypeOf` (`apack-sdk/src/build/module-exports.ts`) without resolving the machine, and
`apack.json` already names it at `features[].plugin.contract`. So the fact is readable at build time, lands
in the snapshot, and the host reads it with no pack code and no TypeScript — which is what manifest-driven
has to mean here. Against a JSON array it costs nothing and buys the compiler: `EntityName` checks the name
at build time. The descriptor validator still checks destination identities and cross-pack collisions;
compiler checking alone cannot validate unrelated installed packs.
The trade is that a JSON field is greppable by anything and a type needs the build's TS program, which the
build already has.

**3. No call site names a plugin.** `openLink(url)` is the precedent: it resolves the `browser` designation
itself and the caller holds only a URL. Exposing a `whoOpens(entityType)` lookup instead would put a ref back
at every call site, which is the failure mode being removed.

**4. At most one eligible destination per entity type.** A feature explicitly claims what it opens;
entity ownership does not imply destination ownership. This includes SDK-owned entities such as Action.
Choose the normal detail view for generic opening; opening a source file remains a separate operation.
Validate conflicting eligible claims with both owners named. No claim is a supported unavailable result,
not an excuse to guess a plugin. Disabled declarations remain discoverable without competing as eligible
routes; enabling a conflicting claimant must fail the same validation.

**5. No `intent` on the event.** `reveal` against `edit` is a real distinction in editors and there is no
second intent in this tree. If one arrives it is `OPEN_ENTITY { id, intent? }`, additively.

**6. The per-feature events stay, and stay private.** `NOTE.OPEN` and its five siblings remain each feature's
own internal event; what changes is that nothing outside sends them. Dropping them from the published
`Contract.inbox` is a follow-on once every external sender is converted, not part of this.

## What this deletes

- `ReferenceTypeConfig.plugin` and `ReferenceTypeConfig.navigate` — a feature publishing how to open its
  things is the thing being removed, and the config shrinks to what it is for: `protocol`, `category`,
  `icon`, `svgElements`. The click handler in `extensions/tiptap/reference-node.ts` becomes
  `openEntity(node.attrs.refId)`.
- The six `navigate` closures, which are each `openPlugin(<own plugin>, { type: <constant>, <field>: refId })`
  with no branching — six declarations, none of which needed a function.

The original branch survey reported these fields removed. Re-audit the implementation: `navigate`
exists in the current reference type. Remove obsolete fields only as their callers migrate.

## Phases

Each leaves the tree green and is landable alone.

**Phase 0 — settle the short-code hazard.** `openEntity` takes an entity id, and the tiptap markdown-parse
path may not hold one. `reference-node.ts`'s `getAttrs` does `refId: href.slice(protocol.length + 3)`, i.e.
the **short code**, and `thread` and `document` have short codes distinct from their ids (`note`, `task`,
`tasklist` and `folder` use the id for both). Nothing resolves one: `SELECT_THREAD`'s id passes straight to
`VIEW_THREAD` (`features/threads/fe/state.ts:399`), and a thread's short code is `T-<count>`, which
`entityTypeOf` reads as entity type `T`.

This is **pre-existing** — today's `navigate(refId)` has the same exposure — so Phase 0 establishes whether it
is reachable (does stored content round-trip through markdown, or through ProseMirror JSON which keeps
`refId`?). Fix reachable short-code resolution before migrating those callers; test missing and ambiguous
references explicitly. Static reference descriptors cannot resolve user-created short codes by themselves. The design does not depend on the answer: `openEntity` takes an
entity id, and resolving a short code to one is the reference system's job, on the side of the boundary that
knows short codes exist.

**Phase 1 — the primitive.** `entityTypeOf` promoted to `@apackdev/ears`' barrel; `OpenEntity` in
`PLUGIN_EVENT_TYPES`; `entityIs` beside `targetIs`; `openEntity` in `apack-sdk/src/fe/navigation.ts`;
`opens` on the plugin contract type, read by codegen into both registrations and the snapshot; the lookup on
the host/browser catalog projection, without a second registry inventory. Bind handlers against that
projection. Unknown, missing and disabled destinations produce distinct useful results; known destinations
use the discovery readiness coordinator before delivering the event. Correlate queued delivery and reject
stale completions after unload/replacement. No consumer yet — specs prove this primitive.

**Phase 2 — the pack-entity destinations declare what they open and handle it.** `notes` (`Note`),
`threads` (`Thread`), `library` (`Document`, `Collection`). An entity a feature declares and does not open —
`SearchIndex`, `IndexedDoc`, `Message`, `Artifact`, `Terminal`, `BrowserTab`, `BrowserBookmark` — says nothing,
which is why `opens` is an opt-in rather than derived from the entity declaration.

**Phase 3 — the three SDK-entity features.** `actions` (`Action`), `prompts` (`Prompt`), `flows` (`Flow`).
These own no entity declaration of their own — `Action`, `Prompt` and `Flow` are the SDK's — so this is where
the rule "a feature declares the entities it is the home of, not the entities it declares" earns itself.

**Phase 4 — convert the eleven call sites** to `openEntity(id)`, and the tiptap click handler with them.

## Verification

- **Inner loop** `npm run spec -- <file>`; `npm run packages:ensure` before any pack-suite run.
- **The typecheck is the main instrument**: `opens` is checked against `EntityName`, and every converted call
  site loses its event name, so a wrong one cannot be written.
- **A derived guard**, in the shape this repo asks for: the subject is every catalog destination's declared
  `opens`, asserted non-empty, and each eligible claimed entity type resolves to one destination.
  Cover conflicts, disabled claimants and unclaimed entity types separately. Mutate it in the test by
  dropping one feature's `opens` and asserting the answer flips, because a check that reports nothing may
  have looked at nothing.
- **Mutation-check `entityIs`** the way `targetIs` is covered: a plugin handed an `OPEN_ENTITY` for an entity
  it does not open must not transition.
- **One E2E claim is worth the real process boundary** and meets the two-part test in `tests/e2e/CLAUDE.md`:
  a reference clicked in a stored message opens the right plugin on the right row. Everything else here is a
  harness test.
- **End-to-end by eye**: `npm run dev:drive`, open a thread holding a note reference, click it.
- **`npm run chain`** per phase. Phase 1 touches `@apackdev/sdk/src` and codegen, so expect a cold run;
  `api:update` for `PackFERegistration`, the plugin contract types and `@apackdev/ears`' barrel.
- Regenerate the schema if authoring fields change. Check `PACK_SNAPSHOT_FORMAT` under the current
  repository rule when adding destination metadata; coordinate with discovery rather than prescribe
  an independent bump.

## Risks

**The snapshot format is the artifact contract.** Coordinate this change with the discovery descriptor
under the current format rules. The archived manifest-redesign goal is not an independent workstream;
do not force a release/version bump merely because its old plan prescribed one.

**Destination ownership must be declared once.** Discovery materializes the build-checked destination
contract in the descriptor. Do not infer that every entity-owning feature can open its entities, or
copy destination facts into both manifest flags and contract types. Normalize them once for catalog
readers; active handlers bind to that account.

**Phase 4 changes reference navigation.** Re-audit existing coverage rather than assume the historical
survey is current. Prove short-code resolution, stored-reference round trips and catalog/readiness routing
before converting callers. Remove `navigate` bindings only after every supported caller migrates.

The resulting navigation API is the input to later lazy activation: a destination is known before it
runs, but opening still waits for the current handler to be ready.

## What this is not

- Not the content-offer "Open" button. That becomes one call site on top of this and is not a reason to build
  it; the eleven existing call sites are.
- Not a change to how a feature opens its own things internally. `NOTE.OPEN` keeps working and keeps its name.
- Not a replacement for `untypedOpenPlugin`, which stays the door for opening a *plugin* — a navigation
  rather than a thing.
