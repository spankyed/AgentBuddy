# Content

Content sources `abuddy build` compiles to JSON, as `abuddy.json` `content.formats` and `content.sources` describe them. `_compilers/` holds the formats' compiler modules and `hooks/` the content writers for Note, Document and Collection. Actions and prompts run in a sandboxed scope at runtime: no module system, their function bodies are extracted (with inlined helpers). Flows compile to Flow/Node graphs.

## Actions

- Export `meta: ActionMeta` and `async function action(params, services, z, flowId)`. Both the flow action step and `services.action` run it with `runActionCode` (`extensions/steps/action/sandbox.ts`), which passes all four (`flowId` only from a flow step) and gives `services.logger` the name `action:<label>`
- Import types: `import type { ActionMeta } from '@abuddy/sdk/build'` and `import type { Services, Z } from '#generated/services'`
- Bare package imports fail the build, except `@abuddy/sdk/actions`, an allowlisted sandbox-safe module whose source is inlined into the compiled body (`INLINABLE_PACKAGE_IMPORTS` in `abuddy-sdk/src/build/compile-utils.ts`). Type-only imports (`import type`) are erased before bundling and are always fine. References to Node-only globals in the bundle are reported as warnings, not errors
- Relative imports (`./_helpers/...`) are bundled in. A `.ts` file without `export const meta` is a helper, not an action, whatever its name; `.example.ts` files are skipped
- Reference: `docs/public-facing/content.md`

## Prompts

- Export `meta: PromptMeta` and `function template(params, usePrompt)` (synchronous, returns string)
- Import types: `import type { PromptMeta } from '@abuddy/sdk/build'`
- Helper detection is the same as for actions (no `export const meta`)

## Flows

- Default export a `FlowDSL` object (`export default { ... } satisfies FlowDSL`), `import type { FlowDSL } from '@abuddy/sdk/build'`
- Import helpers from `#generated/flow-helpers` (generated from the step definitions in `abuddy.json`)
- Files prefixed with `_` (and `.example.ts` files) aren't compiled; the `_` rule applies only to flows

## Settings

Each feature has a `settings.ts` (`src/features/<name>/settings.ts`, `features[].settings` in `abuddy.json`) that declares its slice of the default settings; the pack registry holds it under the plugin's address (`default-setup.<name>`), as it does every pack's.

**Settings are not written, and the app's base defaults are not a content source.** `src/content/default-settings.ts` is this pack's own source, and `src/app-settings/index.ts` imports it — `getBaseSettings`, which refuses a base file that sets a plugin's slice (`assertNoPluginSlice`). Nothing about settings reaches the database through writing: the row holds only what the user changed, and the store composes these defaults underneath it from the registration. Forgetting those changes is a targeted reset in the app's Settings view (`RESET_SETTINGS` naming a feature's ref or a section's name), which is where a destructive action belongs rather than behind an import dialog.

**`content.sources` is for entries that import rows into the database**, and that is the test for a new one: an entry needing a policy to say "do not import this" is not one. A `.ts` source the pack reads back itself is not one either — a pack imports its own source, which is what `default-settings.ts` does.

**`faqs` is the one entry that fails that test and stays**, so read it as the exception rather than the pattern: its format declares no `entity`, nothing is written, and `src/app-settings/index.ts` reads the `faqs.seed.json` the build wrote. Its source is markdown, so an import is not open to it the way it is to `default-settings.ts` — it needs a compiler, and `content.sources` is the only thing in the manifest that runs one. Honouring the rule for it means a manifest key for compiled artifacts that nothing imports, which is a design decision and not a move.

The settings hold the user's settings only: the app's own state (onboarding, versions, seed hashes) is the host's `AppState`. At runtime `settings/be/defaults.ts` adds every registered pack's feature settings (`getPackSettingsDefaults` from `@abuddy/sdk/framework`; the app's own win), and the settings entity stores only the user's changes over those defaults, so a pack's defaults come and go with the pack. The settings system resends settings (`SETTINGS_UPDATED`) when a pack's feature settings register or unregister.

Every feature settings file follows this shape:

```ts
export default {
  visible: true | false,  // whether the plugin's sidebar tab shows by default
  plugins: {
    <featureId>: { ... }  // feature-specific defaults (optional)
  }
}
```

- `visible` controls whether the plugin's sidebar tab is shown by default; what the user shows or hides is the host's state (`AppState`), not settings
- Feature-specific defaults (hotkeys, modes, display preferences) go under the feature id key; the registry stores them under the plugin's address
- Features with no settings beyond visibility still need the file (e.g., `settings/settings.ts` just sets `visibility: { settings: true }`)

## Notes

Markdown under `notes/` (the welcome note), compiled with the `notes` format (`markdown-tree`, entity `Note`) and seeded through `hooks/notes.ts`. Frontmatter (YAML): `title` (default: the file name, dashes as spaces), `type` (`document` | `tasklist` | `task`), `icon`, `favorite`, `hideCompletedChildren`, `completed`. A directory is a parent note, its `index.md` giving the parent's frontmatter and content.

## Library

Markdown under `library/`, compiled with the `library` format (`_compilers/library.ts`) and seeded through `hooks/library.ts`. A directory is a Collection (`_meta.md` frontmatter: `name`, `description`); a file is a Document (frontmatter `name`, `tags: [a, b]`; `<!-- section:type -->` markers split its content into sections). `media/` is copied with the content, and `![alt](media/file)` links point at the document's media.

## FAQs

Markdown under `faqs/`, compiled with the `faqs` format (`_compilers/faqs.ts`) for the Help tab: the first `# heading` is the question, the rest the answer; frontmatter `category`, `order`. Not seeded into the database.

## Content writers

`hooks/notes.ts` (`noteContentWriter`) and `hooks/library.ts` (`documentContentWriter`, `collectionContentWriter`) are `ContentWriter` from `@abuddy/sdk/content`, registered per entity through `abuddy.json` `content.writers` (`"Note": "src/content/writers/notes.ts#noteContentWriter"`). An entity type's hooks can be registered by one pack only. Collection sets `container: true`, so a folder this pack seeded is written into by other packs, not copied; both library `find`s match a name within `parentId`. Every member is optional; without one the format applier does it directly:

- `find(record, ctx)` — the existing row for a record (`{ id, contentHash }`), replacing the entry's `identity` match. The applier first looks up the row by its content key and only falls back to `find` for rows no seed has claimed
- `create(record, ctx)` — creates the row, returns its id (call the feature's repository commands, so written entities match app-created ones)
- `update(id, record, ctx)` — writes the record's fields, and resets `ctx.clearedFields` to what `create` gives a record that doesn't set them
- `remove(id)` — deletes a row whose media copy or stamping failed after `create`

`ContentWriteContext` is `{ parentId?, index, clearedFields }`: the parent entity for tree children, the record's position among its siblings, and on update the fields the last apply set that the record no longer does (empty for `find` and `create`, and empty for an item the apply has no record of). The writer stamps `contentHash` and `contentKey` itself after `create`/`update` and records a hash per field in the pack's applied content, so hooks needn't store any of it.

## Re-applying

Written entities keep their item's `contentHash` and `contentKey`, and the app records a hash per part of what each apply wrote in the pack's applied content. A later apply writes an item only when the hash changed and every part still holds what we wrote; it leaves an edited item alone and names the parts that differ, leaves an entity with no stored hash (the user's) alone, and adopts one we wrote but have no parts for. An update resets the fields the last apply set that the item no longer sets (the Note hooks reset them to a new note's values); fields no apply set, like a user's favorite, stay. Entities are found by `contentKey`: `<packId>:<entry key>/<item identity>`, with each tree child's identity appended to its parent's key, so a renamed entity is not written again. A flow's parts are its own fields, one per node and one for its wiring. Flow and node ids come from the flow's name, so a flow whose name another pack's flow has (or whose ids a user's flow has) is not written and the apply reports it. Content this pack stops shipping is removed, unless the user has edited it. `keep-existing` skips what exists, `wipe-and-replace` first removes every entity of the entry's types, the user's and other packs' included. See `docs/public-facing/content.md`.

## Commands

Slash commands (`/name` in chat) come from two places, merged by `services.library.commands()`: `abuddy.json` `commands` (this pack declares `pr2md` and `instructions`; every registered pack's are listed first, in registration order) and the documents in `library/internal/commands/` (`claude-code.md`, `codex.md`: a `<!-- section:field -->` block of `**name**: placeholder` lines), which users can edit from the Library. A document repeating a declared name is ignored. To add one:

1. Create the action (its `category` only groups it in the Actions UI)
2. Add an `on("user.command", ...)` branch in a flow (`command-listener-flow.ts` for standalone, the Claude Code and Codex flows for `cc-*`/`cdx-*`)
3. List it in `abuddy.json` `commands`, or in the matching document under `library/internal/commands/` when users should be able to change it
