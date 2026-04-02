# Default — Quick Reference

Source `.ts` files in `src/actions/`, `src/prompts/`, `src/flows/` are compiled via esbuild into JSON (`dist/`) for runtime execution. Function bodies are extracted and run in a sandboxed scope — there is no module system at runtime.


### New repo structure

```
default-setup/
  defs/                     # Vendored definitions from AgentBuddy
    ears-types.ts           # EARS Entity, EntityId, RelKind (from src/core/types.ts)
    flow-dsl-types.ts       # FlowDSL, Track, DSLStepNode types (from src/systems/flows/dsl/types.ts)
    flow-dsl-validator.ts   # validate() function (from src/systems/flows/dsl/validator.ts)
    library-types.ts        # ContentSection union (from src/systems/library/types.ts)
    library-export-types.ts # ExportedItem, ExportedLibrary (from src/systems/library/export-types.ts)
    library-utils.ts        # toTitleCase, countDocs (from src/systems/library/utils.ts)
    thread-types.ts         # ButtonConfig, LinkConfig (from src/systems/threads/types.ts)
    action-defs.d.ts        # Generated: full Services type, z, ActionEntity (from rollup pipeline)
    prompt-defs.d.ts        # Generated: PromptService, usePrompt, PromptContext (from rollup pipeline)

  src/                      # Compiler infrastructure (moved from default root)
    compile.ts              # Entry point — dispatches to action/prompt/flow/library compilers
    compile-utils.ts        # esbuild bundling, TS AST extraction, validation
    compile-flows.ts        # Flow compiler — dynamic import + validation
    compile-library.ts      # Library markdown compiler
    types.ts                # Re-exports types from defs/ for action/prompt/flow authoring

  actions/                  # Action source files (copied as-is, imports updated)
  prompts/                  # Prompt template source files
  flows/                    # Flow DSL files
  library/                  # Markdown docs + media
  shared/                   # Cross-cutting helpers (empty for now)
  dist/                 # Generated JSON output (gitignored)
```


## Directory structure

- `src/actions/` — action source files
- `src/prompts/` — prompt template source files
- `src/flows/` — flow DSL files (dynamically imported, not bundled)
- `src/library/` — markdown docs compiled to JSON
- `src/shared/` — cross-cutting helpers
- `src/types.ts` — shared type definitions (`ActionMeta`, `PromptMeta`, `Services`, `Z`, etc.)
- `build/` — compile scripts (compile.ts, compile-utils.ts, compile-flows.ts, compile-library.ts)
- `dist/` — generated output (**do not edit**, gitignored)
- `defs/` — vendored type definitions from AgentBuddy (update when upstream changes)

## Hard rules (compiler-enforced)

- **No bare package imports** (`lodash`, `fs`, `zod`, etc.) — blocked by esbuild plugin
- **No Node.js globals**: `require()`, `process`, `__dirname`, `__filename`, `Buffer`, `global` — validated post-bundle
- `import type` is fine (stripped before bundling)
- Relative imports are allowed for helpers

## Action conventions

- Export `meta: ActionMeta` and `async function action(params, services, z, flowId)`
- Import types: `import type { ActionMeta, Services, Z } from '../types'`
- See `WRITING-ACTIONS.md` for full reference (services list, examples, metadata schema)

## Prompt conventions

- Export `meta: PromptMeta` and `function template(params, usePrompt)` (synchronous, returns string)
- Import types: `import type { PromptMeta } from '../types'`
- See `WRITING-PROMPTS.md` for full reference

## Helper files

- Any `.ts` file without `export const meta` is auto-detected as a helper
- Helpers are inlined into the consuming action/prompt at compile time via esbuild
- Can live in `src/actions/`, `src/prompts/`, `src/shared/`, or subdirectories

## Flow conventions

- Default export a `FlowDSL` object (`export default { ... } satisfies FlowDSL`)
- Helper files prefixed with `_` (e.g., `_patterns.ts`) are not compiled
- Flows are dynamically imported (not bundled) — they can use pattern helpers

## Typing & verification

- tsconfig at root `tsconfig.json`
- Types (`Services`, `Z`, `EntityId`, flow DSL types) come from `src/types.ts`
- Full `Services` type from generated `defs/action-defs.d.ts`
- Type check: `npm run typecheck`

## Commands

- `npm run compile:actions` — compile actions to JSON
- `npm run compile:prompts` — compile prompts to JSON
- `npm run compile:flows` — compile flows to JSON
- `npm run compile:library` — compile library markdown to JSON
- `npm run typecheck` — type check all source files

### Update vendored defs when AgentBuddy types change

For generated defs (Services, PromptService):
```bash
cd /path/to/AgentBuddy/packages/api
npm run generate:defs-types
cp defs/dist/default/*.d.ts /path/to/default-setup/defs/
```

For hand-extracted defs (EARS, FlowDSL, library, thread types): manually update from the source files listed in the defs/ section above.
