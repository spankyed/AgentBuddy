# Default — Quick Reference

Source `.ts` files in `src/actions/`, `src/prompts/`, `src/flows/` are compiled via esbuild into JSON (`dist/`) for runtime execution. Function bodies are extracted and run in a sandboxed scope — there is no module system at runtime.


### New repo structure

```
default-setup/
  defs/                         # Generated type definitions (all auto-generated via rollup)
    action-defs.d.ts            # Services type, z, ActionEntity
    prompt-defs.d.ts            # PromptService, usePrompt, PromptContext
    default-setup-defs.d.ts     # EARS, FlowDSL, library/thread/notes types

  build/                        # Compiler infrastructure
    compile.ts                  # Entry point — dispatches to action/prompt/flow/library compilers
    compile-utils.ts            # esbuild bundling, TS AST extraction, validation
    compile-flows.ts            # Flow compiler — dynamic import + validation
    compile-library.ts          # Library markdown compiler
    flow-dsl-validator.ts       # Flow DSL validation logic
    library-utils.ts            # toTitleCase, countDocs helpers

  src/
    types.ts                    # Re-exports types from defs/ for action/prompt/flow authoring
    settings.json               # Default settings (general, plugins, assistant) — read directly by API, no compilation
    actions/                    # Action source files
    prompts/                    # Prompt template source files
    flows/                      # Flow DSL files
    library/                    # Markdown docs + media
    _examples/                  # Reference examples (excluded from compilation)
  dist/                         # Generated JSON output (gitignored)
```


## Directory structure

- `src/actions/` — action source files
- `src/prompts/` — prompt template source files
- `src/flows/` — flow DSL files (dynamically imported, not bundled)
- `src/library/` — markdown docs compiled to JSON
- `src/settings.json` — default settings (general, plugins, assistant); read directly by API, no compilation needed
- `src/_examples/` — reference examples (excluded from compilation and typecheck)
- `src/types.ts` — shared type definitions (`ActionMeta`, `PromptMeta`, `Services`, `Z`, etc.)
- `build/` — compiler infrastructure (compile scripts, validator, utils)
- `dist/` — generated output (**do not edit**, gitignored)
- `defs/` — auto-generated type definitions from API rollup pipeline (do not hand-edit)

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
- Can live in `src/actions/`, `src/prompts/`, or subdirectories

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

- `npm run compile` — compile all targets (actions, prompts, flows, library, notes)
- `npm run compile:actions` — compile actions to JSON
- `npm run compile:prompts` — compile prompts to JSON
- `npm run compile:flows` — compile flows to JSON
- `npm run compile:library` — compile library markdown to JSON
- `npm run typecheck` — type check all source files
- `npm run pipeline` — compile all targets

## Importing compiled output into AgentBuddy

After compiling, import `dist/` via AgentBuddy Settings → Import Setup Pack.

### Updating defs

Type definitions in `defs/` are generated automatically during `npm run build:be` (via the API's `postbuild` step). To sync to the external repo:
```bash
npm run sync:external --workspace @app/default-setup
```
