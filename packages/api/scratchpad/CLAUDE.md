# Scratchpad — Quick Reference

Source `.ts` files in `actions/`, `prompts/`, `flows/` are compiled via esbuild into JSON (`compiled/`) for runtime execution. Function bodies are extracted and run in a sandboxed scope — there is no module system at runtime.

## Directory structure

- `actions/` — action source files
- `prompts/` — prompt template source files
- `flows/` — flow DSL files (dynamically imported, not bundled)
- `library/` — markdown docs compiled to JSON
- `compiled/` — generated output (**do not edit**)
- `shared/` — cross-cutting helpers
- `types.ts` — shared type definitions (`ActionMeta`, `PromptMeta`, `Services`, `Z`, etc.)

## Hard rules (compiler-enforced)

- **No bare package imports** (`lodash`, `fs`, `zod`, etc.) — blocked by esbuild plugin
- **No Node.js globals**: `require()`, `process`, `__dirname`, `__filename`, `Buffer`, `global` — validated post-bundle
- `import type` is fine (stripped before bundling)
- Relative imports and `@/*` path alias imports are allowed for helpers

## Action conventions

- Export `meta: ActionMeta` and `async function action(params, services, z, flowId)`
- Import types from relative `types.ts`: `import type { ActionMeta, Services, Z } from '../types'`
- See `WRITING-ACTIONS.md` for full reference (services list, examples, metadata schema)

## Prompt conventions

- Export `meta: PromptMeta` and `function template(params, usePrompt)` (synchronous, returns string)
- Import types from relative `types.ts`: `import type { PromptMeta } from '../types'`
- See `WRITING-PROMPTS.md` for full reference

## Helper files

- Any `.ts` file without `export const meta` is auto-detected as a helper
- Helpers are inlined into the consuming action/prompt at compile time via esbuild
- Can live in `actions/`, `prompts/`, `shared/`, or subdirectories

## Flow conventions

- Default export a `FlowDSL` object (`export default { ... } satisfies FlowDSL`)
- Helper files prefixed with `_` (e.g., `_patterns.ts`) are not compiled
- Flows are dynamically imported (not bundled) — they can use pattern helpers

## Typing & verification

- tsconfig at `scratchpad/tsconfig.json` — uses `moduleResolution: "bundler"`, `baseUrl: ".."`, path alias `@/* -> src/*`
- Types (`Services`, `Z`, `EntityId`, flow DSL types) come from `types.ts` which re-exports from backend
- Type check: `npx tsc --noEmit --project packages/api/scratchpad/tsconfig.json`

## Commands

- `npm run compile:actions` — compile actions to JSON
- `npm run compile:prompts` — compile prompts to JSON
- `npm run compile:flows` — compile flows to JSON
- `npm run compile:library` — compile library markdown to JSON
