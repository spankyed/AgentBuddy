# `Document` moves to the core, and Library becomes its editor

Status: deferred. **Revisit when something other than default-setup's Library wants documents** — a
second pack storing them, or a second app-level derivation over them. That is the condition; the one
consumer there is today cannot settle the question the move turns on, which is where the line between a
document and the Library's view of one falls.

Compiled 2026-10-22 on `session/commands-to-the-editor`, after
[the commands goal](../../goals/goal-commands-are-host-level.md) made the chat's slash commands a
derivation over library documents.

## Why this rather than a `Command` entity

A `Command` EARS entity is **dropped for good**, not deferred: it would delete the provider getter the
app currently calls, and pay for it with a whole new editor for something the Library already edits.

This is the inverse of that trade and strictly better. Keep the one editor, move the *entity* down so
the app owns the data, and let the Library go on being the UI over it. Commands then need no pack
contribution at all — the app reads its own rows.

**Flows already work this way, and are the precedent to copy.** The SDK owns the model (`Flow`, `Node`,
`TNode`, `Action`, `Prompt` in `SDK_ENTITIES`), their shapes (`apack-sdk/src/types/sdk-entities.ts`),
their repositories (`@apackdev/sdk/repositories`) and the flow applier. default-setup's flows feature is
only the editor: its repository exposes the SDK's methods by reference (`rootFlow:
flowRepository.rootFlow`, `flowEdges: flowRepository.flowEdges`) and adds its own views beside them,
and its surface is the canvas. Nothing about a flow belongs to the pack that draws it.

## What would move, and what would not

| | |
|---|---|
| **Moves** | the `Document` entity and its shape; a `documentRepository` in `@apackdev/sdk/repositories` with the base reads and writes; the Document content writer |
| **Stays in default-setup** | the Library surface and everything that is a *view* of documents — folder navigation, the index, search, import/export, display order, and the symlink collections |

`Collection` is the harder half and may not move at all. Library's folders carry symlink paths and
filesystem resolution, which are that feature's business rather than a core container's — so the
container question is open, and a move that takes `Document` without `Collection` has to say what a
document's parent is in the core.

## What it buys

1. **Commands stop being a pack contribution.** `getCommands()` becomes a read of SDK rows by
   `documentType`, so `features.<id>.getCommands`, the `commands` designation and the owner's
   `COMMANDS_CHANGED` all go. Invalidation moves to the repository that owns the writes, where the
   announcement can live beside them instead of being a pack's duty — see
   [pack-published-app-facts.md](pack-published-app-facts.md), which this would largely retire.
2. **A pack can store documents without depending on default-setup.** Today `Document` is that pack's,
   so wanting a document means taking its whole dependency.
3. **Anything app-level over documents stops routing through one pack** — search across packs, or
   reference targets, which are app concerns being served by a feature today.

## What it costs, which is the reason to wait

**`DocumentEntity`'s shape becomes public, change-controlled API** (`packages/apack-sdk/TYPED-EARS.md`),
and today that shape is frankly library-specific:

```ts
interface DocumentEntity extends BaseEntity {
  name: string
  content: ContentSection[]      // the Library's section model
  shortCode: DocumentShortCode   // the Library's addressing
  displayOrder?: number          // the Library's ordering
  tags?: string[]
  documentType?: string          // how commands are found
  contentHash?: string
}
```

So the move is not a relocation, it is a **split**: which of those is a document, and which is the
Library's view of one? `content` as `ContentSection[]` is the sharpest case — a core document probably
holds text or blocks, and sections are a UI model. `shortCode` and `displayOrder` read as the Library's
outright. And `documentType` would have to be blessed as a core concept, since it is how the app finds
commands.

That split needs a second consumer to answer, because the first one's shape is indistinguishable from
the general one when there is only one. Doing it now would fix the Library's model as every pack's.

## The seam

- `packages/apack-sdk/src/types/sdk-entities.ts` — `SDK_ENTITIES` and the shape.
- `packages/apack-sdk/src/repositories/` — the new `documentRepository`, as `flowRepository` sits there.
- `packages/default-setup/apack.json` — `features.library.entities` loses `Document`, `content.writers`
  loses its entry, and `features.library.getCommands` goes with the designation.
- `packages/default-setup/src/features/library/be/repository/` — becomes views over the SDK's, the way
  `features/flows/be/repository/` already is.
- `packages/apack-sdk/src/commands/index.ts` — `getCommands()` reads the repository directly.

Do it when the second consumer exists and the split can be drawn from two examples rather than one.
