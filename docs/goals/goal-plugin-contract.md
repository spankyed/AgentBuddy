> **Written in session** `a1dd708e-4765-423c-a618-93ab4b9131fb` (Claude Code, 2026-09-23). Resume it with `claude -r a1dd708e-4765-423c-a618-93ab4b9131fb`.

```
# Goal: a plugin declares one contract — what may be read of it, and what may be sent to it

Implement docs/goals/goal-plugin-contract.md, at or after 8126ae364 on AS/plugin-inbox — the base its
Background and Spike results were taken at.
Before Phase 1, confirm the base: packages/abuddy-sdk/src/fe/plugin.ts exports `pluginAccepts`,
packages/abuddy-sdk/src/build/module-exports.ts exports `acceptedEventTypesOf`, and every
packages/default-setup/src/features/*/fe/public.ts still exists. If any of that is wrong, stop and say so.
docs/archive/goals/goal-plugin-inbox.md is the work this builds on; read its Outcome first.
Read Background, Spike results, Decisions, Phases and Constraints. Decisions are final: implement them,
don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- No `features/*/fe/public.ts` remains; each feature frontend has an `fe/types.ts` leaf holding its
  context, its `Contract` type and any plain data, importing nothing from `#generated/*` but `types` and
  `ears`. `pluginAccepts` and `PluginAccepts` no longer exist, and nothing replaces them.
- `#generated/events` imports the leaf, never `fe/plugin.ts`.
- The 17 intra-pack UI commands (terminal.CREATE, NOTE.OPEN, TAB.CREATE, NODE.DOUBLE_CLICK and the rest)
  are gone from tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts, and
  `navigateToPlugin` still compiles at every in-repo caller.
- An external pack reads a dependency's plugin state with types, proved in tests/fixtures/external-pack.
- `findCrossFeatureImports` no longer excepts `fe/public`: no feature imports another feature's `fe/`.
- npm run typecheck, schema:check, api:check (sdk, ui), facade:check -w @app/default-setup,
  packages:build + packages:check.
- npm run test:unit, compile, build, npm test (E2E), test:external-pack; npm start boots clean.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files. Check
  `git diff --cached` first.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- give the contract a runtime value (a `pluginContract()`-style call carrying phantoms), or read it from
  `fe/plugin.ts` — the first is ceremony a type alias makes unnecessary, the second restores the cycle
  (Spike results).
- split `defineSystem`'s audiences or add an FE runtime validation map — both Deferred, with triggers.
```

## Background (2026-09-23, at 8126ae364 on AS/plugin-inbox)

`goal-plugin-inbox.md` (archived) landed the model: a plugin declares what others may send it, `sendsTo` is
gone, `plugin-handle.ts` is deleted. Two things it left are what this goal is for.

**One declared audience, and it is the widest.** A plugin's inbox is its own system's outgoing union
(derived, never published) unioned with whatever it declares (published). Nothing sits between. So when
`da6a45e91` typed `navigateToPlugin`, the 17 cross-feature UI commands it surfaced had nowhere to go but the
published tier, and they now reach every dependent:

```
tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts
3812:    type: "terminal.CREATE";      // the code plugin routing to its own terminal child
3829:    type: "NOTE.OPEN";            // the notes plugin opening a note
```

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

## Decisions

Final.

1. **`fe/public.ts` becomes `fe/types.ts`: the same file, inverted.** Out go the selectors (codegen replaces
   them), `usePluginState`, the `featureRef` constants (the generated reader is keyed by `PluginName`, not by
   ref) and the `./state` import. In come the context interface and the contract. Plain data it already holds
   stays put.

   The leaf imports nothing from `#generated/*` but `types` and `ears` — contexts need both (`NoteDTO`,
   `EARS.EntityId`) and neither reaches `#generated/events`. It imports no other feature.

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

3. **Sends declare by audience; `pack` is the default.**

   | audience | source | reaches |
   |---|---|---|
   | this feature | derived — its own system's outgoing union | nobody else |
   | `pack` | declared | `OwnPluginEvents` — this pack's sends |
   | `public` | declared | `PackPluginEvents` → the facade |

   Publishing should be a word someone typed. A rookie declaring an inbox so a sibling can send it must not
   thereby create API for every dependent — which is exactly what happened to the 17 commands.

4. **Reads are public by default, and narrow with `Pick<>`.** `State` is the whole context. The asymmetry
   with Decision 3 is deliberate, and this is the reason: **a send changes behaviour, a read does not**, and
   discoverability is the point — an external pack that gets nothing by default defeats the goal.

   It makes context fields API, so renaming one is a breaking change for dependents. A feature that wants
   less writes `Pick<ActionsContext, 'actions'>` — which is also the answer for `page`, `totalPages` and
   `loadingMore`, the `code` panel's read of `actions`' paging that no dependent should see.

5. **`PackPluginState` joins the facade, and `#generated/fe` gains the typed reader**, keyed by `PluginName`,
   resolving own features to their `State` and a dependency's to what its facade carries:

   ```ts
   usePluginState('default-setup/notes', (s) => s.currentNote)   // typed, in any pack
   ```

   The selector takes the declared `State`. Code needing the XState snapshot keeps the SDK's untyped
   `usePluginState` — the escape hatch, as `untypedQx` is to `#generated/ears`.

6. **The shell owns "that plugin isn't here yet".** `_sendToLocalPlugin` reaches past the shell into
   `application.system.get(ref)` and throws. The shell already answers this for `OPEN_PLUGIN` with
   `pendingOpens`. Add `SEND_TO_PLUGIN { plugin, events }` to `HostShell` and route the SDK send through it:
   one owner, not two that disagree.

7. **The runtime maps stay one flat union per plugin.** `Message` is `{ to, event }` — no sender — so an
   audience split is a type-level thing and never a runtime check. Say so in the doc comments, so a passing
   check is never read as "this sender was allowed".

## Phases

### Phase 1 — The leaf and the contract

The change everything else rests on, and the only one that closes the cycle.

- `fe/public.ts` → `fe/types.ts` per feature (Decision 1); move each context out of `state.ts`, and export
  `BrowserContext` and `ThreadsContext`, which are private today.
- `declaredTypeOf(file, name)` in `module-exports.ts` (Decision 2); codegen reads each plugin's `Contract`
  type from its leaf. Delete `pluginAccepts` and `PluginAccepts` — nothing replaces them.
- `PluginInbox` stays a type helper in `@abuddy/sdk/fe`, constraining the `inbox` half's audiences.
- `state.ts` imports its context from the leaf. Nothing else moves; the machine keeps its generated sends.
- The selectors stay for now on the SDK's untyped `usePluginState`; Phase 3 deletes them.

**Done when:** `npm run typecheck`, `compile`, `npm test -w @abuddy/sdk`, `npm test -w @app/default-setup`
pass; `git grep pluginAccepts` returns nothing and no SDK export replaced it; `#generated/events` imports
no `fe/plugin.ts`; a `declaredTypeOf` spec covers a type alias, an interface and a missing name; a guard in
`scripts/check-import-specifiers.ts` rejects a leaf importing `#generated/events`, `#generated/fe` or another
feature. Mutation: pointing codegen at `fe/plugin.ts` restores the cycle and fails the build — the check that
Decision 2's rule is what holds.

### Phase 2 — The `pack` audience

- `PluginInbox<{ pack?, public? }>` (Decision 3); `OwnPluginEvents` becomes derived | `pack` | `public`, and
  `PackPluginEvents` narrows to `public`.
- Move the 17 UI commands to `pack`; narrow `flows` to its three action events, which removes the
  cross-feature `be/system` import with it.
- The fixture pack gains both cases: a send it may make to a default-setup plugin, and a `@ts-expect-error`
  on one it may not. Nothing external exercises this today.

**Done when:** `npm run typecheck`, `compile`, `test:external-pack` pass; `facade:check` updated;
`terminal.CREATE` and `NOTE.OPEN` are gone from `deps/default-setup.d.ts`, and `navigateToPlugin` compiles at
every in-repo caller. Mutation: moving one event from `pack` to `public` puts it back in that file.

### Phase 3 — The read channel

After Phases 1 and 2.

- `PackPluginState` from each plugin's `State`, added to `generatePackTypes()`; the typed reader and its
  one-shot twin in `#generated/fe` (Decision 5). A context the gate refuses narrows with `Pick<>`
  (Decision 4) rather than the design changing.
- Delete the selectors from every leaf; migrate the 14 consumers.
- `findCrossFeatureImports`: drop the `fe/public` exception. `extensions/tiptap/reference-config.ts`
  re-exports `NOTE_TYPE_TO_REFERENCE_TYPE` across that boundary and needs a home — the tiptap extension, or
  `#generated/references`, which already aggregates reference config.

**Done when:** the full chain passes; no `fe/public.ts` remains; a fixture-pack spec reads a default-setup
plugin's state with types. Mutation: re-adding `fe/public` to the exception and importing one cross-feature
makes `check:specifiers` pass again, proving the rule is what rejects it.

### Phase 4 — The shell owns waiting

- `SEND_TO_PLUGIN` on `HostShell`, answered by the same `pendingOpens` path as `OPEN_PLUGIN` (Decision 6).

**Done when:** `npm test -w @abuddy/host` and `-w @abuddy/sdk` pass; a spec in
`abuddy-host/tests/features/application/fe/` pins that a send to a plugin whose pack is still loading is
delivered once it arrives, and reported through `notify` once loading settles with no such plugin. Mutation:
dropping the queue fails that spec.

### Phase 5 — The scope spec the archived goal left open

- Pin that `broadcastToPlugin` reaches **every** window and the renderer's `sendToPlugin` only its own — the
  half that produced `OPEN_PLUGIN_FROM_APP`. Two windows in one E2E, or the shell fakes.

**Done when:** it passes, and fails when the renderer send is routed through the bus.

## Deferred

- **`defineSystem`'s audiences.** A system publishes its internal events too (`ADD_LOG`, from a
  `fromCallback` child nothing outside can legitimately send). Two specs distinguish internal today
  (`logs/be/system.ts:40`, `database/be/system.ts:58`) but the type parameter changes for all twelve.
  **Reopen when** a second pack ships and its authors see another pack's internal system events in their
  completions.
- **An FE runtime validation map.** `PackFEFeature` gains no `receives`. Types cover every in-repo case and
  the check could never be audience-aware (Decision 7). **Reopen when** packs version independently enough
  that a dependent can be compiled against a facade older than the plugin it sends to.

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
