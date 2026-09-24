> **Done** (branch `AS/plugin-contract`, commits `3d79fed34`…`682b1be90`). The text below is the plan as written; the contract leaf was later renamed `fe/contract.ts` and the system side generalised by [`goal-contracts-as-types.md`](goal-contracts-as-types.md). For the current layout, see [`docs/public-facing/features.md`](../../public-facing/features.md).

> **Written in session** `a1dd708e-4765-423c-a618-93ab4b9131fb` (Claude Code, 2026-09-23). Resume it with `claude -r a1dd708e-4765-423c-a618-93ab4b9131fb`.

```
# Goal: a plugin declares one contract — what may be read of it, and what may be sent to it

Implement docs/goals/goal-plugin-contract.md on the current branch. Background's figures were re-verified on
2026-09-23; the checks below are the authority, not a commit.
Before Phase 1, confirm: packages/abuddy-sdk/src/fe/plugin.ts exports `pluginAccepts`,
packages/abuddy-sdk/src/build/module-exports.ts exports `acceptedEventTypesOf`, and the seven
packages/default-setup/src/features/*/fe/public.ts exist. If any is wrong, stop and say so.
Read docs/archive/goals/goal-plugin-inbox.md's Outcome first, then this doc's Background, Spike results,
Decisions, Phases and Constraints. Decisions are final: implement them, don't reopen or ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and continue.
No backward compatibility: change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in one change, and fix forward.

Finished when:
- Phases 1–4 each meet their "Done when"; every new guard, helper or test is mutation-checked.
- No packages/default-setup/src/features/*/fe/public.ts remains. The host's three (application, packs,
  settings) stay: check-import-specifiers.ts records that as deliberate.
- Each default-setup feature that needs one has an `fe/types.ts` leaf holding its context, its `Contract`
  and any plain data, importing nothing from `#generated/*` but `types` and `ears`, nothing from `./state`. `pluginAccepts`/`PluginAccepts` are gone, with nothing in their place.
- `#generated/events` imports the leaf, never `fe/plugin.ts` nor a module reaching `./state`.
- In tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts no `accepts` block names
  UPDATE_STATE, terminal.CREATE, NOTE.OPEN, TAB.CREATE, NODE.DOUBLE_CLICK, EDIT_DOCUMENT or FLOW.SELECT;
  `navigateToPlugin` still compiles at every in-repo caller.
- An external pack reads a dependency's plugin state with types (proved in tests/fixtures/external-pack),
  typed `T | undefined` — that frontend may still be loading.
- `usePluginState`/`readPluginState` name only the generated readers; the SDK's untyped pair is
  `useUntypedPluginState`/`readUntypedPluginState`; `abuddy.json` names each contract at
  `features[].plugin.contract`.
- `findCrossFeatureImports` no longer excepts `fe/public`: no feature imports another feature's `fe/`.
- npm run typecheck, schema:check, api:check (sdk, ui), facade:check -w @app/default-setup,
  packages:build + packages:check.
- npm run test:unit, compile, build, npm test (E2E), test:external-pack; npm start boots clean.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit each phase once its "Done when" holds and checks are green: conventional message, no Co-Authored-By
or session lines, `git commit -- <paths>` for that phase's files only, `git diff --cached` checked first.

Never:
- push, tag, open a PR, npm publish, create releases or trigger workflows (dry runs only) unless asked.
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- give the contract a runtime value (a `pluginContract()`-style call) or read it from `fe/plugin.ts`: the
  first is needless ceremony, the second restores the cycle (Spike results).
- split `defineSystem`'s audiences, add a `from` to `Message`, or add an FE runtime validation map: all
  Deferred, with triggers. Of the self-imposed constraints 2, 5 and 6 are in scope, 3 only for the plugin
  contract (Decision 2); 1, 4 and 7 are not.
```

## Background (2026-09-23, at 8126ae364 on AS/plugin-inbox)

`goal-plugin-inbox.md` (archived) landed the model: a plugin declares what others may send it, `sendsTo` is
gone, `plugin-handle.ts` is deleted. Two things it left are what this goal is for.

**One declared audience, and it is the widest.** A plugin's inbox is its own system's outgoing union
(derived, never published) unioned with whatever it declares (published). Nothing sits between. So when
`da6a45e91` typed `navigateToPlugin`, the cross-feature UI commands it surfaced had nowhere to go but the
published tier. Measured at this base, the fixture's facade carries ten `accepts` blocks holding **20 literal
event types plus three named unions** — `OutgoingActionEvents` (11 events), `ActionsListEvent` (8) and
`PromptsListEvent` — so roughly 45 events reach every dependent:

```
tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts
3808:    type: "UPDATE_STATE"; updates: Partial<Context>;   // the code plugin's whole context, writable
3812:    type: "terminal.CREATE";                           // the code plugin routing to its terminal child
3829:    type: "NOTE.OPEN";                                 // the notes plugin opening a note
```

`UPDATE_STATE` is the case that settles it: a dependent pack can write **any field** of the code plugin's
context, and `features/actions/fe/components/ActionDetail.vue:184` already does it cross-feature. The context
is published today — as a write surface, which is the worse half.

The same pressure shows in `flows`, which declares `OutgoingActionEvents` — **11 events where it handles 3**
(`features/flows/fe/state.ts:143-145`) — and drags a cross-feature `fe/plugin.ts → actions/be/system` import
in with it.

**Reading another plugin has no typed path.** `fe/public.ts` is a file per feature whose job is letting one
feature read another's state; 14 such edges remain, 10 of them from `src/extensions/**`, where components are
host-rendered with no `PluginScope`. The runtime already works cross-pack — `usePluginState`
(`abuddy-sdk/src/fe/plugin-state.ts`) resolves through the shell's registry, which knows nothing about pack
boundaries — so an external pack can read default-setup's threads plugin *today*. Only the type is missing,
and with it the discoverability.

**Why the contract cannot sit on `definePlugin`.** Typing that call makes TypeScript check its argument,
which holds the machine, which imports `#generated/events`, which imports the plugin. The cause is that every
context is declared *inside* its machine module (`NotesContext` at `features/notes/fe/state.ts:20`) and no
feature has an `fe/types.ts`; the backend has `be/types.ts` and the frontend never grew one.

## Spike results (2026-09-23)

Both probes ran on this branch and were reverted; the tree was clean afterwards.

**A leaf is readable.** `acceptedEventTypesOf` over an `fe/types.ts` returned `['NOTE.OPEN']`, with the
program also holding five other features' system and plugin entries. So pointing codegen at the leaf works.

**And a type alias is readable too — our reader just couldn't.** The first run of this probe concluded the
contract had to be a runtime value, because `exportOf`'s `ExportInfo.type` is a **boolean** (it says whether
a name is usable as a type, not what the type is) and `exportedValueType` resolves values only. Both are
ours, in `module-exports.ts`, shaped for the only two questions codegen used to ask. TypeScript's own
`checker.getDeclaredTypeOfSymbol` reads a type alias fine:

```ts
export type Contract = { state: NotesContext; inbox: { pack: { type: 'NOTE.OPEN'; noteId: string } } }
// → Contract members: [ 'state', 'inbox' ]      NotesContext members: [ 'notes', 'currentNoteId' ]
```

So the contract is a **pure type** and needs no value at all: nothing at runtime, nothing in a pack's bundle,
and `pluginAccepts` deleted rather than renamed. Reading it costs a `declaredTypeOf(file, name)` beside
`exportedValueType` — about ten lines — after which the existing `propertyType` and `eventTypeLiterals`
walk `inbox.pack` and `inbox.public` unchanged.

**The recorded mistake, because it is the kind that repeats:** a limit was hit in our own tooling and read as
a limit of the language. The question that dissolved it was whose limitation it was.

What stays true regardless: the contract cannot sit on `definePlugin`'s type parameters. Recovering them
means reading the call's return type, so codegen would import `fe/plugin.ts`, which imports the machine —
and the cycle returns.

**Ten contexts pass the facade gate, at +9%.** Exporting all ten from `pack-types.ts` and running
`abuddy build` produced no facade problems. `dist/types/pack-types.d.ts` grew **5522 → 6018 lines
(+496, +9.0%)**. Two contexts are not exported today and must be: `BrowserContext`
(`features/browser/fe/state.ts`) and `ThreadsContext` (`features/threads/fe/state.ts:256`).

## Self-imposed constraints (2026-09-23)

The `ExportInfo.type` mistake above is not a one-off. The same shape appears seven times across this goal
and the archived one: **a reader or a registration is narrower than the thing it describes, and the API was
bent to fit the reader rather than the reader widened.** They are listed here because three of them are
load-bearing in the Decisions below, and because the list is cheaper to keep than to rediscover.

| # | The constraint | Ours, at | Costs today |
|---|---|---|---|
| 1 | `Message` is `{ to, event }` — no sender | `abuddy-sdk/src/events/index.ts`, 8 construction sites | Decision 7 argued *from* it |
| 2 | `ExportInfo.type` is a `boolean` | `build/module-exports.ts:11` | drove the wrong conclusion in Spike results |
| 3 | the reader resolves values only | same file — built for `export const x = f<T>()` | `pluginAccepts`, `defineSystem`'s empty call, `_outgoing`/`_accepts` |
| 4 | `defineSystem` takes one union for incoming and internal | `framework/define-system.ts:52` | `ADD_LOG` is published API |
| 5 | `findCrossFeatureImports` excepts `fe/public` | one line, `scripts/check-import-specifiers.ts:530` | the whole `public.ts` institution rests on it |
| 6 | `pluginActor` throws when nothing is running | `fe/actor-system.ts:34` | every caller pre-checks with `hasDesignation` |
| 7 | `PackFEFeature` carries no `receives` | `fe/pack-fe-registration.ts:13` | nothing at runtime knows what a plugin accepts |

**Number 3 is the general case of number 2, and it is the one worth naming.** `module-exports.ts` was
written to read `export const x = f<T>()`, and every contract added since has been shaped to fit it:
`pluginAccepts<E>()` is a function that takes nothing and returns `{}`; `defineSystem<A, B, C>()` is the same
with three type parameters; `spec._outgoing` and `_accepts` are phantom properties that exist only because
the reader could not see a declared type. None of that is XState's requirement or TypeScript's — it is the
extractor's shape leaking into the authoring API. Decision 2 fixes it for the plugin contract; Deferred item
1 is the same fix for systems.

**What is *not* ours, so nobody spends a day on it:** XState's `system.get(ref)` is keyed by string, which is
why a cross-pack read needs codegen to generate the map rather than a cleverer type (Decision 5). And the
facade gate's import allowlist is load-bearing — relax it and dependents read `any`.

## Decisions

Final.

1. **`fe/public.ts` becomes `fe/types.ts`: the same file, inverted.** Out go the selectors (codegen replaces
   them), `usePluginState`, the `featureRef` constants (the generated reader is keyed by `PluginName`, not by
   ref) and the `./state` import. In come the context interface and the contract. Plain data it already holds
   stays put.

   The leaf imports nothing from `#generated/*` but `types` and `ears` — contexts need both (`NoteDTO`,
   `EARS.EntityId`) and neither reaches `#generated/events`. It imports no other feature, and nothing from
   `./state`.

   **Dropping `./state` costs more than it reads.** Six of the ten inboxes reach through it today: five are
   `Extract<XEvents, …>` over their own machine's union (`ActionsListEvent`, `PromptsListEvent`, `database`,
   `library`, `notes`) and `flows` imports `OutgoingActionEvents` from another feature's `be/`. All six are
   respelled as structural literals in the leaf, and `state.ts` then takes those events **from** the leaf
   rather than the leaf extracting them from `state.ts`. That inversion is the work of Phase 1. `code` already
   has the shape, with the comment that says why: "they are spelled out rather than extracted".

   A feature whose plugin publishes no inbox and whose state nobody reads gets **no leaf**: `library`'s
   `fe/public.ts` is one ref constant and nothing else. An empty `Contract` would be ceremony.

   The three `references.ts` files go with the refs. Each calls `usePluginState(REF, (actorState: any) => …)`
   on its own plugin (`notes`, `library`, `threads`); they move to the generated reader (Decision 5), which is
   what removes those `any`s.

2. **The contract is one exported type in the leaf.**

   ```ts
   export type Contract = {
     state: NotesContext
     inbox: { pack: { type: 'NOTE.OPEN'; noteId: string } }
   }
   ```

   A type, not a value: it is erased, so nothing reaches a pack's bundle, and `pluginAccepts` and
   `PluginAccepts` are **deleted with nothing in their place** — they existed only to carry phantoms past a
   reader that couldn't read types. `definePlugin` is untouched.

   Codegen reads `Contract` from `fe/types.ts` and nowhere else — **that one rule is what closes the
   cycle** — through a new `declaredTypeOf(file, name)` in `module-exports.ts` over
   `checker.getDeclaredTypeOfSymbol`, beside the existing `exportedValueType`. `ExportInfo` does not change;
   this is a new reader, not a different answer from an old one.

   **The leaf is named in `abuddy.json`, not found by convention** — in the `plugin` object that already
   exists, in the `"path#export"` shape `repositories` and `services` already use:

   ```json
   "plugin": {
     "entry": "src/features/notes/fe/plugin.ts",
     "contract": "src/features/notes/fe/types.ts#Contract"
   }
   ```

   The manifest names every other entry point a feature has — `system.entry`, `plugin.entry`, `references`,
   `settings` — so a conventional path would be its one implicit build input, and it would assume a layout no
   external pack has to share. Three things follow. The field is **optional**, which is how a feature with no
   published inbox and no read gets no leaf (`library`). A typo fails the build naming the path, rather than
   silently generating an empty inbox — the way `pluginAccepts` failed. And the JSON schema documents and
   validates it, with `schema:check` as the gate.

3. **Sends declare by audience; `pack` is the default.**

   | audience | source | reaches |
   |---|---|---|
   | this feature | derived — its own system's outgoing union | nobody else |
   | `pack` | declared | `OwnPluginEvents` — this pack's sends |
   | `public` | declared | `PackPluginEvents` → the facade |

   Publishing should be a word someone typed. A rookie declaring an inbox so a sibling can send it must not
   thereby create API for every dependent — which is exactly what happened to the ~45 events now in the
   facade, `UPDATE_STATE` among them.

4. **Reads are public by default, and narrow with `Pick<>`.** `State` is the whole context. The asymmetry
   with Decision 3 is deliberate, and this is the reason: **a send changes behaviour, a read does not**, and
   discoverability is the point — an external pack that gets nothing by default defeats the goal.

   It makes context fields API, so renaming one is a breaking change for dependents. A feature that wants
   less writes `Pick<ActionsContext, 'actions'>` — which is also the answer for `page`, `totalPages` and
   `loadingMore`, the `code` panel's read of `actions`' paging that no dependent should see.

5. **`PackPluginState` joins the facade, and `#generated/fe` gains the typed reader**, keyed by `PluginName`,
   resolving own features to their `State` and a dependency's to what its facade carries:

   ```ts
   usePluginState('notes',               (s) => s.currentNote)   // own pack   → Ref<Note | null>
   usePluginState('default-setup/notes', (s) => s.currentNote)   // dependency → Ref<Note | null | undefined>
   ```

   The selector takes the declared `State`.

   **Absence is typed, not thrown — and only codegen can tell the two cases apart.** Within a pack both
   features ship together and the shell spawns every registered plugin in the step that registers it
   (`application/fe/machine.ts:283`), so a missing one is a bug rather than a state. Across packs the
   dependency's frontend loads asynchronously (`LOAD_PACK_FRONTENDS`), so absence is a state, and the reader
   says so in its return type. `T | undefined` is how a not-yet-loaded resource is typed everywhere else;
   throwing and asking the caller to pre-check with `hasDesignation` (constraint 6) is what would make the
   blessed path a footgun for the reader it exists for. The one-shot twin returns `T | undefined` for a
   dependency and watches nothing; the reactive one re-resolves when the actor appears, which is the same
   question Decision 6 already gives the shell.

   **The SDK's untyped pair is renamed: `useUntypedPluginState` and `readUntypedPluginState`**, staying
   public in `@abuddy/sdk/fe`. The plain name goes to the generated reader, because the plain name belongs on
   the path people should take — the convention this repo already follows three times:

   | typed, `#generated/*` | untyped, `@abuddy/sdk` |
   |---|---|
   | `qx` | `untypedQx` |
   | `tx` | `untypedTx` |
   | `navigateToPlugin` | `openPlugin` |

   `tx`/`untypedTx` is the most recent and was applied for this reason: the untyped write had been exported
   under the same name as the typed one, so `import { tx, untypedQx } from '@abuddy/ears'` read as a matched
   pair when only one half was qualified. The one exception is instructive — the Database console keeps `tx`
   as its REPL global (`database-console/index.ts`, `defs/database.ts`), because that name is a different,
   user-facing API and the two lists must agree.

   `untypedQx` is the closer analogue: what changes is only what the compiler knows, since a dependency's
   `PluginName` *is* its ref string. So the qualifier goes on the reader that gives the types up, and the two
   never collide under one name. The churn is small and already scheduled — the callers are the `fe/public.ts`
   selectors and the three `references.ts` files, every one of which Phase 3 rewrites or deletes.

6. **The shell owns "that plugin isn't here yet" — on both channels.** `_sendToLocalPlugin` reaches past
   the shell into `application.system.get(ref)` and throws. The shell already answers this for `OPEN_PLUGIN`
   with `pendingOpens`. Add `SEND_TO_PLUGIN { plugin, events }` to `HostShell` and route the SDK send through
   it: one owner, not two that disagree.

   The read path has the same hole (constraint 6): `usePluginState` and `readPluginState` both go through
   `pluginActor`, which throws. A read cannot queue — there is no value to hand back — so it gets the other
   half of the same answer: a sibling that returns `undefined`, so callers stop pre-checking with
   `hasDesignation` and the absent case is in the type.

7. **The runtime maps stay one flat union per plugin — for now, and not because they must.** An earlier
   draft said an audience split "is a type-level thing and never a runtime check", reasoning from the
   envelope carrying no sender. That is constraint 1: `Message` is our own interface, and the generated
   `broadcastToPlugin` already closes over the sending pack (`defineEvents(packId)`), so a `from` could be
   *stamped* by the SDK rather than claimed by a caller. The split is checkable; it is merely not checked.

   So: keep one flat union, and say in the doc comments that a passing check means the event's **shape** was
   accepted, not that this sender was allowed to send it. Do not write that a sender-aware check is
   impossible — see Deferred.

## Phases

### Phase 1 — The leaf and the contract

The change everything else rests on, and the only one that closes the cycle.

- `fe/public.ts` → `fe/types.ts` per feature that needs one (Decision 1); move each context out of `state.ts`,
  and export `BrowserContext` and `ThreadsContext`, which are private today. `library` loses its file outright.
- Respell all six `./state`-reaching inboxes structurally, and invert: `state.ts` imports those events from the
  leaf. Narrowing `flows` to the three action events it handles lands **here**, not in Phase 2 — its
  `OutgoingActionEvents` comes from another feature's `be/`, which a leaf may not import at all.
- `declaredTypeOf(file, name)` in `module-exports.ts` (Decision 2); codegen reads each plugin's `Contract`
  type from its leaf. Delete `pluginAccepts` and `PluginAccepts` — nothing replaces them.
- With them goes the reader they existed for: `acceptedEventTypesOf`, its `TypeFlags.Never` branch and the
  `annotated` argument at its call site. `eventTypeLiterals` keeps the parameter only while
  `outgoingEventTypesOf` still passes it; [`goal-contracts-as-types.md`](goal-contracts-as-types.md) removes
  that last caller and assumes this deletion happened here.
- `abuddy.json` gains `features[].plugin.contract` (Decision 2), with `manifest-schema.ts`,
  `generate:schema` and `schema:check`. `library` omits it and gets no leaf.
- `PluginInbox` stays a type helper in `@abuddy/sdk/fe`, constraining the `inbox` half's audiences.
- `state.ts` imports its context from the leaf. Nothing else moves; the machine keeps its generated sends.
- The selectors stay for now on the SDK's untyped `usePluginState`; Phase 3 deletes them.

**Done when:** `npm run typecheck`, `compile`, `schema:check`, `npm test -w @abuddy/sdk`,
`npm test -w @app/default-setup` pass; `git grep pluginAccepts` returns nothing and no SDK export replaced it; `#generated/events` imports
no `fe/plugin.ts`; a `declaredTypeOf` spec covers a type alias, an interface and a missing name; a guard in
`scripts/check-import-specifiers.ts` rejects a leaf importing `./state`, `#generated/events`, `#generated/fe`
or another feature. Mutation, both paths, because either one reopens the cycle: pointing codegen at
`fe/plugin.ts` fails the build, and re-adding one `Extract<XEvents, …>` to a leaf fails the guard.

### Phase 2 — The `pack` audience

- `PluginInbox<{ pack?, public? }>` (Decision 3); `OwnPluginEvents` becomes derived | `pack` | `public`, and
  `PackPluginEvents` narrows to `public`.
- Move the intra-pack UI commands to `pack` — `UPDATE_STATE` first, since it publishes a whole context as a
  write surface. (`flows` was already narrowed in Phase 1, which needed it.)
- The fixture pack gains both cases: a send it may make to a default-setup plugin, and a `@ts-expect-error`
  on one it may not. Nothing external exercises this today.
- The runtime maps stay one flat union per plugin, and their doc comments say what a passing check means —
  the event's shape was accepted, not that this sender was allowed (Decision 7). This is the phase that
  creates the gap between the two, so it is the phase that writes it down.

**Done when:** `npm run typecheck`, `compile`, `test:external-pack` pass; `facade:check` updated;
`UPDATE_STATE`, `terminal.CREATE` and `NOTE.OPEN` are gone from `deps/default-setup.d.ts`, and
`navigateToPlugin` compiles at every in-repo caller. Mutation: moving one event from `pack` to `public` puts it back in that file.

### Phase 3 — The read channel

After Phases 1 and 2.

- `PackPluginState` from each plugin's `State`, added to `generatePackTypes()`; the typed reader and its
  one-shot twin in `#generated/fe` (Decision 5), returning `T` for an own feature and `T | undefined` for a
  dependency's. A context the gate refuses narrows with `Pick<>` (Decision 4) rather than the design changing.
- Rename the SDK's pair to `useUntypedPluginState`/`readUntypedPluginState` (Decision 5), with `api:update`
  and the `etc/` reports committed. The generated pair takes the plain names.
- Delete the selectors from every leaf; migrate the 14 consumers. Four of those edges carry no state at all:
  the step forms import `FormResources`, a plain type `flows/fe/public.ts` re-exports from `./types/form-props`.
  The reader replaces none of it, so it moves to where the forms live or to the SDK's step contract.
- `findCrossFeatureImports`: drop the `fe/public` exception — constraint 5, one line
  (`if (module === 'public') return []`, `check-import-specifiers.ts:530`). It is a hole we punched, not a
  rule we inherited, so the fix is deleting the line, not building a replacement for what it blessed.
  `extensions/tiptap/reference-config.ts`
  re-exports `NOTE_TYPE_TO_REFERENCE_TYPE` across that boundary and needs a home — the tiptap extension, or
  `#generated/references`, which already aggregates reference config.

**Done when:** the full chain passes; no `fe/public.ts` remains; `git grep -w usePluginState` finds it only in
`#generated/fe` and its generator, and `git grep -w useUntypedPluginState` only in `@abuddy/sdk/fe` and its
specs. **Grep the four forms a static-import sweep misses**, all four of which bit the `tx`/`untypedTx` rename
that landed this convention: a multi-line `import {` block, a module that *re-exports* the name (its consumers
then import it from there, not from the SDK), `await import('@abuddy/sdk/fe')` destructuring, and the name
inside a string or a test label. The third is the one to take seriously — **`npm run typecheck` did not catch
a dynamic-import case**, and ten api specs failed at runtime instead. a fixture-pack spec reads a default-setup plugin's state with types, and
a `@ts-expect-error` pins that the dependency read is `T | undefined`. Mutation: re-adding `fe/public` to the exception and importing one cross-feature
makes `check:specifiers` pass again, proving the rule is what rejects it.

### Phase 4 — The shell owns the send paths

- `SEND_TO_PLUGIN` on `HostShell`, answered by the `pendingOpens` path `OPEN_PLUGIN` already uses
  (Decision 6). **Reuse it rather than building a second queue**: `pendingOpens` is already
  `Array<{ plugin: string; events: PluginEvent[] }>` (`application/fe/types.ts:80`) and already delivers on
  arrival and refuses through `notify.error` once loading settles (`machine.ts:252-262`). What it lacks is a
  way in that doesn't also select the plugin — a send must not steal focus, which `OPEN_PLUGIN` does.
- The scope spec the archived goal left open lands here rather than in a phase of its own: it pins the same
  send paths this phase re-owns.
- The read half: a `pluginActor` sibling returning `undefined`, and the `hasDesignation` pre-checks deleted
  at their callers.

**Done when:** `npm test -w @abuddy/host` and `-w @abuddy/sdk` pass; a spec in
`abuddy-host/tests/features/application/fe/` pins that a send to a plugin whose pack is still loading is
delivered once it arrives, and reported through `notify` once loading settles with no such plugin; a read of
an absent plugin returns `undefined` instead of throwing; and the scope spec the archived goal left open
passes — `broadcastToPlugin` reaches **every** window, the renderer's `sendToPlugin` only its own (two windows
in one E2E, or the shell fakes), the half that produced `OPEN_PLUGIN_FROM_APP`. Mutation: dropping the queue
fails the first spec; routing the renderer send through the bus fails the scope spec.

## Outcome (2026-09-23)

Landed on `AS/plugin-contract`. All four phases are implemented; the plan's shape held, with one correction
recorded below. Phases 1–4 went in as `3d79fed34`, with `5a3442700` fixing a review finding in the read channel.

### Per phase
| Phase | Status | Evidence |
|---|---|---|
| 1 — The leaf and the contract | done | `fe/contract.ts` per feature, named at `features[].plugin.contract`; `findContractLeafImports` (`scripts/check-import-specifiers.ts`) walks the closure. Mutation: importing `./state` from a leaf is reported |
| 2 — The `pack` audience | done | `PluginInbox`/`PluginInboxAudiences` (`abuddy-sdk/src/fe/plugin.ts`); `INBOX_AUDIENCES` in `module-exports.ts` rejects an audience that isn't one; `PackPluginEvents` carries only the `public` half |
| 3 — The read channel | done | `usePluginState`/`readPluginState` generated per pack from each contract; `useUntypedPluginState`/`readUntypedPluginState`/`pluginIsRunning` are the untyped escape hatch (`abuddy-sdk/src/fe/plugin-state.ts`, `tests/fe/plugin-state.spec.ts`) |
| 4 — The shell owns the send paths | done | `openPlugin` (`fe/navigation.ts`), `navigateToPlugin` from `#generated/fe`; `fe/public.ts` is gone from pack features, kept only by the host (`HOST_SRC_ROOT`) |

### Corrections to the Decisions
- **The contract had to be a declared type in a leaf, not a typed `definePlugin<E>({…})` call.** Typing the call
  makes TypeScript check its argument, which pulls in the machine, which imports `#generated/events`, which
  imports the contract. The leaf module is what breaks that cycle, and it is why `features[].plugin.contract`
  names a `path#Export` rather than the plugin entry.
- **`usePluginState` kept its name; the SDK's untyped pair was renamed.** The plan left the collision open. The
  generated readers are what pack code should reach for, so they keep the plain name and the SDK's became
  `useUntypedPluginState`/`readUntypedPluginState`, matching `untypedQx`/`untypedTx` in `@abuddy/ears`.

### Open items
- A system's `internal` events are fenced in the type system only: `packSystem` builds a system's runtime
  `receives` from `entry.machine.events`, so the bus still routes an internal event that reaches it another way.
- Two `Deferred` items below are untouched: the sender on `Message`, and `pluginAccepts` for a plugin with no
  system of its own.

### Final verification
`npm run typecheck`, `compile`, `test:unit`, `api:check`, `build`, `test:external-pack`, E2E and
`test:packaged-authoring` all pass on the branch.

## Deferred

1. **`defineSystem`'s audiences** — constraint 4, the system-side twin of Decision 3, and constraint 3
   generalised. **Now planned in [`goal-contracts-as-types.md`](goal-contracts-as-types.md)**, which reads a
   system's contract as a declared type in the `be/types.ts` every feature already has, makes `internal` a
   field rather than a fourth positional type parameter, and retires `satisfies SystemEntry` with it. That
   goal depends on this one's `declaredTypeOf` and should run after it. Nothing here does that work.
2. **A sender on the envelope, and the FE validation map it makes possible** — constraints 1 and 7, which
   are one item: `Message` gains `from`, stamped by the generated send; `PackFEFeature` gains `receives`;
   the bus rejects a cross-pack send of a `pack`-tier event.

   The earlier reason for deferring this — that such a check "could never be audience-aware" — was wrong,
   so the real ones are recorded instead. The bus path is cheap: 8 construction sites, and the sender is
   already in scope. The renderer's in-window `sendToPlugin` is not: it has no scope that names who is
   sending, so either it acquires one or that path stays unchecked, and a rule enforced on one transport
   and not the other is worse than one enforced on neither. Types cover every in-repo case meanwhile.
   **Reopen when** a pack ships compiled against a facade older than the plugin it sends to, or when the
   renderer send acquires a sender to stamp.

## Constraints

- Commit each phase as it finishes, no attribution lines, `git commit -- <paths>`; check `git diff --cached`
  first. Pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows; no real data dirs; E2E in the `abuddy-test` namespace.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no version metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript 5.7 floor, `api:update` after export
  changes with `etc/` committed.
- Build order: `packages:build` before the CLI suite; `compile` before the api suites and E2E. Suites don't
  run concurrently — they share the build lock and stamps.
- Investigate failing tests; mutation-check every new guard.
- External packs are first-class: `tests/fixtures/*` is where the cross-pack send and read are proved.
- Per-phase checks are the narrow ones in "Done when"; the full chain runs once at a phase's end (root
  `CLAUDE.md`, "What to run after a change").
