# Seeds

Seed sources `abuddy build` compiles to JSON, as `abuddy.json` `seedFormats` and `boot.seed` describe them. `_compilers/` holds the formats' compiler modules and `hooks/` the seed hooks for Note, Document and Collection. Actions and prompts run in a sandboxed scope at runtime: no module system, their function bodies are extracted (with inlined helpers). Flows compile to Flow/Node graphs.

## Actions

- Export `meta: ActionMeta` and `async function action(params, services, z, flowId)`. Both the flow action step and `services.action` run it with `runActionCode` (`extensions/steps/action/sandbox.ts`), which passes all four (`flowId` only from a flow step) and gives `services.logger` the name `action:<label>`
- Import types: `import type { ActionMeta } from '@abuddy/sdk/build'` and `import type { Services, Z } from '@/__generated__/services'`
- Bare package imports fail the build, except `@abuddy/sdk/actions`, an allowlisted sandbox-safe module whose source is inlined into the compiled body (`INLINABLE_PACKAGE_IMPORTS` in `abuddy-sdk/src/build/compile-utils.ts`). Type-only imports (`import type`) are erased before bundling and are always fine. References to Node-only globals in the bundle are reported as warnings, not errors
- Relative imports (`./_helpers/...`) are bundled in. A `.ts` file without `export const meta` is a helper, not an action, whatever its name; `.example.ts` files are skipped
- Reference: `docs/public-facing/seeds.md`

## Prompts

- Export `meta: PromptMeta` and `function template(params, usePrompt)` (synchronous, returns string)
- Import types: `import type { PromptMeta } from '@abuddy/sdk/build'`
- Helper detection is the same as for actions (no `export const meta`)

## Flows

- Default export a `FlowDSL` object (`export default { ... } satisfies FlowDSL`), `import type { FlowDSL } from '@abuddy/sdk/build'`
- Import helpers from `#generated/flow-helpers` (generated from the step definitions in `abuddy.json`)
- Files prefixed with `_` (and `.example.ts` files) aren't compiled; the `_` rule applies only to flows

## Settings

Each feature has a `settings.ts` (`src/features/<name>/settings.ts`, `features[].settings` in `abuddy.json`) that declares its slice of the default settings; the pack registry holds it under the plugin's address (`default-setup.<name>`), as it does every pack's. The pack's `settings` seed format (`_compilers/settings.ts`) compiles only the app's base settings (`src/seeds/default-settings.ts`) into one record (`{ name: 'default-settings', settings }` in `settings.seed.json`), and refuses a base file that sets a plugin's slice. Its seeder (`settings/seeder.ts`) resets the user's settings when the seed is imported without keeping existing data; `boot.seedPolicy.skipAtBoot` keeps it out of boot seeding. The settings hold the user's settings only: the app's own state (onboarding, versions, seed hashes) is the host's `AppState`. At runtime `settings/be/defaults.ts` adds every registered pack's feature settings (`getPackSettingsDefaults` from `@abuddy/sdk/framework`; the app's own win), and the settings entity stores only the user's changes over those defaults, so a pack's defaults come and go with the pack. The settings system resends settings (`SETTINGS_UPDATED`) when a pack's feature settings register or unregister.

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

Markdown under `library/`, compiled with the `library` format (`_compilers/library.ts`) and seeded through `hooks/library.ts`. A directory is a Collection (`_meta.md` frontmatter: `name`, `description`); a file is a Document (frontmatter `name`, `tags: [a, b]`; `<!-- section:type -->` markers split its content into sections). `media/` is copied with the seeds, and `![alt](media/file)` links point at the document's media.

## FAQs

Markdown under `faqs/`, compiled with the `faqs` format (`_compilers/faqs.ts`) for the Help tab: the first `# heading` is the question, the rest the answer; frontmatter `category`, `order`. Not seeded into the database.

## Seed hooks

`hooks/notes.ts` (`noteSeedHooks`) and `hooks/library.ts` (`documentSeedHooks`, `collectionSeedHooks`) are `SeedHooks` from `@abuddy/sdk/seed`, registered per entity through `abuddy.json` `seedHooks` (`"Note": "src/seeds/hooks/notes.ts#noteSeedHooks"`). An entity type's hooks can be registered by one pack only. Collection sets `container: true`, so a folder this pack seeded is seeded into by other packs, not copied; both library `find`s match a name within `parentId`. Every member is optional; without one the generic seeder does it directly:

- `find(record, ctx)` — the existing row for a record (`{ id, sourceHash }`), replacing the entry's `identity` match. The seeder first looks up the row by its seed key and only falls back to `find` for rows no seed has claimed
- `create(record, ctx)` — creates the row, returns its id (call the feature's repository commands, so seeded rows match app-created ones)
- `update(id, record, ctx)` — writes the record's fields, and resets `ctx.clearedFields` to what `create` gives a record that doesn't set them
- `remove(id)` — deletes a row whose media copy or stamping failed after `create`

`SeedHookContext` is `{ parentId?, index, clearedFields }`: the parent row for tree children, the record's position among its siblings, and on update the fields the row's previous seed set that the record no longer does (empty for `find` and `create`). The seeder stamps `sourceHash`, `seededFields` and `seedKey` itself after `create`/`update`, so hooks needn't store them.

## Re-seeding

Seeded rows keep their record's `sourceHash` and `seededFields` (a hash of the values the seeder wrote). A re-seed updates a row only when the hash changed and the row's seeded fields still hold those values; it leaves edited rows, rows without recorded seeded values, and rows without a stored hash (user-created) alone. An update resets the fields the row's previous seed set that the record no longer sets (the Note hooks reset them to a new note's values); fields no seed set, like a user's favorite, stay. Rows are found by `seedKey`: `<packId>:<entry key>/<record identity>`, with each tree child's identity appended to its parent's key, so a renamed row isn't seeded again. Flows store `seededGraph` (their row, nodes and relations) for the same edit check. Flow and node ids come from the flow's name, so a flow whose name another pack's flow has (or whose ids a user's flow has) isn't seeded and the seed reports it. `keep-existing` skips existing rows, `wipe-and-replace` first removes every row of the entry's entity types, the user's and other packs' included. See `docs/public-facing/seeds.md`.

## Commands

Slash commands (`/name` in chat) come from two places, merged by `services.library.commands()`: `abuddy.json` `commands` (this pack declares `pr2md` and `instructions`; every registered pack's are listed first, in registration order) and the documents in `library/internal/commands/` (`claude-code.md`, `codex.md`: a `<!-- section:field -->` block of `**name**: placeholder` lines), which users can edit from the Library. A document repeating a declared name is ignored. To add one:

1. Create the action (its `category` only groups it in the Actions UI)
2. Add an `on("user.command", ...)` branch in a flow (`command-listener-flow.ts` for standalone, the Claude Code and Codex flows for `cc-*`/`cdx-*`)
3. List it in `abuddy.json` `commands`, or in the matching document under `library/internal/commands/` when users should be able to change it
