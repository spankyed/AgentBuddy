# Monaco DSL Definitions

Monaco editor intellisense for the action, prompt and database DSLs comes from one declaration file per DSL, built by `apack build` and carried by the pack's frontend registration.

## Pipeline

```
src/defs/{action,prompt,database}.ts            (1) Hand-authored type source
        ↓  apack build (bundleDslDefs)
dist/defs/monaco/{action,prompt,database}-defs.d.ts  (2) Bundled declarations
        ↓
src/__generated__/dsl-types-fe.ts               (3) Generated `dslTypes`, imports (2) as ?raw strings
        ↓  pack-entry-fe.ts registration's `dslTypes`, which the renderer registers
getDslTypes() → Monaco TypeScript worker        (4) The renderer's registered DSL types
```

| Stage | File | Produced by | Purpose |
|-------|------|-------------|---------|
| 1 | `src/defs/action.ts` | Hand-authored | The types and values in scope in the action DSL (services, params, z, entity types) |
| 1 | `src/defs/prompt.ts` | Hand-authored | Prompt DSL types (`usePrompt`, params, `PromptEntity`) |
| 1 | `src/defs/database.ts` | Hand-authored | EARS DSL types (`qx`, `tx`, `bp`, `spawn`, entity helpers) |
| 2 | `dist/defs/monaco/*-defs.d.ts` | `apack build` | Each entry's types bundled into one declaration file, wrapped as `declare module "@app/defs/<name>"` |
| 3 | `src/__generated__/dsl-types-fe.ts` | `apack generate-entries` | Imports (2) as `?raw` and exports `dslTypes` (one `DslTypeConfig` per DSL), which `pack-entry-fe.ts` puts in the frontend registration; nothing registers on import |

Every pack gets this: `apack build` bundles each `apack.json` `extensions.dsl` entry whose `targets` include `monaco` (`packages/apack-cli/src/build/dsl-defs.ts`, covered by `packages/apack-cli/tests/build/dsl-defs.integration.spec.ts`).

## What is inlined

The editor loads no `node_modules`, so a declaration Monaco can't resolve is a silently missing completion. The bundler inlines the pack's own modules and every `@apack/*` package, plus the packages listed in the entry's `inline` field; everything else stays an import. default-setup's `action` entry inlines `ai`, `@ai-sdk/provider`, `@ai-sdk/provider-utils`, `@ai-sdk/gateway` and `@standard-schema/spec`, the packages `services.inference`'s types reach into.

## When they are rebuilt

Anything that builds the pack rebuilds them, because they are part of `apack build`:

| Trigger | Rebuilds `dist/defs/` |
|---|---|
| `npm start` (`prebuild:be:dev` → `apack build --skip-fe`) | Yes |
| `npm run build:be`, `npm run build` (`prebuild:be` → `npm run compile`) | Yes |
| `npm run start:gen`, `npm run compile` | Yes |
| `npm run build-prod` (`build/build.sh`) | Yes |
| Branch switch on its own | No — `dist/` is gitignored; the next build refreshes it |

The declaration files are generated output: never edit them, and edit `src/defs/*.ts` instead.
