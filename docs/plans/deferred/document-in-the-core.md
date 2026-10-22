# `Document` moves to the core, and Library becomes its editor

Status: deferred, with two triggers. **Revisit when something other than default-setup's Library wants
documents** — a second pack storing them, or a second app-level derivation over them — **or when
`extensions.commands` is wanted back** as a manifest shorthand, which this move is what makes buildable.
The first is the condition for drawing the line the move turns on, which is where a document ends and the
Library's view of one begins; the one consumer there is today cannot settle it.

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
   It is also what makes a manifest shorthand possible at all (below).
2. **A pack can store documents without depending on default-setup.** Today `Document` is that pack's,
   so wanting a document means taking its whole dependency.
3. **Anything app-level over documents stops routing through one pack** — search across packs, or
   reference targets, which are app concerns being served by a feature today.

## What it unlocks: commands declared in the manifest

`extensions.commands` — `{ "pr2md": { "placeholder": "PR number or GitHub URL (optional)" } }` — was the
shorthand a pack used before commands became content. It is worth having back, for the pack that wants two
commands without a content directory, a format reference and a field-section convention. **It cannot be
built before this move**, and that is the clearest argument for doing the move at all.

**Why it is blocked today.** A command document is a `Document` of `documentType: 'commands'`, and all
three of those — the entity, its content writer and the `commands` format — are default-setup's. For the
manifest key to materialize as content, the SDK's build would have to compile it through *a particular
pack's* format, which it cannot know. Every way out today is bad: hardcode `default-setup:commands` in the
SDK build (the magic this repo refuses, and wrong for a pack that doesn't depend on default-setup), or
restrict the key to dependents with a special-case rule. After the move the SDK owns the entity, so it can
synthesize the records itself, for any pack, with nothing hardcoded.

**How it would work.** The key is sugar, desugared at build time into ordinary content — there is no second
serving path, and the designation's owner still serves the list from the rows:

1. `content.sources` gains an **inline** kind: records from the manifest rather than a path. The build
   desugars `extensions.commands` into one, so every downstream mechanism — the applier, the content key,
   removal, offers — is the machinery that already exists.
2. The entries become **one Document per pack**, one field per command. Its `name` is synthesized and
   cosmetic; `contentKey` (`<packId>:<key>/…`) is what the merge matches on, as for any written item.
3. **`onUserEdit` defaults to `offer`**, matching the three other entries a pack owns and customises
   (actions, prompts, flows), and the key accepts it explicitly for a pack that wants `theirs`.

**Two things it changes, which have to be stated rather than discovered.** Neither is fixed by the move;
both follow from commands being content at all, so they are the price of the shorthand:

- **The key means "seeds", not "provides".** Under the old `extensions.commands` a declaration came with
  the pack: not editable, not deletable, added by installing and removed by uninstalling. A materialized
  command is the user's — they may edit the placeholder or delete the document, and a deleted item is not
  resurrected. A manifest key reads like the old guarantee, so the docs must say the new one plainly.
- **A name collision stops being loud.** The old key refused the whole pack when another registered pack
  declared the same name. Documents dedupe first-wins, silently. The build can still refuse a name a
  *dependency* declares, which is knowable from its snapshot and matches how a step type a dependency
  defines already throws; across unrelated packs, first-wins is the documents' rule and stays.

**Scope, after the move**: the schema key plus optional `onUserEdit`; the inline source kind and the
desugaring; the synthesized document's naming; a build-time collision check against dependencies; specs at
the schema, the desugaring, the apply and a removal; and the docs for the two changes above. Modest —
where doing it *before* the move means inventing a way for the SDK build to reach a pack's format, which is
most of the cost and all of the risk.

**What stays out of it.** The serving side does not change: one door, the designated owner's
`getCommands`, and after the move a read of the SDK's own rows. A manifest key that the app read directly
would be the second source the commands goal collapsed, and is not what this proposes.

**Worth having in the meantime**: `apack pack add command <name> --placeholder "…"`, a tenth entity beside
the nine `apack pack add` already scaffolds. It removes the friction the shorthand was wanted for — the
hand-written directory, format reference and field-section convention — with no schema change and no new
semantics, and it is useful whether or not this plan ever runs.

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

And for the shorthand, once the above is done:

- `packages/apack-sdk/src/framework/declaration-schema.ts` — `extensions.commands` and its optional
  `onUserEdit`, plus the inline `content.sources` kind it desugars into.
- `packages/apack-sdk/src/build/manifest-bridge.ts` and `content-compiler.ts` — the desugaring, and
  records from the manifest where a source otherwise names a path.
- `packages/apack-sdk/src/build/generate-entries.ts` — the applier for the desugared key, which is the
  existing per-key emission and not a new mechanism.

Do it when a trigger fires: the split drawn from two consumers, or the shorthand asked for. Not before —
the shape of the first is what the second is built on.
