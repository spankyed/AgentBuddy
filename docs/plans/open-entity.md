# Open entities through declared destinations

Status: in progress on the accepted declaration/catalog and actor-readiness contracts. The
[execution goal](../goals/goal-settings-and-pack-contracts.md#execution-order-and-change-control) owns
the current order; unrelated compiler/freshness work is not a prerequisite. Re-audit the historical
survey against current code. The catalog owns declared entity-to-feature destinations; activation binds the
handler. Keep one `openEntity` verb, but do not implement the old registry lookup as a second inventory.
The context survey below is historical. Source `cd9c57de6` removes reference navigation callbacks and
migrates generic callers; blueprint node revealing retains its separate purpose and remains below.

Build producer `94148c9e0` and catalog/admission `479c75e01` are implemented. Codegen materializes
exported `Contract.opens` into snapshot data; native composition supplies the same map explicitly.
Catalog entries project claims without activation. Enabled conflicts refuse before executable imports,
enablement persistence and catalog publication; disabled declarations remain visible. Native binding
eligibility compares accepted claims, while installed bindings use their sealed build identity. Window
frames validate target membership before publication.

Routing checkpoint `cd9c57de6` implements `openEntity`, typed guards, the host existence query and
one child actor owning cancellation, final validation and delivery. The existing readiness queue
carries only a token. All six feature adapters handle the event directly; reference callbacks are gone.
The harness captures verified destinations once per file, and CLI inspection exposes the compiled map.
Sixty shell checks, including missing-actor refusal, and the real external reference click pass.

Feature checkpoint `831221020` uses the explicit `NODE.REVEAL { flowId, nodeId }` operation. Flows owns its
matching reply and retires it on supersession or navigation; graph identity also guards async layout
delivery. Library accepts document data only in the editor for its current target; replies do not
navigate. All 99 affected Flows/Library tests and pack types pass. The strict checkpoint stopped at an
authoring read of a missing runtime source map during an overlapping default-pack build; the default
build passed. See the [checkpoint evidence](../evidence/settings-and-pack-contracts.md#feature-navigation-checkpoint-2026-10-16).

Acceptance checkpoint `95ff95ab3` covers all six real handlers, including unrelated entity types,
nested notes, unlisted threads, superseded replies, abandoned editors and cached selection. Actions
and Prompts retire pending selection calls on detail exit/deactivation. The shell also cancels on
breadcrumb/Back/Forward input. All 105 shell and 159 affected feature cases pass. A real Electron case
imports a thread, reloads its persisted message, clicks the rendered reference and verifies the note's
title and content in another feature; this closes the stored-message gap left by the preview test.
See [acceptance evidence](../evidence/settings-and-pack-contracts.md#entity-navigation-acceptance-checkpoint-2026-10-16).
Implementation and local acceptance are complete; the execution goal retains the failed authoring
checkpoint and final committed-source strict gate. Do not archive this plan until final validation.

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

### Blueprint node revealing

Opening a flow entity and revealing a particular node within it are separate operations. The Brain's
blueprint link must retain both the flow and node target. Keep this as an explicit Flows operation;
addressing that feature for node revealing is intentional, rather than a generic entity-opening caller.
Do not force the coordinates into `OpenEntity`, invent a node destination, or discard the node reveal.

Replace the caller's timer with feature-owned coordination: load the requested flow, match the response
to the current request, and reveal its node only once that graph is available. A newer navigation cancels
the pending reveal; late responses cannot reveal a node in another graph or another window. An already
loaded matching graph can reveal immediately. Cover delayed loading, supersession and the loaded case.
Implemented by `NODE.REVEAL` and the feature-owned pending flow request. `FLOW_SELECTED` replies only
to the asking window; `FLOW_REFRESHED` remains a notification for the current graph. The Brain caller
no longer sequences navigation with a timer. Delayed loading, supersession, deactivation, cached graphs,
missing nodes, startup metadata and stale layout delivery have focused regression coverage.

## What this deletes

- `ReferenceTypeConfig.plugin` and `ReferenceTypeConfig.navigate` — a feature publishing how to open its
  things is the thing being removed, and the config shrinks to what it is for: `category`, `icon`, `svgElements`. The click handler in `extensions/tiptap/reference-node.ts` becomes
  `openEntity(node.attrs.refId)`.
- The six `navigate` closures, which are each `openPlugin(<own plugin>, { type: <constant>, <field>: refId })`
  with no branching — six declarations, none of which needed a function.

The historical survey below predates this migration. `navigate` and its runtime binding are removed
in `cd9c57de6`; the click handler now lives in `apack-ui/src/components/tiptap/reference-node.ts`.

## Phases

Each leaves the tree green and is landable alone.

**Phase 0 — preserve canonical reference identity.** The audit confirmed a reachable Markdown
round-trip bug: the picker inserted an entity id but serialization wrote its short code into href.
Use the percent-encoded entity id as the canonical URL target and decode exactly once when parsing.
Labels and short codes remain presentation. HTML can retain the display code as an attribute;
Markdown preserves its visible label. Duplicate codes must retain distinct ids, malformed/empty
URLs must not become references, and an updated node view must navigate its new target.

Do not add a lookup or old-format fallback to reinterpret saved short-code URLs. There are no users
requiring that compatibility path. Explicit user entry of a short code is a separate operation,
which must resolve ambiguity before calling openEntity; current parsing does not introduce it.
See the [identity audit and selected correction](#reference-identity-prerequisite-audit-and-correction-2026-10-13).
The primitive still handles missing entities and unavailable destinations usefully in Phase 1.

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

**The snapshot format is the build contract.** Coordinate this change with the discovery descriptor
under the current format rules. The archived manifest-redesign goal is not an independent workstream;
do not force a release/version bump merely because its old plan prescribed one.

**Destination ownership must be declared once.** Discovery materializes the build-checked destination
contract in the descriptor. Do not infer that every entity-owning feature can open its entities, or
copy destination facts into both manifest flags and contract types. Normalize them once for catalog
readers; active handlers bind to that account.

**Phase 4 changes reference navigation.** Re-audit existing coverage rather than assume the historical
survey is current. Prove canonical entity-ID round trips and catalog/readiness routing before converting
callers. Labels and short codes remain presentation; no short-code lookup or old-format fallback is required. Remove `navigate` bindings only after every supported caller migrates.

The resulting navigation API can support lazy activation if that deferred work is resumed: a destination is known before it
runs, but opening still waits for the current handler to be ready.

## What this is not

- Not the content-offer "Open" button. That becomes one call site on top of this and is not a reason to build
  it; the eleven existing call sites are.
- Not a change to how a feature opens its own things internally. `NOTE.OPEN` keeps working and keeps its name.
- Not a replacement for `untypedOpenPlugin`, which stays the door for opening a *plugin* — a navigation
  rather than a thing.


### Reference identity prerequisite audit and correction (2026-10-13)

The short-code hazard is reachable: the reference picker inserts both the entity id and short code,
but ReferenceNode serializes its href using shortCode; Threads input reads the Markdown serializer
when sending a message. Reparsing then assigns that URL target to refId, and navigation sends it as
an entity id. Threads and documents therefore lose their real targets on this supported route.

Use stable entity ids as canonical URL targets and keep human labels/short codes as presentation.
Percent-encode the target and decode once; malformed/empty targets must not create a reference node.
HTML retains an optional short-code data attribute; Markdown keeps its visible label. Do not guess
ids from display text, consult a mutable list to interpret saved links, or add an old short-code read
path. Duplicate short codes then have no bearing on target identity. Explicit user entry of a short
code is a separate resolver operation and is not silently introduced by reference parsing.

Audit also found that a node view's update changes its displayed label/icon while its click closure
still uses the original node. Retain the latest accepted node for click delivery. Unknown reference
types and missing ids must not default to thread navigation. Escape Markdown labels through the
serializer's text method, preserving canonical targets for punctuation-bearing labels/ids.

Implement and test this prerequisite through actual Tiptap HTML/Markdown round trips and node-view
updates before moving the six navigation callbacks to entity opening. Test same-code/different-id
references, encoded ids, malformed URLs, missing ids, unknown types and a changed target in an existing
node view. This fixes the current writer/parser contract; actual entity destination readiness and
unavailable/missing-entity results remain required by subsequent phases. No historical conversion,
compatibility fallback or fake actor is added.


The prerequisite implementation now writes encoded entity ids in HTML/Markdown URLs, decodes once,
keeps HTML display-code attributes, escapes Markdown labels through the serializer and refuses empty
or malformed targets. Unknown types/missing ids produce plain presentation and no navigation; they
never default to a thread. Node-view updates retain the latest accepted node for click delivery.

Eight tests run actual Tiptap parsing/serialization and DOM node views for thread/document round trips,
same-code/different-id targets, encoded punctuation, malformed URLs, missing ids/unknown types and
in-place updates. Descriptor callbacks are test stand-ins, so this proves delivered identity rather
than full destination readiness. Typechecking passes with a narrow typed Markdown storage adapter.
Short-code serialization makes four cases fail; retaining the stale node makes the update case fail.
Exact source is restored after each mutation. Strict validation remains required before commit.

The pack declares its editor/DOM test dependencies. The offline install initially selected newer cached
Tiptap releases; the original locked package resolutions were restored, with only dev-dependency
metadata added. Tests retain Node's binary globals and install DOM globals locally, avoiding the
repository's documented jsdom/esbuild realm conflict. There are no runtime compatibility reads or
production-data changes. Declarative references/categories/providers, entity routing and remaining
readiness/stale-delivery work remain required by the full goal.


Strict checkpoint validation passes all 30 gates in 491.1 seconds (none cached), including the full
unit/integration suites, actual external-pack app acceptance, smoke and both packaged-authoring halves.
Evidence: `node_modules/.cache/apack-chain/runs/2026-10-14T00-51-53Z-23984`;
`/private/tmp/apack-reference-identity-strict.log`. This verifies the canonical reference writer/parser
prerequisite and retains the full later routing/discovery scope. Descriptor navigation callbacks still
exist; actual entity destination lookup, unavailable/missing-entity outcomes and stale delivery remain
unfinished. No plan is archived and this is not final goal-wide strict --all acceptance.


### Reference wire identity correction (2026-10-14)

The delayed-catalog audit disproved a hidden assumption in Phase 0: a URI whose scheme is defined by
pack metadata cannot be parsed independently of that metadata. With the catalog empty, real Tiptap
parsing turns `[Saved memo](memo://Memo-before-catalog)` into `Saved memo`; the target is already gone
when declarations arrive. The failing assertion is recorded in
`/private/tmp/apack-reference-delayed-catalog-repro.log`. Separately, the common UI Link configuration
still lists `note`, `thread` and `doc` explicitly. This is runtime-discovery coupling in stored identity.

Use one internal reference format: `apack-ref://<encoded-reference-type>/<encoded-entity-id>`.
Both segments are percent-encoded independently and decoded exactly once. Parsing requires two
nonempty segments and refuses malformed encoding/structure. This scheme identifies document
references, not a production/beta/preview app selector or an operating-system launch request.
Reference type remains presentation identity; entity id remains the canonical navigation target.
Do not infer entity identity from labels/short codes or allow declaration data to reinterpret the id.

Put the pure formatter/parser and their target type in the SDK reference entry. The editor's existing
`reference` node keeps `refType`, `refId`, `label` and `shortCode`; no new provisional node, feature, actor
or data entity is needed. Its HTML and Markdown parse/serialization must preserve valid targets while
metadata is loading, unavailable or absent. Unknown presentation types stay inert until eligible;
node-view declaration subscriptions can update icons in place without reparsing content, changing
selection/history or replaying navigation. Ordinary web/mail links retain the existing Link validator.

Replace the per-type URI scheme contract outright. Remove reference `protocol` from declarations and
accepted bindings, `referenceProtocols` provenance/collision claims, `findReferenceTypeByProtocol`,
and the common UI's hardcoded reference schemes. Retain qualified type/category ownership and
collision refusal. Update every manifest, fixture, schema, API report, generator and public guide in
the same checkpoint. No old-scheme aliases, dual parsing, saved-format conversion or compatibility
fallback. Developer backup conversion, if needed, remains a separate explicit operation.

Required proof: pure Unicode/reserved-character round trips and malformed target refusals; actual
HTML/Markdown parsing before first catalog delivery; serialization after declarations disappear;
metadata arrival updating an existing node without document/selection/history changes; navigation
remaining unavailable until matching acceptance; ordinary web/mail links unaffected; and updated real
external pack reference/picker acceptance. Mutation-check target retention and parser guards. Run the
strict checkpoint chain with its corrected shipped-pack inputs and record the committed evidence.

This replaces the Phase 0 per-type-scheme parsing/writing design, not the entity-opening primitive.
Phase 4 still supplies checked `opens`, canonical-id destination resolution, useful missing/disabled
results and stale-window/revision refusal. The URI alone neither activates nor authorizes a destination.


### Reference identity implementation (2026-10-14)

The pure SDK framework formatter/parser now implements the internal URI above; the frontend reference
entry reexports that same implementation because its shared entry can be loaded by pack frontends.
Neither formatter nor parser reads a host or catalog. Encoding also escapes Markdown URL delimiters
such as parentheses, preserving ids across editor serialization and backend link extraction.

The existing node parses and serializes type/id directly, keeping unknown targets inert rather than
dropping them. Metadata arrival updates geometry through the existing view subscription without
changing document state, selection/history or replaying navigation. Static metadata still supplies
presentation and accepted bindings still gate navigation. Per-type protocols, provenance/claims/lookup
and the shared UI hardcoded list are removed outright. The obsolete inline note-scheme click branch
is removed; sub-document blocks remain a separate existing contract for the entity-navigation phase.

Note backlink extraction uses the common parser and the notes feature's shared presentation mapping,
including tasks and task lists. Authored content examples and their independent expectations are
migrated; goldens are regenerated through `content-parity:update`, never edited by hand. The first
content run caught the old URI syntax in the independent change-tracking oracle; that oracle now
expects the current format. Templates, public schema/reports and the external reference fixture agree.

Focused proof covers pure encoded identities, malformed/foreign URI refusal, cold HTML/Markdown
parse/write, absent declarations after load, unchanged document state and node identity on publication,
readiness-gated navigation, ordinary web/mail links, and encoded backend backlinks. Removing the URI
structure guard or reintroducing declaration-gated serialization fails named regression assertions.
Full strict and real external acceptance are required before recording a validated checkpoint.

The parsing node is still provided by the default pack's editor extension. The broader native/editor
discovery audit must also settle intrinsic reference-schema availability when that extension is absent;
this checkpoint proves absence of reference-provider metadata, not absence of the parser itself.
Entity opening, checked `opens`, unavailable destinations and stale delivery remain due as above.


The reference identity checkpoint passed all 30 strict gates in 545.8 seconds with no cached gates,
including 4,405 host tests, 855 pack tests (two existing skips), 639 integration tests, fresh real
external-reference/default-fork Electron acceptance, smoke and both packaged-authoring halves.
The external reference/picker case passes with the new URI. Schema and three reviewed SDK API
reports agree; content parity passes all 145 checks after deliberate golden regeneration.
Evidence: `node_modules/.cache/apack-chain/runs/2026-10-14T04-44-15Z-64383`;
`/private/tmp/apack-reference-wire-strict.log`. The intrinsic editor-schema ownership and remaining
whole-goal work above are still required.
