# Goal: the slash-command affordance belongs to the editor, not to threads

```text
# Goal: the slash-command affordance belongs to the editor, not to threads

Implement docs/goals/goal-commands-are-host-level.md. Follow CLAUDE.md and docs/AGENTS.md.
Read Scope, Decisions, Phases and Constraints before continuing.
Surveyed at 672d70800 and re-verified at 8cb7e7b20, after goal-editor-extensions merged and moved
some of the paths this names; inspect current code before relying on it.

Finished when:
- The command suggestion is a built-in editor affordance that asks whichever feature plays the
  `commands` designation, with no read of any surface's state and no hardcoded pack.
- Commands enter through one door — a content source — and `extensions.commands` is gone.
- One `CommandItem` shape remains, and it is the SDK's `PackCommand`.
- default-setup still owns the commands it ships, and still owns reference suggestion.
- `npm run chain` passes.
- Record Outcome, archive this document, repair links and commit closure.

Commit usable checkpoints as you go. Do not expand or reduce scope without user authorization.
```

## Outcome (2026-10-22)

**Done.** A command is content a pack ships, served by whichever feature plays the `commands`
designation, and published to the shell so an editor in any window offers the list whatever surface is
open. `extensions.commands` is gone; so is every read of a surface's state for it.

| Phase | Commit | Evidence |
|---|---|---|
| 1 — one shape | `13cdd77e5` | One `PackCommand`, the SDK's; `CommandItem` gone |
| 2 — one door, and the role that serves it | `2f3f5ca06`, `8922af1a2` | The content source, the designation, the provider; `extensions.commands`, its schema and `getPackCommands` deleted |
| 3 — the move | `361969c75` | The suggestion in `@apackdev/ui`, config-gated to `input:chat`; threads' actor, memo and events stripped. Mutation: removing `sendCommands` from `SEND_STATE` fails three cases |
| 4 — docs | `62287438f` | `content.md`'s section rewritten, the manifest row replaced by `features.<id>.getCommands`, four guides off `getPackCommands` |

**What the review and the gate then changed, which is the part worth reading.** Four of these were
defects the phases had introduced and two were mine in sequencing:

| Change | Commit | Why |
|---|---|---|
| Escape stays with the open suggestion | `d61a7849c` | The editor composed `isSuggestionActive` from contributed groups only, so a built-in had nothing to speak for it: Escape paused the turn instead of closing the popup. No case covered Escape, which is why it slipped |
| Only the role's feature may declare the provider | `5dcc627b8` | Codegen took `declared[0]` and the registry checked the *pack*, so a second provider lost to manifest order and a feature without the role could be served |
| The role resolves to the feature that answers | `13f5511e0` | The manifest declared the provider per feature and the registration carried it per pack, so the ref was mined for a `packId`. That mismatch is what the claim check was reconciling; both failure modes are gone rather than guarded |
| One place decides the list moved | `334ccad9c` | Ten library handlers each compared the whole list before and after a write. `libraryCommands` announces its writes; one watcher compares |
| A command is a document with a type | `bde1deb16`, `54762313f` | The format defaults `documentType` — so a file in the commands source cannot omit it, *and* a library document that declares it is served. The first framing stamped it, which wrongly made the second impossible |
| The document type is declared once | `7c33139ad` | Writer and reader spelled the literal separately |
| The exports map keeps its own order | `4900457f9` | A json round-trip alphabetised all 34 keys; `published-exports` reads the non-code entries in order |

**Authoring, which the goal did not ask for and the design argued into.** Removing the manifest key left
a pack hand-writing a directory, a format reference and a field-section convention. `apack pack add
command` and `add document` (`ed3fec238`, `f50d61ee9`, `12cf0fe22`, `ad98fb23f`) write the markdown and
declare the source; `--content` takes a body and `add command` appends into a document already there,
because an agent runs these and scaffold-then-edit is two steps where one does. That last one is the
only scaffold here that writes into an existing file, and `add/write.ts`'s header states the bent rule
rather than denying it.

**Three things deferred rather than left in a conversation**, each with its revisit condition:
[`document-in-the-core`](../../plans/deferred/document-in-the-core.md) (whose second trigger is wanting
`extensions.commands` back — this move is what makes it buildable),
[`pack-published-app-facts`](../plans/pack-published-app-facts.md) and
[`the-empty-library-source`](../../plans/deferred/the-empty-library-source.md), which records why the
obvious fix for it is wrong. A `Command` entity is dropped for good.

**`npm run chain -- --strict` passes on `ad98fb23f`**: 31 steps ok, 0 failed, 1 cached — effectively a
cold run, with no step caveated as having read files that changed while it ran. `test:native` was the
critical path at 297s.

**Two lessons about running the gate, which cost four runs.** A pack's own `CLAUDE.md` is inside the
pack compiler's captured namespace, so editing one mid-run invalidates the build inputs an integration
spec checks — `docs/` is outside every pack and safe, a pack-local guide is not. And stopping a chain
with a kill while `test:native` runs leaves its lock in the container's own `node_modules` volume,
naming a pid and hostname the host can only ever read as held; it never clears itself. Both are in
[pipeline-lessons.md](../references/pipeline-lessons.md#validation-loops)'s territory, and
`--strict` is what turns the first into a refusal rather than a green run that describes another tree.

## Scope

Commands enter the app through **two doors, one of which skips the machinery the other uses**, and the
editor affordance for them sits in default-setup reading one feature's surface state.

The manifest declares, for every other content concept, **where the content is — not what the entities
are**: `content.sources: ["actions"]` plus a format, compiled, applied, queried. One path, one store,
with three-way merge and offers over it. `extensions.commands` is the anomaly: it declares two entities
*inline in the manifest*, bypassing that pipeline, while 35 more arrive as library content. The problem
was never that there are two sources to merge — it is that one of them is not content.

Three facts, each re-verified at `8cb7e7b20`:

**1. The extension is already app-wide.** `TiptapEditor.vue` injects every registered pack's extensions
into every editor it renders:

```ts
injectedExtensions: bindings.flatMap(group => Object.values(group.binding.extensions ?? {}))
```

`TiptapEditor` renders in nine directories — notes, library content sections, code canvas, the PR view,
artifact viewers, display blocks and threads. `CommandSuggestion` is live in all of them.

**2. It sources its data from threads.** `command-suggestion.ts` passes
`() => readSurfaceState('threads', s => s.commands)`, and `useCommandItems.ts` reads the same surface.
So an app-wide affordance is routed through two default-setup features before it can see its own
data: library merges the declared commands with its editable ones, threads publishes the result.

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

| Declaration | Role today |
|---|---|
| `PackCommand` (`apack-sdk/src/framework/pack-commands.ts`) | the manifest contribution |
| `CommandItem` (`default-setup/src/extensions/tiptap/command-config.ts`) | the editor's view |
| `CommandItem` (`default-setup/src/features/threads/be/types.ts:439`) | the backend's view |

`PackCommand` survives as **the shape of a command, wherever it came from**; what goes with
`extensions.commands` is `getPackCommands()` and the module's framing of it as a manifest key. The type
moves out of `framework/pack-commands.ts` with that function, since nothing is left to justify the
module.

### What moves

Four files — `goal-editor-extensions.md` already merged the extension and its Plugin into one:

- `command-suggestion.ts` — the extension, its ProseMirror Plugin and `commandSuggestionKey`
- `CommandSuggestionPopup.vue`
- `useCommandItems.ts`
- `command-config.ts`

### What stays in default-setup

- **The commands themselves.** The 35 authored ones and the two that were manifest entries stay
  default-setup's content, served by it under the `commands` designation (Decision 1).
- **Reference suggestion**, genuinely a pack concern: it links threads, library and notes entities, and
  only that pack knows them.
- **`command-viewer-decoration.ts`**, which decorates a rendered command in a message — a threads
  display concern.

## Decisions

### 1. One door, three layers: declared as content, materialized by the apply, served by a role

**A command is a declaration *and* content, and the repo already resolves that duality for every
sibling concept.** Actions, prompts and flows all ship with behaviour behind them and are all
user-editable rows; the manifest names *where their content is*, the apply materializes it, and
`onUserEdit` governs what happens when the user changes one. Commands are the only concept that also
declares entities inline in the manifest.

So they stop doing that:

| layer | mechanism | why this one |
|---|---|---|
| **declare** | a content source and format | identical to actions/prompts/flows. A dependent pack uses `"format": "default-setup:commands"`, which needs **no new mechanism** — `default-setup:library` is already documented |
| **materialize** | the standard apply | three-way merge, offers and restore-to-factory already exist and are exactly what a shipped-but-editable catalogue needs |
| **serve** | `designation: "commands"` | exactly one owner, refused on a second claimant. The editor asks the role, not default-setup — which is the whole reason this goal exists |

`extensions.commands` as an entity-declaring key is **removed**. There is one source, so there is no
union and no accessor joining halves.

```json
"features": { "library": { "designation": "commands", … } }
```

**This reverses an earlier decision in this document, and the reversal is the point.** It previously
kept the two doors and refused to materialize declarations, on the grounds that `pr2md` would become a
user-deletable row while the flow handling it stayed. That was wrong three times over, each checkable:
a shipped action already behaves exactly this way; deleting a command removes the **suggestion**, not
the capability, since `command-listener-flow` matches the typed command whatever the catalogue holds;
and a deleted item is *not* resurrected by the next apply — *"a key it wrote with no entity behind it
now is one the user removed"* (`docs/public-facing/content.md:699`).

**Commands stay `Document`s, typed by frontmatter rather than by folder.** The Library surface *is*
their editing UI; a `Command` entity would mean inventing an editor to go with it. The compiler already
lifts frontmatter end to end — `tags` comes from `item.frontmatter.tags` and flows into the Document
and its `contentHash` — so a typed field is the same one-line shape and correctly counts as a content
change.

That kills `COMMANDS_FOLDER` (`library.ts:62`), the hardcoded `['internal','commands']` where "this
document is a command list" lives today. Four things follow:

- renaming the authored folder stops silently emptying the list;
- a user can make a command list by setting frontmatter;
- a pack contributing commands does so **declaredly**, rather than through an undeclared extension
  point — Collection is a `container`, so any pack's documents nesting under that path are picked up
  today with no record that they were;
- and the `**key**: value` convention stops being implicit in one filter.

**`onUserEdit: "offer"`**, not the `theirs` that library content uses today — a pack updating its
command list should be offered to the user, not silently ignored.

**One piece has to be invented, and it is the only one.** Every other mechanism here exists:
cross-pack content formats, the apply, `onUserEdit`, `getDesignated`/`hasDesignation`. What does not
is **resolving a role to something callable** — `getDesignated` returns a `FeatureRef`, not a provider.
The designated feature's registration has to carry `commands()`, and the registry has to resolve ref →
provider (`commandsFrom` in the walkthrough is a placeholder for whatever that is called). Design it
before Phase 2 rather than during it: it is the difference between a role that addresses a capability
and a role that is only a label.

**It would be the first designation whose role does not match its feature id.** The contract allows it
outright — *"a role rather than a name: it need not equal the feature id"* — but all four today
(`threads`, `browser`, `brain`, `logs`) happen to match, so there is no precedent. `designation:
"library"` reads more naturally and is worse: it welds "owns the library surface" to "serves commands",
and whatever library owns next inherits the coupling.

### 2. It lands in `@apackdev/ui`, not `@apackdev/host`

The editor is there, and `@apackdev/ui` may import `@apackdev/sdk` — which is where `getDesignated`
and the commands accessor live. It already reads SDK registries the same way
(`textEditorExtensionsRegistry` in `TiptapEditor.vue`, `stepRegistry` in `node-styles.ts`), so this
adds no layer edge.

Putting it in `@apackdev/host/fe` would need the host to reach into the editor it does not own, and
packs could not use it without the app.

### 3. It stops being a pack contribution and becomes a built-in

Once it asks the `commands` role it needs nothing from any *named* pack, so it does not go through
`extensions.textEditor` at all — the designation is what keeps it independent of default-setup while
still letting default-setup supply the rows. It joins `createExtensions()` beside
`SearchAndFind`, and `TiptapEditor` renders its popup directly as it already renders `TiptapSearchBar`.

That is the simplification worth having: the affordance stops being configuration and becomes part of
the editor, so no pack can fail to declare it and every editor has it.

default-setup's `extensions.textEditor.suggestions` group keeps `referenceSuggestion` and
`commandViewerDecoration`, and loses `commandSuggestion`.

### 4. One shape: `PackCommand`

Both `CommandItem` declarations go. The editor, the popup and threads' backend all name
`PackCommand` from `@apackdev/sdk`. Nothing about the *shape* changes, so Phase 1 is a rename with two
deletions.

Its *module* does move, in Phase 2: `framework/pack-commands.ts` exists to pair the type with
`getPackCommands()`, and once that function goes there is nothing left to justify the file. That is a
published export changing path, so `api:update` records it.

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
(`apack-host/tests/fe/declaration-binding.spec.ts`, `renderer/tests/runtime/text-editor.spec.ts`).

## The change, file by file

Seven hops today, three after. The decisions above say why; this says what a reader will actually edit.

```
apack.json extensions.commands (2) ──┐
                                     ├─► library.commands() ──► threads system ──► threads
src/content/library/internal/        │   (merge, keyed by         (broadcasts)      surface
  commands/*.md (35) ──► Documents ──┘    COMMANDS_FOLDER)                          state
                                                                                      │
    popup ◄── useCommandItems ◄── readSurfaceState('threads') ◄─────────────────────┘
```

### The manifest

```jsonc
// before — two doors
"extensions": {
  "commands": {
    "pr2md":        { "placeholder": "PR number or GitHub URL (optional)" },
    "instructions": { "placeholder": "Thread instructions text" }
  }
},
"content": { "sources": ["actions", "prompts", "flows", "library", "notes"] }
```

```jsonc
// after — one door, plus the role that serves it
"features": { "library": { "designation": "commands", … } },
"content": {
  "sources": ["actions", "prompts", "flows", "library", "notes", "commands"],
  "formats": {
    "commands": {
      "compiler": "src/content/_compilers/library.ts",
      "entity": ["Collection", "Document"],
      "identity": ["name"],
      "onUserEdit": "offer"
    }
  }
}
```

`pr2md` and `instructions` become two more authored files.

### The authored content — one line

```md
---
name: Claude Code commands
---
<!-- section:field -->
**cc-sessions**: Session ID (optional, lists all if omitted)
```

The file need say nothing about being commands: the `commands` **format** defaults every document it
compiles to one (`_compilers/commands.ts`), so a file in that source cannot fail to be a command list by
omitting it. It is a default rather than a stamp, because a command is only a document with a type — a
library document that declares `type: commands` is served as one, and a file here that declares something
else is what it says. Before, its folder decided, which was the same coupling with nothing enforcing it.

### The compiler — the shape is already there

```ts
// before (_compilers/library.ts)
const tags = Array.isArray(item.frontmatter.tags) ? item.frontmatter.tags.map(String) : [];
const resolvedTags = tags.length ? tags : ['default'];
return { entity: 'Document', name, content, tags: resolvedTags,
         contentHash: contentHash({ name, content, tags: resolvedTags }) };

// after — documentType lifted exactly as tags is, and into the hash
const documentType = text(item.frontmatter.type);
return { entity: 'Document', name, content, tags: resolvedTags, documentType,
         contentHash: contentHash({ name, content, tags: resolvedTags, documentType }) };
```

In the hash matters: editing the frontmatter becomes a content change, so the apply offers it.

### `library.commands()` — the merge and the magic path both go

```ts
// before
const COMMANDS_FOLDER = ['internal', 'commands'] as const
const inCommandsFolder = (doc) => (doc.collectionPath ?? []).join('/') === COMMANDS_FOLDER.join('/')

commands(): CommandItem[] {
  const documents = repository.libraryQueries.getDocuments().filter(inCommandsFolder).sort(…)
  const commands = new Map<string, CommandItem>()
  for (const command of getPackCommands()) {                    // door 1
    if (!commands.has(command.name)) commands.set(command.name, {…})
  }
  for (const document of documents) {                            // door 2
    for (const section of document.content) {
      if (section.type !== 'field') continue
      for (const field of section.fields) {
        if (!commands.has(field.key)) commands.set(field.key, { name: field.key, placeholder: field.value })
      }
    }
  }
  return [...commands.values()]
}

// after — one source, so no Map, no precedence rule, no folder constant
commands(): PackCommand[] {
  return repository.libraryQueries.getDocuments()
    .filter(doc => doc.documentType === 'commands')
    .sort(byDisplayOrderThenName)
    .flatMap(doc => doc.content
      .filter(s => s.type === 'field')
      .flatMap(s => s.fields.map(f => ({ name: f.key, placeholder: f.value }))))
}
```

The `if (!commands.has(…))` precedence — *"a document can't shadow a declared one"* — disappears with
the second door, because there is nothing left to shadow.

### The accessor

```ts
// before (@apackdev/sdk/framework/pack-commands.ts)
export function getPackCommands(): PackCommand[] {
  return boundHost().packs.commands();          // the manifest registry
}

// after — resolve the role, ask its owner
export function getCommands(): PackCommand[] {
  if (!hasDesignation('commands')) return []
  return boundHost().packs.commandsFrom(getDesignated('commands'))
}
```

### The editor

```ts
// before — useCommandItems.ts
const commands = useSurfaceState('threads', (s) => s.commands)
// after
const commands = useCommands()        // over getCommands(), no surface involved
```

```ts
// before — command-suggestion.ts in default-setup, declared via extensions.textEditor
export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() {
    return [plugin(this.editor, () => readSurfaceState('threads', (s) => s.commands))]
  },
})

// after — in @apackdev/ui, built in beside SearchAndFind, naming no pack
export const CommandSuggestion = Extension.create({
  name: 'commandSuggestion',
  addProseMirrorPlugins() { return [plugin(this.editor, getCommands)] },
})
```

```ts
// extensions.ts — it stops being configuration
if (cfg.searchBar) extensions.push(SearchAndFind)
extensions.push(CommandSuggestion)
```

### Threads leaves the path

Three sites in `threads/be/system.ts` go — `sendCommands`, the `commands` in `sendChatConnectedData`
and `rememberSentCommands` — with `commands` off the threads contract and `COMMANDS_UPDATED` off the
wire.

```
src/content/commands/*.md ──► Documents (documentType: 'commands')
                                   │
                              library.commands()  ← the `commands` designation
                                   │
    popup ◄── useCommandItems ◄── getCommands()
```

**The `| undefined` defect disappears here as a side effect**, nothing reading a surface that may not
be spawned — but Decision 5 still holds, because the unsound signature affects every other typed
reader and this goal must not paper over it.

## Phases

**Ordered so the source is settled before its consumer moves onto it.** The editor is moved last, in
Phase 3, because moving it first would mean reading a source Phase 2 then replaces — a temporary read
landed only to be deleted.

### Phase 1 — one shape

**Deliverable.** Both `CommandItem` declarations deleted; `PackCommand` from `@apackdev/sdk` used by
the editor files, the popup, and threads' backend and contract. Nothing else changes: all three are
structurally identical, so this is a rename with two deletions.

**Done when:** `npm run typecheck` passes and `grep -rn 'interface CommandItem' packages/` finds
nothing.

### Phase 2 — one door, and the role that serves it

**Deliverable.** Decision 1, in four pieces that land together because each is useless alone. "The
change, file by file" above has the before and after of each.

1. **Resolve a role to a provider**, which is the one mechanism this goal invents — see Decision 1.
   Do it first: the other three assume it.
2. **Commands become a content source.** A `commands` format compiling the authored documents, with
   `onUserEdit: "offer"`. The two `extensions.commands` entries (`pr2md`, `instructions`) become
   content files beside the 35; the manifest key, its schema, and `getPackCommands()` are deleted, and
   `PackCommand` finds a home that isn't `framework/pack-commands.ts`.
3. **`COMMANDS_FOLDER` is deleted** (`library.ts:62`), replaced by a frontmatter-typed field the
   compiler lifts as it already lifts `tags` — into the Document *and* its `contentHash`. Selection is
   on that field, not on `collectionPath`.
4. **`designation: "commands"`** on default-setup's library feature, carrying the provider from (1).

**Dependencies.** None. This phase is about where commands come from; it touches no editor code.

**Done when:**

- A library-authored command reaches the accessor, proven by a spec that writes a command document and
  reads what the accessor returns.
- `pr2md` still reaches it, now as content, and still triggers `command-listener-flow` when typed.
- **Deleting a command removes the suggestion and not the capability** — typing it still reaches the
  flow, and the next apply does not write it back. This is the claim an earlier version of this
  document was wrong about; it is a case, not a comment.
- **A second pack claiming the `commands` designation is refused** — the property the role was chosen
  for, and the reason it is a designation rather than a registry.
- Renaming the authored folder changes nothing, which is what deleting the hardcoded path buys.

**Mutation:** with the designation removed, the accessor finds no owner and returns nothing, rather
than silently falling back to a hardcoded feature.

### Phase 3 — the move

**Deliverable.** The four files in Scope move to
`packages/apack-ui/src/components/tiptap/extensions/command-suggestion.ts` plus its popup, following
the editor-extension convention — one file, the ProseMirror Plugin private, `commandSuggestionKey`
exported. `useCommandItems` reads Phase 2's accessor instead of `useSurfaceState('threads', …)`.

`createExtensions()` gains it; `TiptapEditor.vue` renders the popup as it already renders
`TiptapSearchBar`; default-setup's `extensions.textEditor.suggestions` group drops `commandSuggestion`;
`active-suggestions.ts` asks only the reference key.

**Dependencies.** Phase 2's accessor, which is the whole reason this phase is last.

**Done when:** `npm run typecheck`; `npm run exports:update -w @apackdev/ui` and `api:update` with
every line of the diff a path this phase moved; the editor suites pass —
`default-setup/tests/extensions/tiptap/`, `apack-host/tests/fe/declaration-binding`,
`renderer/tests/runtime/text-editor`, `apack-cli/tests/build/editor-declarations`.

**Mutation:** the popup opened in a window where threads was never spawned still lists every command —
the behaviour this goal exists for, and the one no current test covers.

### Phase 4 — docs

**Deliverable.** `docs/public-facing/manifest.md` and `extensions.md`, where `extensions.commands` is
described for a pack author — **removed**, with `content.md` gaining the `commands` format beside the
others a pack may name. Then `packages/apack-ui/CLAUDE.md`'s tiptap section and
`packages/default-setup/CLAUDE.md`'s extensions list.

**Done when:** `doc-links` passes, and no guide describes the command suggestion as a pack contribution
or `extensions.commands` as a manifest key.

## Constraints

- No `?? []` or other coalesce added to hide Decision 5's unsound signature.
- `extensions.commands` is removed, not kept beside the content path. Two doors is the defect.
- Reference suggestion is not touched. If a phase wants to, it has found a shared seam worth naming
  rather than a reason to widen scope.
- [`goal-editor-extensions.md`](goal-editor-extensions.md) has landed, so
  `command-suggestion.ts` already holds the extension and its Plugin together, and the convention there
  governs where they arrive.
- Commands stay `Document`s, and a `Command` entity is **dropped for good** — not deferred. The Library
  surface *is* their editing UI, so the entity would trade the provider getter for a whole new editor.
  Don't raise it again as an alternative or as future work. The direction that does hold is the inverse:
  `Document` into the core with Library as its editor, as flows already work
  ([document-in-the-core.md](../../plans/deferred/document-in-the-core.md)).
