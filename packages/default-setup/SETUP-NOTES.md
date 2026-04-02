# Default Extraction — Setup Notes

This repo was extracted from `AgentBuddy/packages/api/default/` to be developed independently.

## What was done

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

### Import rewiring

All content files (`actions/`, `prompts/`, `flows/`) had their imports changed:
- `from '../types'` → `from '../src/types'` (types.ts moved into src/)
- Deeper nested files (e.g. `actions/onboarding/steps/`) adjusted proportionally
- `actions/mock-block-helpers.ts`: `from '../../src/systems/threads/types'` → `from '../defs/thread-types'`

Compiler files in `src/` had their `@/` path alias imports rewired to `../defs/`:
- `@/systems/flows/dsl/validator` → `../defs/flow-dsl-validator`
- `@/systems/library/export-types` → `../defs/library-export-types`
- `@/systems/library/utils` → `../defs/library-utils`
- Path resolution changed from `import.meta.dirname` (default/) to `path.resolve(import.meta.dirname, '..')` (project root)

### Changes made in AgentBuddy

**`packages/api/rollup-defs.config.mjs`** — Added default output targets that generate unwrapped `.d.ts` files (no `declare module` wrapper) to `packages/api/defs/dist/default/`. These provide full `Services` and `PromptService` types for IDE autocomplete.

Run `npm run generate:defs-types` in AgentBuddy to regenerate. Output lands in `packages/api/defs/dist/default/`.

### Verified working

- `npm run typecheck` — passes (checks src/ and defs/ only; action/prompt/flow content is esbuild-compiled)
- `npm run compile:actions` — 7 actions compiled
- `npm run compile:prompts` — 4 prompts compiled
- `npm run compile:flows` — 7 flows compiled (from 4 files)
- `npm run compile:library` — 4 library docs compiled
- Round-trip: compiled output copied back to AgentBuddy, both BE and FE typechecks pass

## How to use

### Compile and export to AgentBuddy

```bash
npm run compile:actions
npm run compile:prompts
npm run compile:flows
npm run compile:library

# Copy back to AgentBuddy
cp -r dist/* /path/to/AgentBuddy/packages/api/default/dist/
```

### Update vendored defs when AgentBuddy types change

For generated defs (Services, PromptService):
```bash
cd /path/to/AgentBuddy/packages/api
npm run generate:defs-types
cp defs/dist/default/*.d.ts /path/to/default-setup/defs/
```

For hand-extracted defs (EARS, FlowDSL, library, thread types): manually update from the source files listed in the defs/ section above.

## Still in AgentBuddy (not removed yet)

The original `packages/api/default/` directory remains in AgentBuddy as a fallback. Once this standalone repo is fully validated, the source content and compilers can be removed from AgentBuddy — keeping only `default/dist/` as the landing zone for manually-copied output.

## Known issues

- `compile-library.ts` auto-executes when imported by `compile.ts`, so library compilation runs as a side effect during action/prompt/flow compilation too. Pre-existing behavior from the original.
- Action/prompt/flow content files have some type errors under strict checking against the generated `Services` type (e.g. `ModelConfig` shape mismatch). These are pre-existing — the content files are compiled by esbuild, not tsc, so this doesn't affect runtime. The tsconfig only checks `src/` and `defs/`.
