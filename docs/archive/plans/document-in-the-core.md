# `Document` moves to the core, and Library becomes its editor

Status: **closed — the move and both things it was for are done.** `Document`, `Collection` and
`parent_of` are the SDK's, with their shapes, repositories and content writers, and the Library is their
editor. `getCommands()` now derives the list from those rows, which retired the `commands` designation,
`features.<id>.getCommands`, `COMMANDS_CHANGED`, the library's watcher, `registry.commandProviders`,
`checkCommandProviderClaims` and `commands/role.ts` — and closed
[pack-published-app-facts](pack-published-app-facts.md) with them. `extensions.commands` is back as a
manifest shorthand, desugared into ordinary content under the reserved key `declared-commands`.

**Two departures from the shorthand as sketched below**, both forced by what the code turned out to be:
the commands nest under `list` (a flat record with a reserved `onUserEdit` sibling parses, but its inferred
type is a catchall every consumer of `PackManifest` would carry), and the entry compiles under its own
reserved key rather than `commands`, because default-setup already uses that key for its content directory —
so a pack can use both, which the fixture does.

**The shape moved whole, and there is no line to draw.** This plan treated "which of these fields is a
document and which is the Library's view of one" as the real work, to be settled by a second consumer.
That question is closed: **default-setup's usage is the canonical `Document`.** A consumer conforms to it
rather than negotiating with it — packs complement each other here, they do not compete over what a
document is. So `ContentSection[]`, `shortCode` and `displayOrder` are the shape, not one pack's view of
it, and nothing is waiting on a second consumer to decide.

Compiled 2026-10-22 on `session/commands-to-the-editor`, after
[the commands goal](../../archive/goals/goal-commands-are-host-level.md) made the chat's slash commands a
derivation over library documents. The move landed on `session/document-in-the-core`.

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
| **Moved** | `Document`, `Collection` and the `parent_of` relation with their shapes; `documentRepository` and `collectionRepository` in `@apackdev/sdk/repositories`, with the tree mechanics — a child's parent, a folder's path, a new child's place among siblings; both content writers |
| **Stayed in default-setup** | the Library surface and everything that is a *view* of documents — folder navigation, the index, search, import/export, the symlink collections, and every DTO |

`Collection` was called the harder half here and was expected possibly not to move. It had to: a new
child sorts after every sibling, and siblings are mixed — folders joined by `parent_of`, documents by
`contains` — so `nextDisplayOrder` cannot be answered from either entity's rows alone. Taking `Document`
without the folder and the relation would have left that one function unable to see half its input.

The symlink paths that argued against moving `Collection` stayed behind: `symlinkPath` is a field on the
shape, and resolving it is the Library's (`be/repository/symlink.ts`), untouched by the move.

**The writers moved because ownership left no alternative, and they are named rather than registered.**
A pack declares content writers only for entity types it owns — the declaration schema refuses the rest,
for authored manifests and native ones alike — so once these entities were the SDK's, no pack could
contribute their writers, the app included. `sdkContentWriters` (`apack-sdk/src/content/writers.ts`)
names them, and the writer registry consults a pack's first and falls back to it. Static, so there is no
import order in which they can be missing.

## What it buys

1. **Commands stop being a pack contribution.** `getCommands()` becomes a read of SDK rows by
   `documentType`, so `features.<id>.getCommands`, the `commands` designation and the owner's
   `COMMANDS_CHANGED` all go. Invalidation moves to the repository that owns the writes, where the
   announcement can live beside them instead of being a pack's duty — see
   [pack-published-app-facts.md](pack-published-app-facts.md), which this closed outright.
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

**Already done, and worth having either way**: `apack pack add command <name> --placeholder "…"`, a tenth
entity beside the nine `apack pack add` scaffolded before it. It removes the friction the shorthand was
wanted for — the hand-written directory, format reference and field-section convention — with no schema
change and no new semantics. What it does not give is commands *declared in the manifest*, which is what
the section above is for.

## The shape is default-setup's, deliberately

`DocumentEntity` is public, change-controlled API (`packages/apack-sdk/TYPED-EARS.md`):

```ts
interface DocumentEntity extends BaseEntity {
  name: string
  content: ContentSection[]      // sections, as the markdown compiler parses them
  shortCode: DocumentShortCode   // DOC-n, how a document is addressed
  displayOrder?: number          // its place among its siblings, folders included
  tags?: string[]
  documentType?: string          // what the document is; `commands` marks a slash-command list
  contentHash?: string
}
```

This plan originally called that a problem — the fields read as one feature's model being fixed as every
pack's, and it wanted a split drawn from a second consumer before committing.

**That is settled the other way, and it is the simpler answer.** These fields are what a document is. A
pack storing documents gets the same sections, the same addressing and the same ordering as the app's own,
which is what makes a written row indistinguishable from one a user created — the property the content
goldens hold the move to. A core shape that omitted them would force every consumer to reinvent them and
then disagree, which is the competition this avoids.

`shortCode` and `displayOrder` are the load-bearing pair: they are assigned at write time, and they are
why the writers had to move with the entities rather than staying behind as a pack contribution.

## The seam

Done:

- `packages/apack-sdk/src/types/sdk-entities.ts` — `SDK_ENTITIES.Document`/`.Collection`,
  `SDK_REL_KINDS.PARENT_OF`, and both shapes.
- `packages/apack-sdk/src/repositories/document-repository.ts` — `documentRepository`,
  `collectionRepository` and the tree mechanics, as `flowRepository` sits beside them.
- `packages/apack-sdk/src/content/document-writers.ts` — both writers, named by `sdkContentWriters`.
- `packages/default-setup/apack.json` — `features.library.entities` keeps only its own two,
  `data.relations` loses `parent_of`, and `content.writers` keeps only `Note`. The `library` and
  `commands` formats still name `Collection` and `Document`, which a format may do for an SDK entity.
- `packages/default-setup/src/features/library/be/repository/` — views over the SDK's, calling them by
  the SDK's names.

- `packages/apack-sdk/src/commands/index.ts` — `commandsFromDocuments()` derives the list from the rows
  and `getCommands()` serves it, with the designation, the provider field, the claims check,
  `commands/role.ts` and `COMMANDS_CHANGED`-from-a-pack all gone. **Invalidation is the repository's
  announcement and the app's comparison**: `documentRepository` tells subscribers that documents were
  written, without a payload and without sending anything, and the `host/application` system's watcher
  derives the list again and publishes when it differs. The comparison is deferred to a microtask, so one
  content apply is one publication however many documents it wrote.

- `packages/apack-sdk/src/framework/declaration-schema.ts` — `extensions.commands`, `DECLARED_COMMANDS_KEY`
  and `declaredContentKeys`, the one answer to "which content keys did this pack declare" that the compiled
  index, the runtime's applier keys and the installed layout each used to derive separately.
- `packages/apack-sdk/src/build/content/resolve.ts` — the desugaring, and the build-time refusal of a name a
  dependency declares.
- `packages/apack-sdk/src/build/content-compiler.ts` and `generate-entries.ts` — the one document it compiles
  to, and its `createFormatApplier`.

Done:

And for the shorthand, once the above is done:

- `packages/apack-sdk/src/framework/declaration-schema.ts` — `extensions.commands` and its optional
  `onUserEdit`, plus the inline `content.sources` kind it desugars into.
- `packages/apack-sdk/src/build/manifest-bridge.ts` and `content-compiler.ts` — the desugaring, and
  records from the manifest where a source otherwise names a path.
- `packages/apack-sdk/src/build/generate-entries.ts` — the applier for the desugared key, which is the
  existing per-key emission and not a new mechanism.

Do the remaining two when a trigger fires. The shorthand is now unblocked — the SDK owns the entity, so
its build can synthesize the records itself for any pack, which was the whole argument for moving first.
