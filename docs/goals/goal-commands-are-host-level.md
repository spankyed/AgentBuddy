# Goal: the slash-command affordance belongs to the editor, not to threads

```text
# Goal: the slash-command affordance belongs to the editor, not to threads

Implement docs/goals/goal-commands-are-host-level.md. Follow CLAUDE.md and docs/AGENTS.md.
Read Scope, Decisions, Phases and Constraints before continuing.
The survey was made at 672d70800 on master (2026-10-22); inspect current code before relying on it.

Finished when:
- The command suggestion is a built-in editor affordance reading `getPackCommands()`, with no read of
  any surface's state.
- One `CommandItem` shape remains, and it is the SDK's `PackCommand`.
- default-setup still contributes its editable library commands, and still owns reference suggestion.
- `npm run chain` passes.
- Record Outcome, archive this document, repair links and commit closure.

Commit usable checkpoints as you go. Do not expand or reduce scope without user authorization.
```

## Scope

Commands are already a first-class pack contribution: the manifest field `extensions.commands`, the
SDK type `PackCommand`, `getPackCommands()` over the bound registry, and the host registry carrying
them (`packs/registry.ts:327,870`). The **editor affordance** for them is not — it sits in
default-setup and reads one feature's surface state.

Three facts, each verified at `672d70800`:

**1. The extension is already app-wide.** `TiptapEditor.vue` injects every registered pack's extensions
into every editor it renders:

```ts
injectedExtensions: bindings.flatMap(group => Object.values(group.binding.extensions ?? {}))
```

`TiptapEditor` renders in nine directories — notes, library content sections, code canvas, the PR view,
artifact viewers, display blocks and threads. `CommandSuggestion` is live in all of them.

**2. It sources its data from threads.** `command-suggestion.ts` passes
`() => readSurfaceState('threads', s => s.commands)`, and `useCommandItems.ts` reads the same surface.
So an app-wide affordance over a host-level registry is routed through two default-setup features:
library merges the declared commands with its editable ones, threads publishes the result.

**3. That read is not total, though its type says it is.** The generated facade declares `TSelected` and
delegates to the untyped reader, which returns `TSelected | undefined`:

```ts
export function readSurfaceState<…>(name: Name, selector: …): TSelected;   // the overload
export function readSurfaceState(name: SurfaceName, selector: …): unknown {
  return readUntypedSurfaceState(ownSurface(name), …);                      // TSelected | undefined
}
```

A surface is spawned on demand per window, so in a window where threads was never opened,
`getCommands()` is `undefined` and `getCommands().find(…)`
(`command-suggestion.ts`) throws. **This goal removes the instance, not the defect** — see
Decision 5.

**And `CommandItem` is declared twice**, beside the SDK's `PackCommand`, all three structurally
identical (`{ name: string; placeholder: string }`):

| Declaration | Role |
|---|---|
| `PackCommand` (`apack-sdk/src/framework/pack-commands.ts`) | the manifest contribution |
| `CommandItem` (`default-setup/src/extensions/tiptap/command-config.ts`) | the editor's view |
| `CommandItem` (`default-setup/src/features/threads/be/types.ts:439`) | the backend's view |

### What moves

`command-suggestion.ts`, `CommandSuggestionPopup.vue`,
`useCommandItems.ts`, `command-config.ts`.

### What stays in default-setup

**Reference suggestion**, which is genuinely a pack concern — it links threads, library and notes
entities, and only that pack knows them. **The editable command half** — `src/content/library/internal/commands/*.md`, 35 commands
authored as content — stays default-setup's, served by it under the `commands` designation (Decision 1). **`command-viewer-decoration.ts`**, which decorates a rendered command in a
message and is a threads display concern.

## Decisions

### 1. Two layers: declarations are a registry, the store that serves them is a role

**The two sources are not two halves of one list. They have different lifecycles**, which is why
collapsing them loses something:

| source | count | what it is |
|---|---|---|
| `extensions.commands` | 2 (`pr2md`, `instructions`) | pack-declared, and `content/flows/command-listener-flow.ts` branches on `$.event.data.payload.command == 'pr2md'` — there is behaviour behind them |
| library documents | 35 | authored markdown compiled and applied as content, **user-editable**, no behaviour — a catalogue of CLI passthroughs |

So **commands are content**, and the bulk of them already travel the ordinary content path. What is
anomalous is the manifest path: two entries taking a second, parallel mechanism, which
`services.library.commands()` merges at read time.

**Declarations stay additive; the store that serves them gets a designation.** A designation is
exclusive — `createDesignationStore` throws naming both packs when a role is already played — which is
wrong for declarations (every pack may contribute) and exactly right for the store (exactly one feature
can own where editable commands live, and a second claimant would be a bug).

```json
"features": { "library": { "designation": "commands", … } }
```

`extensions.commands` is untouched, so a pack declaring one still needs no dependency on library. One
accessor unions the registry with whatever the designated owner serves, and no caller learns there were
two sources.

**It would be the first designation whose role does not match its feature id.** The contract allows it
outright — *"a role rather than a name: it need not equal the feature id"* — but all four today
(`threads`, `browser`, `brain`, `logs`) happen to match, so there is no precedent. `designation:
"library"` reads more naturally and is worse: it welds "owns the library surface" to "serves commands",
and whatever library owns next inherits the coupling.

**What this explicitly does not do is materialize the declarations into documents at startup.** That
would give one source, which is the tempting part. It would also make `pr2md` a user-deletable row while
the flow handling it stays — deleting the command would not remove the behaviour, and the next content
apply would resurrect it. The asymmetry is the reason there are two sources, so it is the reason to
keep two.

### 2. It lands in `@apackdev/ui`, not `@apackdev/host`

The editor is there, and `@apackdev/ui` may import `@apackdev/sdk` — which is where `getPackCommands()`
lives. It already reads SDK registries the same way (`textEditorExtensionsRegistry` in `TiptapEditor.vue`,
`stepRegistry` in `node-styles.ts`), so this adds no layer edge.

Putting it in `@apackdev/host/fe` would need the host to reach into the editor it does not own, and
packs could not use it without the app.

### 3. It stops being a pack contribution and becomes a built-in

Once it reads `getPackCommands()` it needs nothing from any pack, so it does not go through
`extensions.textEditor`/`extensions.editor` at all. It joins `createExtensions()` beside
`SearchAndFind`, and `TiptapEditor` renders its popup directly as it already renders `TiptapSearchBar`.

That is the simplification worth having: the affordance stops being configuration and becomes part of
the editor, so no pack can fail to declare it and every editor has it.

default-setup's `extensions.textEditor.suggestions` group keeps `referenceSuggestion` and
`commandViewerDecoration`, and loses `commandSuggestion`.

### 4. One shape: `PackCommand`

Both `CommandItem` declarations go. The editor, the popup and threads' backend all name
`PackCommand` from `@apackdev/sdk`. Nothing about the shape changes, so this is a rename with a
deletion, not a contract change.

### 5. The `| undefined` defect is not fixed here

The generated reader's signature is unsound for every typed `readSurfaceState`/`useSurfaceState` caller
in every pack, not only this one. Fixing it is a codegen change plus whatever call sites it newly
breaks, and each of those is a place assuming a surface is running — which is the valuable part and
wants its own change, with its own list.

This goal removes one caller of it. **It must not paper over the rest**: no `?? []` added anywhere to
make a signature look total.

### 6. `isSuggestionActive` splits, and is better for it

It currently ORs the command key and the reference key across two unrelated suggestion systems. After
the move, default-setup's predicate asks only the reference key, and the editor knows its own command
state directly — it owns that key now, so the manifest need not carry a predicate for it.

Check how `declaration-binding` composes the predicate across packs before relying on this
(`apack-host/tests/fe/declaration-binding.spec.ts`, `renderer/tests/runtime/native-editor.spec.ts`).

## Phases

### Phase 1 — the type

**Deliverable.** Both `CommandItem` declarations deleted; `PackCommand` from `@apackdev/sdk` used by the
editor files, the popup, and threads' backend and contract.

**Done when:** `npm run typecheck` passes and `grep -rn 'interface CommandItem' packages/` finds
nothing.

### Phase 2 — the move

**Deliverable.** The five files in Scope moved to
`packages/apack-ui/src/components/tiptap/extensions/command-suggestion.ts` plus its popup, following
the editor-extension convention — one file, the ProseMirror Plugin private, `commandSuggestionKey`
exported. `useCommandItems` reads `getPackCommands()` instead of
`useSurfaceState('threads', …)`.

`createExtensions()` gains it; `TiptapEditor.vue` renders the popup; default-setup's manifest group
drops `commandSuggestion`; `active-suggestions.ts` asks only the reference key.

**Done when:** `npm run typecheck`; `npm run exports:update -w @apackdev/ui` and `api:update` with every
line of the diff a path this phase moved; the editor suites pass —
`default-setup/tests/extensions/tiptap/`, `apack-host/tests/fe/declaration-binding`,
`renderer/tests/runtime/native-editor`, `apack-cli/tests/build/editor-declarations`.

Mutation: the popup opened in a window where threads was never spawned still lists the declared
commands — the behaviour this goal exists for, and the one no current test covers.

### Phase 3 — the designated owner serves the editable half

**Deliverable.** Decision 1: `designation: "commands"` on default-setup's library feature, and one
accessor that unions `getPackCommands()` with the rows the designated owner serves — built on
`getDesignated(role)`, which the registry already resolves to a feature ref. The merge leaves
`services.library.commands()`; the editor reads the accessor and knows of one source.

Library's 35 authored commands keep arriving the way they do now, as content — this phase moves who
assembles the list, not where the documents live.

**Dependencies.** None beyond Phase 2; the accessor can land before or after the editor reads it.

**Done when:** a library-authored command appears in the popup, proven by a spec that writes a command
document and reads the list the editor would show. Mutation: dropping either source from the accessor
fails that spec — which is the check the old shape could not have, both sources being `PackCommand[]`,
so losing one changed no type.

**And a second designated owner is refused**, which is the property the role was chosen for: a spec
registering two packs that both claim `commands` expects the collision `createDesignationStore` throws.

### Phase 4 — docs

**Deliverable.** `docs/public-facing/extensions.md` and `manifest.md` where `textEditor` and
`extensions.commands` are described for a pack author; `packages/apack-ui/CLAUDE.md`'s tiptap section;
`packages/default-setup/CLAUDE.md`'s extensions list.

**Done when:** `doc-links` passes and no guide describes the command suggestion as a pack contribution.

## Constraints

- No `?? []` or other coalesce added to hide Decision 5's unsound signature.
- `extensions.commands` keeps its shape; this moves who reads it, not what a pack declares.
- Reference suggestion is not touched. If a phase wants to, it has found a shared seam worth naming
  rather than a reason to widen scope.
- [`goal-editor-extensions.md`](../archive/goals/goal-editor-extensions.md) has landed, so the move is a
  one-file move: `command-suggestion.ts` holds the extension and its Plugin, and the convention there
  governs where it arrives.
