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

**2. It sources its data from threads.** `command-extension.ts` passes
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
(`command-suggestion-plugin.ts:136`) throws. **This goal removes the instance, not the defect** — see
Decision 4.

**And `CommandItem` is declared twice**, beside the SDK's `PackCommand`, all three structurally
identical (`{ name: string; placeholder: string }`):

| Declaration | Role |
|---|---|
| `PackCommand` (`apack-sdk/src/framework/pack-commands.ts`) | the manifest contribution |
| `CommandItem` (`default-setup/src/extensions/tiptap/command-config.ts`) | the editor's view |
| `CommandItem` (`default-setup/src/features/threads/be/types.ts:439`) | the backend's view |

### What moves

`command-extension.ts`, `command-suggestion-plugin.ts`, `CommandSuggestionPopup.vue`,
`useCommandItems.ts`, `command-config.ts`.

### What stays in default-setup

**Reference suggestion**, which is genuinely a pack concern — it links threads, library and notes
entities, and only that pack knows them. **The editable command half**: `services.library.commands()`
merges `getPackCommands()` with `src/content/library/internal/commands/*.md`, and those documents are
default-setup's content. **`command-viewer-decoration.ts`**, which decorates a rendered command in a
message and is a threads display concern.

## Decisions

### 1. It lands in `@apackdev/ui`, not `@apackdev/host`

The editor is there, and `@apackdev/ui` may import `@apackdev/sdk` — which is where `getPackCommands()`
lives. It already reads SDK registries the same way (`textEditorExtensionsRegistry` in `TiptapEditor.vue`,
`stepRegistry` in `node-styles.ts`), so this adds no layer edge.

Putting it in `@apackdev/host/fe` would need the host to reach into the editor it does not own, and
packs could not use it without the app.

### 2. It stops being a pack contribution and becomes a built-in

Once it reads `getPackCommands()` it needs nothing from any pack, so it does not go through
`extensions.textEditor`/`extensions.editor` at all. It joins `createExtensions()` beside
`SearchAndFind`, and `TiptapEditor` renders its popup directly as it already renders `TiptapSearchBar`.

That is the simplification worth having: the affordance stops being configuration and becomes part of
the editor, so no pack can fail to declare it and every editor has it.

default-setup's `extensions.textEditor.suggestions` group keeps `referenceSuggestion` and
`commandViewerDecoration`, and loses `commandSuggestion`.

### 3. One shape: `PackCommand`

Both `CommandItem` declarations go. The editor, the popup and threads' backend all name
`PackCommand` from `@apackdev/sdk`. Nothing about the shape changes, so this is a rename with a
deletion, not a contract change.

### 4. The `| undefined` defect is not fixed here

The generated reader's signature is unsound for every typed `readSurfaceState`/`useSurfaceState` caller
in every pack, not only this one. Fixing it is a codegen change plus whatever call sites it newly
breaks, and each of those is a place assuming a surface is running — which is the valuable part and
wants its own change, with its own list.

This goal removes one caller of it. **It must not paper over the rest**: no `?? []` added anywhere to
make a signature look total.

### 5. `isSuggestionActive` splits, and is better for it

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
`goal-editor-extensions.md`'s convention if that has landed — one file, the ProseMirror Plugin private,
`commandSuggestionKey` exported. `useCommandItems` reads `getPackCommands()` instead of
`useSurfaceState('threads', …)`.

`createExtensions()` gains it; `TiptapEditor.vue` renders the popup; default-setup's manifest group
drops `commandSuggestion`; `active-suggestions.ts` asks only the reference key.

**Done when:** `npm run typecheck`; `npm run exports:update -w @apackdev/ui` and `api:update` with every
line of the diff a path this phase moved; the editor suites pass —
`default-setup/tests/extensions/tiptap/`, `apack-host/tests/fe/declaration-binding`,
`renderer/tests/runtime/native-editor`, `apack-cli/tests/build/editor-declarations`.

Mutation: the popup opened in a window where threads was never spawned still lists the declared
commands — the behaviour this goal exists for, and the one no current test covers.

### Phase 3 — the editable half still arrives

**Deliverable.** default-setup's library commands reach the editor.

`services.library.commands()` seeds a Map from `getPackCommands()` and then adds one command per
`field.key`/`field.value` pair in every library document under the commands folder (`inCommandsFolder`,
`library.ts:115`). **That half is user-editable content** — a user adds a slash command by editing a
library document — so an editor reading only `getPackCommands()` silently loses the feature. Decide and
implement: either those documents register as pack commands, or the editor takes a declared second
source.

**This phase is the one that can silently lose a feature, and a typecheck cannot see it**: both sources
are `PackCommand[]`, so dropping one changes no type.

**Done when:** a library-authored command appears in the popup, proven by a spec that writes one and
reads the list the editor would show.

### Phase 4 — docs

**Deliverable.** `docs/public-facing/extensions.md` and `manifest.md` where `textEditor` and
`extensions.commands` are described for a pack author; `packages/apack-ui/CLAUDE.md`'s tiptap section;
`packages/default-setup/CLAUDE.md`'s extensions list.

**Done when:** `doc-links` passes and no guide describes the command suggestion as a pack contribution.

## Constraints

- No `?? []` or other coalesce added to hide Decision 4's unsound signature.
- `extensions.commands` keeps its shape; this moves who reads it, not what a pack declares.
- Reference suggestion is not touched. If a phase wants to, it has found a shared seam worth naming
  rather than a reason to widen scope.
- Ordering against [`goal-editor-extensions.md`](../archive/goals/goal-editor-extensions.md): that goal's Phase 2 merges
  `command-extension.ts` and `command-suggestion-plugin.ts` into one file. Landing it first makes this a
  one-file move; landing this first makes that goal's merge table one row shorter. Either order works;
  doing both at once does not.
