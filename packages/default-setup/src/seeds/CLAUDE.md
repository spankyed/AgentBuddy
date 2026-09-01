# Seeds

Actions, prompts, flows, library, notes, and faqs compiled to JSON for runtime execution. No module system at runtime — function bodies are extracted and run in a sandboxed scope.

## Actions

- Export `meta: ActionMeta` and `async function action(params, services, z, flowId)`
- Import types: `import type { ActionMeta, Services, Z } from '../../types'` (adjust depth)
- No bare package imports or Node.js globals — compiler-enforced
- Files without `export const meta` are auto-detected as inlined helpers
- See `WRITING-ACTIONS.md` for full reference

## Prompts

- Export `meta: PromptMeta` and `function template(params, usePrompt)` (synchronous, returns string)
- Import types: `import type { PromptMeta } from '../types'`
- See `WRITING-PROMPTS.md` for full reference

## Flows

- Default export a `FlowDSL` object (`export default { ... } satisfies FlowDSL`)
- Files prefixed with `_` (e.g., `_patterns.ts`) are helpers, not compiled

## Commands

Commands are actions with `category: 'commands'` triggered by `/name` in chat. To add one:

1. Create action in `actions/commands/`
2. Add `on("user.command", ...)` branch in a flow (use `command-listener-flow.ts` for standalone)
3. Register in `library/internal/commands.md`
