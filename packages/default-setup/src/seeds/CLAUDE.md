# Seeds

Actions, prompts, flows, library, notes, and faqs compiled to JSON for runtime execution. No module system at runtime — function bodies are extracted and run in a sandboxed scope.

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

Each feature has a `settings.ts` (`src/features/<name>/settings.ts`) that declares its slice of the default settings. The compiler deep-merges the base settings (`src/seeds/default-settings.ts`) with all 13 per-feature files into a single compiled object.

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

## Commands

Commands are actions with `category: 'commands'` triggered by `/name` in chat. To add one:

1. Create action in `actions/commands/`
2. Add `on("user.command", ...)` branch in a flow (use `command-listener-flow.ts` for standalone)
3. Register in `library/internal/commands.md`
