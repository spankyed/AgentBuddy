# Seeds

Seed sources `abuddy build` compiles to JSON, as `abuddy.json` `seedFormats` and `boot.seed` describe them. `_compilers/` holds the formats' compiler modules and `hooks/` the seed hooks for Note, Document and Collection. Actions, prompts and flows run in a sandboxed scope at runtime: no module system, function bodies are extracted.

## Actions

- Export `meta: ActionMeta` and `async function action(params, services, z, flowId)`
- Import types: `import type { ActionMeta, Services, Z } from '../../types'` (adjust depth)
- No bare package imports or Node.js globals — compiler-enforced. The one exception is
  `@abuddy/sdk/actions`, an allowlisted sandbox-safe module whose source is inlined into the
  compiled body (see `INLINABLE_PACKAGE_IMPORTS` in `abuddy-sdk/src/build/compile-utils.ts`).
  Type-only imports (`import type`) are erased before bundling and are always fine.
- Files without `export const meta` are auto-detected as inlined helpers
- See `WRITING-ACTIONS.md` for full reference

## Prompts

- Export `meta: PromptMeta` and `function template(params, usePrompt)` (synchronous, returns string)
- Import types: `import type { PromptMeta } from '../types'`
- See `WRITING-PROMPTS.md` for full reference

## Flows

- Default export a `FlowDSL` object (`export default { ... } satisfies FlowDSL`)
- Import helpers from `#generated/flow-helpers` (auto-generated from step definitions in `abuddy.json`)
- Files prefixed with `_` are helpers, not compiled

## Settings

Each feature has a `settings.ts` (`src/features/<name>/settings.ts`) that declares its slice of the default settings. The compiler deep-merges the base settings (`src/seeds/default-settings.ts`) with all 13 per-feature files into a single compiled object. At runtime `settings/be/defaults.ts` adds every registered pack's feature settings (`getPackSettingsDefaults` from `@abuddy/sdk/framework`; the app's own win), and the settings entity stores only the user's changes over those defaults, so a pack's defaults come and go with the pack. The settings system resends settings (`SETTINGS_UPDATED`) when a pack's feature settings register or unregister.

Every feature settings file follows this shape:

```ts
export default {
  plugins: {
    _meta: { visibility: { <pluginId>: true | false } },  // sidebar tab visibility
    <pluginId>: { ... }  // feature-specific defaults (optional)
  }
}
```

- `_meta.visibility` controls whether the plugin's sidebar tab is shown by default
- Feature-specific defaults (hotkeys, modes, display preferences) go under the plugin id key
- Features with no settings beyond visibility still need the file (e.g., `settings/settings.ts` just sets `visibility: { settings: true }`)

## Notes

Markdown under `notes/`, compiled with the `notes` format (`markdown-tree`, entity `Note`) and seeded through `hooks/notes.ts`. Frontmatter (YAML): `title` (default: the file name, dashes as spaces), `type` (`document` | `tasklist` | `task`), `icon`, `favorite`, `hideCompletedChildren`, `completed`. A directory is a parent note, its `index.md` giving the parent's frontmatter and content.

## Library

Markdown under `library/`, compiled with the `library` format (`_compilers/library.ts`) and seeded through `hooks/library.ts`. A directory is a Collection (`_meta.md` frontmatter: `name`, `description`); a file is a Document (frontmatter `name`, `tags: [a, b]`; `<!-- section:type -->` markers split its content into sections). `media/` is copied with the seeds, and `![alt](media/file)` links point at the document's media.

## FAQs

Markdown under `faqs/`, compiled with the `faqs` format (`_compilers/faqs.ts`) for the Help tab: the first `# heading` is the question, the rest the answer; frontmatter `category`, `order`. Not seeded into the database.

## Re-seeding

Seeded rows keep their record's `sourceHash` and `seededFields` (a hash of the values the seeder wrote). A re-seed updates a row only when the hash changed and the row's seeded fields still hold those values; it leaves edited rows, rows seeded before `seededFields` existed, and rows without a stored hash (user-created) alone; `keep-existing` skips existing rows, `wipe-and-replace` removes the entry's rows first. See `docs/public-facing/seeds.md`.

## Commands

Commands are actions with `category: 'commands'` triggered by `/name` in chat. To add one:

1. Create action in `actions/commands/`
2. Add `on("user.command", ...)` branch in a flow (use `command-listener-flow.ts` for standalone)
3. Register in `library/internal/commands.md`
