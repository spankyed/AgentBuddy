> **Written in session** `a1dd708e-4765-423c-a618-93ab4b9131fb` (Claude Code, 2026-09-23). Resume it with `claude -r a1dd708e-4765-423c-a618-93ab4b9131fb`.

```
# Goal: a plugin declares its contract — what may be read of it, and what may be sent to it — by audience

Implement docs/goals/goal-plugin-contract.md, at or after f8f0c4708 — the base its Background was
surveyed at, which is the tip of the plugin-inbox work.
Before Phase 1, confirm the base: packages/abuddy-sdk/src/fe/plugin.ts exports `pluginAccepts`,
packages/abuddy-sdk/src/build/generate-entries.ts emits `PackPluginEvents`,
packages/abuddy-sdk/src/fe/plugin-state.ts exists, and
packages/default-setup/src/features/plugin-handle.ts does NOT. If any of that is wrong, stop and say so —
the plan was surveyed somewhere else. docs/archive/goals/goal-plugin-inbox.md is the work this builds on;
read its Outcome first, especially "Corrections to the Decisions".
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. Phase 1's probes gate Phases 2 and 7; if either fails, stop and report rather
than redesigning.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–7 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- Every feature frontend has an `fe/types.ts` leaf holding its context and inbox, importing nothing
  generated but `#generated/types`; a plugin declares its contract as `definePlugin<State, Inbox>({…})`,
  and `pluginAccepts` and the `PluginAccepts` type no longer exist.
- An inbox declares by audience, `pack` by default and `public` only where written; the 17 intra-pack UI
  commands (terminal.CREATE, NOTE.OPEN, TAB.CREATE, NODE.DOUBLE_CLICK and the rest) are gone from
  tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts.
- `navigateToPlugin` stays typed, and keeps working for every in-repo caller, without those commands
  being published.
- An external pack reads a dependency's plugin state with types, through the generated reader; no pack
  imports another feature's `fe/` at all, and `findCrossFeatureImports` no longer excepts `fe/public`.
- packages/default-setup/src/features/*/fe/public.ts no longer exists.
- npm run typecheck, npm run schema:check, api:check (sdk, ui), facade:check -w @app/default-setup,
  packages:build + packages:check.
- npm run test:unit, npm run compile, npm run build, npm test (E2E), npm run test:external-pack;
  npm start boots clean.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A phase is
  landable on its own; a commit is how that stays true. Conventional message, no Co-Authored-By or session
  lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
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
- point codegen at `plugin.ts` for the contract, or let an `fe/types.ts` leaf import `#generated/events`,
  `#generated/fe` or another feature — either restores the cycle Phase 2 removes (Decision 2).
- split `defineSystem`'s audiences or add the FE runtime validation map — both are Deferred, with the
  conditions that would reopen them.
- publish a plugin's whole context without saying so: `State` is a declared type, and a feature that wants
  less than its context writes `Pick<>` (Decision 5).
```

## Background (2026-09-23, at f8f0c4708 on AS/plugin-inbox)

`goal-plugin-inbox.md` (archived) established the model: a plugin declares what others may send it, and
`sendsTo` is gone. This goal finishes it, on the strength of one finding from that work and one need it
did not serve.

### The inbox has one declared audience, and it is the widest one

Codegen builds a plugin's inbox from two halves (`generate-entries.ts`, `generateEvents`):

```ts
export type OwnPluginEvents = { 'flows': __events_flows | __accepts_flows; … };   // derived | declared
export type PackPluginEvents = { 'flows': __accepts_flows; … };                  // declared → the facade
```

So there are two audiences: **this feature** (its own system's outgoing union, never published) and
**everyone** (whatever the plugin declares). There is nothing in between, and most cross-feature traffic
belongs in between.

`da6a45e91` made that concrete. Typing `navigateToPlugin` from the target's inbox surfaced 17 cross-feature
UI commands nothing declared, each had to be declared, and the only declared tier is the published one — so
they all reach a dependent's facade:

```
tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts
3812:    type: "terminal.CREATE";
3829:    type: "NOTE.OPEN";
```

`terminal.CREATE` is the code plugin routing an event to its own terminal child. `NOTE.OPEN` is the notes
plugin opening a note. Neither is a contract with other packs; both are now in one.

The same pressure shows in what a feature publishes to satisfy a sibling. `flows` declares
`OutgoingActionEvents` — **11 events, where it handles 3** (`features/flows/fe/state.ts:143-145`:
`ACTION_CREATED`, `ACTION_UPDATED`, `ACTION_DELETED`). The wide union is the only way to say "the actions
feature may send me things" when the only declared tier is public, and declaring it drags a cross-feature
`fe/plugin.ts → actions/be/system` import in with it.

### Reading another plugin is a need with no mechanism

`fe/public.ts` is a whole file per feature whose entire job is letting one feature read another's state:

```ts
// extensions/artifacts/viewers/note-artifact.vue
import { useNotes } from '@/features/notes/fe/public'
```

14 such edges remain, 10 of them from `src/extensions/**`. Each `public.ts` is now only selectors —
one-liners over another plugin's context — because the plumbing under them was deleted by the archived goal.

The runtime for this already works **cross-pack**: `usePluginState(ref, selector)`
(`packages/abuddy-sdk/src/fe/plugin-state.ts`) resolves through the shell's registry of running plugins,
which is global to the window and knows nothing about pack boundaries. An external pack can read
default-setup's threads plugin today. The only thing missing is the type, and therefore the discoverability:
the caller annotates the snapshot by hand or gets nothing.

The contexts are plain data and can carry that type:

```ts
export interface NotesContext { notes: NoteDTO[]; currentNote: NoteDTO | null; … }
export interface ActionsContext { actions: ActionEntity[]; page: number; totalPages: number; … }
```

`NoteDTO`, `ActionEntity`, `Category` — no Vue components, no XState internals. `ThreadsContext`
(`features/threads/fe/state.ts:256`) is **not exported** today and would need to be.

### The cycle is a missing leaf, not a missing indirection

The archived goal recorded that a plugin's contract cannot live on `definePlugin`'s argument: typing the
call makes TypeScript check that argument, which holds the machine, which imports `#generated/events`,
which imports the plugin module. `pluginAccepts<E>()` survives only because a no-argument call has no
argument to check.

That is true, and it is a symptom. The cause is **where the context type lives**:

```
__generated__/events.ts  →  fe/plugin.ts  →  fe/state.ts  →  __generated__/events.ts
                             (the contract)   (the machine, and NotesContext)
```

`NotesContext` is declared at `features/notes/fe/state.ts:20` — inside the module that also holds the
machine and imports the generated sends. **No feature has an `fe/types.ts`**; all ten frontend contexts are
declared inside their machines. The backend has `be/types.ts` as a separate module; the frontend never grew
one.

Move each context and each inbox union into a leaf that imports nothing generated, and the generated module
points at that leaf instead of at `plugin.ts`. The chain terminates and the cycle is gone rather than
dodged. `state.ts` keeps importing the sends — that was never the problem.

Three things follow, and they are why this goal starts there:

- `pluginAccepts()` stops being load-bearing. With no cycle, `definePlugin<State, Inbox>({…})` resolves, so
  the contract goes where an author expects it and the SDK loses an export rather than gaining one.
- The tripwire disappears. Today, "simplifying" `accepts` into `definePlugin`'s type parameters breaks the
  build with an error that doesn't name the cycle. Afterwards that simplification is simply correct.
- The read channel gets much safer. Phase 7 needs each context in the facade; a context declared inside the
  machine drags the machine's import graph at the facade gate, and one in a leaf carries only its data types.

The constraint that survives: the generated module must read the contract from the **leaf**, never from
`plugin.ts`, because `plugin.ts` imports the machine to pass it to `definePlugin`. Point codegen back at
`plugin.ts` and the loop returns.

### What is enforceable, and what is not

`Message` is `{ to, event }` (`packages/abuddy-sdk/src/events/index.ts:18`) — **no sender**. So an audience
split is enforceable in types and never at runtime: the validation maps stay one flat union per plugin, and
their job is "does this plugin handle this event at all", not "was this sender allowed". Every decision below
respects that line.

## Decisions

Final.

1. **An inbox declares by audience, and `pack` is the default.**

   ```ts
   PluginInbox<{ pack: … }>            // this pack's other features may send it
   PluginInbox<{ pack: …; public: … }> // …and any pack may send the second set
   ```

   Three audiences result, two of them declared:

   | audience | source | reaches |
   |---|---|---|
   | this feature | *derived* — its own system's outgoing union | nobody else |
   | `pack` | declared | `OwnPluginEvents` — this pack's generated sends |
   | `public` | declared | `PackPluginEvents` → the facade |

   `pack` is the default because publishing should be a word someone typed. A rookie who declares an inbox
   so a sibling can send it must not thereby create API for every dependent pack — which is exactly what
   happened to the 17 commands.

2. **A feature's frontend types live in a leaf, and the contract goes on `definePlugin`.**

   ```ts
   // features/notes/fe/types.ts — imports nothing generated
   export interface NotesContext { notes: NoteDTO[]; currentNote: NoteDTO | null; … }
   export type NotesInbox = PluginInbox<{ pack: { type: 'NOTE.OPEN'; noteId: string } }>
   ```
   ```ts
   // features/notes/fe/plugin.ts
   export default definePlugin<NotesContext, NotesInbox>({ label, icon, state, canvas, panel, settings })
   ```

   `pluginAccepts` and the `PluginAccepts` type are **deleted**, not widened. They exist only to dodge the
   cycle, and the leaf removes the cycle (Background). Codegen reads the contract from `fe/types.ts`.

   Two rules this decision rests on, both load-bearing:
   - **Codegen must read the leaf, never `plugin.ts`.** `plugin.ts` imports the machine to pass it to
     `definePlugin`, so pointing the generated module back at it restores the loop.
   - **`fe/types.ts` imports nothing generated.** It may import `#generated/types` (itself a leaf of
     backend types) and its own feature's `be/types`, and nothing else from `#generated/*`.

   What this replaces, and why each alternative is worse now:
   - **A named `accepts` export from a no-argument call** (today's shape) — works, but only by avoiding
     argument-checking. It survives a cycle instead of removing one, and reads as indirection with no
     visible cause.
   - **A separate `fe/contract.ts` named in the manifest** — the leaf makes the extra file and the manifest
     field unnecessary; the types have to move anyway, and `types.ts` is where a reader looks for them.
   - **Two bare type exports read by convention** — two magic names where the call site can carry both.

3. **`State` is what any feature or pack may read of the plugin.** Codegen emits `PackPluginState`
   (feature id → `State`) beside `PackPluginEvents`, and it joins the facade, so a dependent's
   `deps/<id>.d.ts` carries it. One audience only: a read is either offered or it isn't, and nothing in the
   14 edges wants a pack-private read that a dependent couldn't have.

4. **`#generated/fe` gains the typed reader.** Keyed by `PluginName`, resolving own features to their own
   `State` and a dependency's to what its facade carries:

   ```ts
   usePluginState('default-setup/notes', (s) => s.currentNote)   // fully typed, in any pack
   ```

   The selector takes the declared `State`, not the XState snapshot. Code that needs the state *value* or
   tags keeps the SDK's untyped `usePluginState`, which is the escape hatch — the same relation
   `untypedQx` has to `#generated/ears`, and `openPlugin` to `navigateToPlugin`.

5. **`State` defaults to the whole context, and narrowing is one line.**
   `definePlugin<NotesContext, NotesInbox>({…})` publishes the context, which is the blessed path and what a
   pack author reaches for. A feature that wants a contract narrower than its context writes
   `Pick<NotesContext, 'notes' | 'currentNote'>`.

   **This makes context fields API.** `ActionsContext.page`, `NotesContext.pendingSubDocumentInsert` and
   the rest become names a dependent pack can depend on, so renaming one is a breaking change. That is the
   price of complete access, and it is taken deliberately rather than discovered: the `Pick<>` escape is
   how a feature opts out per-feature.

6. **`fe/public.ts` is deleted, and the rule that excepted it gets shorter.** Its selectors become direct
   typed reads at the call site. `findCrossFeatureImports`
   (`scripts/check-import-specifiers.ts`) currently permits `features/<x>/fe/public` as the one legal
   cross-feature import; afterwards **no feature imports another feature's `fe/` at all**. Reads go through
   the generated reader, sends through the generated send.

7. **The shell owns "that plugin isn't here yet", not the SDK.** `_sendToLocalPlugin` reaches past the shell
   into `boundFeHost().application.system.get(ref)` and throws. The shell already answers this for
   `OPEN_PLUGIN` with `pendingOpens` — queue while the target pack's frontend is still loading, report
   through `notify` once loading settles. Add `SEND_TO_PLUGIN { plugin, events }` to `HostShell` and route
   the SDK send through it, so one owner decides, not two that disagree.

8. **Nothing about the runtime check changes.** The maps stay one flat union per plugin and their doc
   comments say why (no sender on the envelope), so a passing check is never read as "this sender was
   allowed".

## Phases

### Phase 1 — Two probes

The first gates Phase 2, the second Phase 7. Neither writes production code; both record their result in this doc
under `## Spike results (YYYY-MM-DD)`.

- **The leaf breaks the cycle.** Extract one feature's context and inbox into `fe/types.ts`, point codegen
  at it, and read the contract off `definePlugin<Context, Inbox>({…})` with `createModuleExports` over the
  real plugin entries — the harness that caught the original failure. This is the assumption Phase 2 and
  Decision 2 rest on, and the archived goal's Outcome says why it is not obvious. Do `notes` first: it has
  the smallest context and already declares an inbox.
- **Facade weight and safety.** Add the 10 context types to `pack-types.ts` by hand, run `abuddy build` and
  `facadeProblems`. Record: do they pass the gate, and by how many lines does `dist/types/pack-types.d.ts`
  grow from its current size. `ThreadsContext` is not exported today; note every context that needs
  exporting or narrowing.

**Done when:** both results are in this doc with the commands used, and the probe changes are reverted
(`git status` clean apart from this doc).

### Phase 2 — A types leaf per feature frontend

The change every later phase rests on, and the only one that is purely mechanical.

- `features/<id>/fe/types.ts` for each of the ten features whose context is declared inside its machine
  (`actions`, `brain`, `browser`, `database`, `flows`, `library`, `logs`, `notes`, `prompts`, `threads`).
  Move the context interface and any event unions the contract names; export `ThreadsContext`, which is not
  exported today (`features/threads/fe/state.ts:256`).
- `state.ts` imports its context from there. Nothing else moves: the machine keeps importing the generated
  sends, which was never the problem.
- The leaf imports nothing from `#generated/*` except `#generated/types`, and nothing from another feature.

**Done when:** `npm run typecheck`, `npm run compile`, `npm test -w @app/default-setup` pass with no
behaviour change; every `fe/types.ts` is free of `#generated/events`, `#generated/fe` and cross-feature
imports, and a guard in `scripts/check-import-specifiers.ts` says so. Mutation: adding
`import { sendToSystem } from '@/__generated__/events'` to one leaf fails that guard.

### Phase 3 — The `pack` audience

- `PluginInbox<{ pack?, public? }>` in `@abuddy/sdk/fe` (Decision 1).
- `generate-entries.ts`: `OwnPluginEvents` becomes derived | `pack` | `public`; `PackPluginEvents` narrows
  to `public`.
- Move the 17 UI commands from published to `pack`, and narrow `flows` from `OutgoingActionEvents` to the
  three events it handles — which removes the `fe/plugin.ts → actions/be/system` import with it.

**Done when:** `npm run typecheck`, `npm run compile`, `npm test -w @abuddy/sdk`, `npm run test:external-pack`
pass; `facade:check -w @app/default-setup` updated and committed; **`terminal.CREATE` and `NOTE.OPEN` no
longer appear in `tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts`**, and
`navigateToPlugin` still compiles at every in-repo caller. Mutation: moving one event from `pack` to
`public` puts it back in that file.

### Phase 4 — One contract per plugin

After Phase 2, which is what makes this possible.

- `definePlugin<State, Inbox>({…})` carries the contract; codegen reads both halves from `fe/types.ts`
  (Decision 2). **Delete** `pluginAccepts` and the `PluginAccepts` type — they exist only to dodge the
  cycle Phase 2 removed.
- `State` may resolve to `unknown` until Phase 7 uses it; the parameter lands now so the plugins are
  migrated once.
- Migrate all eleven plugins, and the CLI's `abuddy add feature` scaffold with them.

**Done when:** `npm run typecheck`, `npm run compile`, `npm test -w @abuddy/sdk`, `npm test -w @abuddy/cli`
pass; `api:update` run in `packages/abuddy-sdk` with `etc/` committed; `git grep pluginAccepts` returns
nothing. Mutation: pointing codegen at `plugin.ts` instead of `fe/types.ts` restores the cycle and fails the
build — the check that Phase 2's rule is what holds, not luck.

### Phase 5 — The shell owns waiting

- `SEND_TO_PLUGIN { plugin, events }` on `HostShell`, answered by the same `pendingOpens` path as
  `OPEN_PLUGIN` (Decision 7); `_sendToLocalPlugin` sends it instead of reaching for the actor.

**Done when:** `npm test -w @abuddy/host` and `npm test -w @abuddy/sdk` pass; a spec in
`packages/abuddy-host/tests/features/application/fe/` pins that a send to a plugin whose pack is still
loading is delivered once it arrives, and reported through `notify` once loading settles with no such
plugin. Mutation: dropping the queue makes that spec fail rather than the send silently throwing.

### Phase 6 — The spec the archived goal left open

- Pin that a backend `broadcastToPlugin` reaches **every** window and a renderer `sendToPlugin` reaches only
  its own — the half that produced `OPEN_PLUGIN_FROM_APP`. Two windows in one E2E, or the shell fakes in
  `packages/abuddy-host/tests/fe/shell/`.

**Done when:** the spec passes and fails when the renderer send is routed through the bus.

### Phase 7 — The read channel

After Phase 1's facade probe and Phase 4.

- `PackPluginState` emitted from each plugin's `State`, added to `generatePackTypes()` (Decision 3). A
  feature whose context the facade gate refuses narrows its `State` with `Pick<>` rather than the design
  changing (Decision 5).
- The typed reader in `#generated/fe` (Decision 4), with `readPluginState`'s one-shot twin.
- Delete every `features/*/fe/public.ts`; migrate its 14 consumers to the reader.
- `findCrossFeatureImports`: drop the `public` exception, so no feature imports another's `fe/`
  (Decision 6). Update its failure message and `packages/default-setup/CLAUDE.md`.

**Done when:** `npm run typecheck`, `npm run check:specifiers`, `npm run test:unit`, `npm run compile`,
`npm run build`, `npm test` (E2E), `npm run test:external-pack` pass; `facade:check` and `api:check` updated;
no `fe/public.ts` remains; a fixture pack reads a default-setup plugin's state with types, and that read is
in `tests/fixtures/external-pack`. Mutation: re-adding `fe/public` to the exception list and importing one
cross-feature makes `check:specifiers` pass again, proving the rule is what rejects it.

## Deferred

Both were cut from the archived goal and stay cut. Each has the condition that would reopen it.

- **`defineSystem`'s audiences.** A system declares `Incoming | Internal` as one union and publishes both, so
  a declared-internal event reaches every dependent's facade (`ADD_LOG`, from a `fromCallback` child that
  nothing outside the machine can legitimately send). Two call sites distinguish internal today
  (`features/logs/be/system.ts:40`, `features/database/be/system.ts:58`), but the type parameter changes for
  all twelve. **Reopen when** a second pack ships and its authors can see another pack's internal system
  events in their completions — that is when the cost of the leak becomes the cost of the confusion.
- **The FE runtime validation map.** `PackFEFeature` gains no `receives`. Types cover every in-repo case, and
  the check could never be audience-aware anyway (Decision 8). **Reopen when** packs version independently
  enough that a dependent can be compiled against a facade older than the plugin it sends to — then a
  dropped send needs reporting, not silence.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines; check `git diff --cached`
  first and use `git commit -- <paths>`. Pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows.
- No real data dirs, no broad pkill, E2E in the `abuddy-test` namespace with an isolated
  `ABUDDY_USER_DATA_DIR`.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no version or release metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript 5.7 floor, `npm run api:update` after
  export changes with `etc/` committed.
- Build order: `packages:build` before the CLI suite; `npm run compile` before the api suites and E2E.
  Suites don't run concurrently — they share the package build lock and build stamps.
- Investigate failing tests; mutation-check every new guard.
- External packs are first-class: `tests/fixtures/*`, the example pack and `test:packaged-authoring` keep
  passing, and the fixture pack is where the cross-pack read is proved.
- Per-phase checks are the narrow ones named in "Done when"; the full chain runs once at the end of a phase,
  in the background (root `CLAUDE.md`, "What to run after a change").
