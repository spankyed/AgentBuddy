# SDK Seed Internalization

Move flow DSL infrastructure (compiler, validator, decompiler) and notes import logic into the SDK so seeder factories are self-contained. Remove the `deps` leaked abstraction from the manifest.

## Problem

Three problems compound into one:

1. **Leaked abstraction**: `abuddy.json` has a `deps` field that exposes SDK factory parameter names (`validate`, `compile`, `isFlowConfig`, `importNotesFromData`). Pack authors must hand-author these mappings with no guidance on what's needed or why.

2. **Hardcoded step types**: `config/types.ts` has 12 step-specific entity shapes (`ActionNode`, `LLMNode`, `SwitchNode` ...) and `dsl/types.ts` has 11 matching DSL types (`DSLActionNode`, `DSLLLMNode` ...). Both are centralized in the flows feature. Adding or modifying a step type means editing a central file that shouldn't know about individual steps.

3. **SDK-pack boundary mismatch**: The DSL compiler, validator, and decompiler live in the pack but are generic infrastructure — they dispatch to per-step build facets via the step registry. They belong in the SDK alongside the step registry they depend on.

## Dependency Chain

```
Step type ownership
       │
       ▼
Flow base types → SDK          (FlowEntity, EdgeEntity, NodeBase, CompilerContext, CompiledFlow)
       │
       ▼
Compiler/Validator/Decompiler → SDK    (they import base types + step registry)
       │
       ▼
importNotesFromData → SDK              (independent, but same pattern)
       │
       ▼
Self-contained seeder factories        (import compile/validate/importNotes internally)
       │
       ▼
Remove deps from manifest + codegen
```

Step type ownership is the prerequisite because:
- Moving `config/types.ts` to SDK with hardcoded step types makes the SDK aware of individual steps — wrong direction
- The decompiler (`export-dsl.ts`) imports `NodeEntity`, `EdgeEntity`, `FlowEntity` from config/types — these must be SDK-owned base types before the decompiler can move
- The compiler hardcodes `step.type === 'switch'` for branching — must be generalized through step registry first

---

## Phase 1 — Step Type Ownership

**Goal**: Each step owns its DSL node type and entity shape type. Central files provide only base types and derived unions.

### 1a. Add `branches()` to StepBuildFacet

The compiler and validator hardcode `switch` knowledge in 4 places:
- `registerInlineSwitchStepIds()` — traverses `conditions[].steps` and `else`
- `wireSwitchEdges()` — wires edges into condition branches
- `compileStepList()` — checks `step.type === 'switch'` for edge wiring
- Validator — recursively validates inline steps inside switch conditions

Add an optional method to `StepBuildFacet` in `packages/abuddy-sdk/src/steps/types.ts`:

```ts
export interface StepBuildFacet {
  // ... existing methods ...

  /**
   * Return inline branch paths for steps that contain nested step lists.
   * Each branch has a key (used for edge handle naming) and its inline steps.
   * Omit for steps with no branching.
   */
  branches?(dslNode: Record<string, unknown>): { key: string; steps: Record<string, unknown>[] }[];
}
```

Implement for switch step in `extensions/steps/switch/build.ts`:

```ts
export function branches(node: Record<string, unknown>): { key: string; steps: Record<string, unknown>[] }[] {
  const result: { key: string; steps: Record<string, unknown>[] }[] = [];
  const conditions = node.conditions as any[] ?? [];
  for (let i = 0; i < conditions.length; i++) {
    if (Array.isArray(conditions[i].steps)) {
      result.push({ key: `c${i}`, steps: conditions[i].steps });
    }
  }
  if (Array.isArray(node.else) && (node.else as any[]).length > 0) {
    result.push({ key: 'else', steps: node.else as any[] });
  }
  return result;
}
```

Wire it into the switch step definition's `build` facet.

### 1b. Extract Per-Step DSL Types from `dsl/types.ts`

Currently `dsl/types.ts` lines 79–180 define 11 step-specific DSL interfaces that are only used for TypeScript documentation — the compiler/validator work with `Record<string, unknown>` via step registry.

For each step, add a `types.ts` in its directory:

```
extensions/steps/action/types.ts    → DSLActionNode, ActionNode
extensions/steps/llm/types.ts       → DSLLLMNode, LLMNode
extensions/steps/switch/types.ts    → DSLSwitchNode, DSLSwitchCondition, SwitchNode, Condition, Predicate
extensions/steps/fire/types.ts      → DSLFireNode, FireNode
extensions/steps/query/types.ts     → DSLQueryNode, QueryNode
extensions/steps/create/types.ts    → DSLCreateNode, CreateNode
extensions/steps/update/types.ts    → DSLUpdateNode, UpdateNode
extensions/steps/transform/types.ts → DSLTransformNode, TransformNode
extensions/steps/flow/types.ts      → DSLFlowNode, FlowNode
extensions/steps/keep-alive/types.ts→ DSLKeepAliveNode, KeepAliveNode
extensions/steps/kill/types.ts      → DSLKillNode, KillNode
```

Each DSL type extends `DSLNodeBase` (stays in SDK's `flow-types.ts`). Each entity type extends `NodeBase` (moves to SDK in Phase 2).

### 1c. Derive Union Types

Replace the hardcoded unions in `config/types.ts` and `dsl/types.ts`:

**`config/types.ts`** — `NodeEntity` becomes a re-export barrel:
```ts
// Re-export base from SDK
export type { NodeBase, FlowEntity, EdgeEntity } from '@abuddy/sdk/build';

// Import per-step entity types
export type { ActionNode } from '@/extensions/steps/action/types';
export type { LLMNode } from '@/extensions/steps/llm/types';
// ... all steps ...

// Derived union
export type NodeEntity = ActionNode | LLMNode | SwitchNode | /* ... */;
```

**`dsl/types.ts`** — `DSLStepNode` becomes a re-export barrel:
```ts
// Re-export base from SDK
export type { FlowDSL, FlowConfig, Track, DSLNodeBase } from '@abuddy/sdk/build';
export { isFlowConfig, resolveTracks, ROOT_FLOW_ROLE } from '@abuddy/sdk/build';

// Import per-step DSL types
export type { DSLActionNode } from '@/extensions/steps/action/types';
// ... all steps ...

// Derived union
export type DSLStepNode = DSLActionNode | DSLLLMNode | /* ... */;
```

### 1d. Verification

- `npm run typecheck` passes (both FE and BE)
- All existing tests pass unchanged
- Zero functional change — this is a pure type reorganization

### Files Modified (Phase 1)
| File | Change |
|---|---|
| `packages/abuddy-sdk/src/steps/types.ts` | Add `branches?` to `StepBuildFacet` |
| `packages/default-setup/src/extensions/steps/switch/build.ts` | Add `branches()` export |
| `packages/default-setup/src/extensions/steps/switch/index.ts` | Wire `branches` into build facet |
| `packages/default-setup/src/extensions/steps/*/types.ts` | NEW — per-step types (11 files) |
| `packages/default-setup/src/features/flows/be/config/types.ts` | Becomes re-export barrel |
| `packages/default-setup/src/features/flows/be/dsl/types.ts` | Becomes re-export barrel (SDK + step types) |

---

## Phase 2 — Move Flow Infrastructure Types to SDK

**Goal**: SDK owns the base types that the compiler/validator/decompiler need.

### 2a. Move Base Entity Types

Move from `config/types.ts` to a new `packages/abuddy-sdk/src/build/compilers/flow-entities.ts`:

- `FlowEntity` (parameterized: accept entity type enum value, not `EARS.Entity.Flow` literal)
- `NodeBase` (same parameterization)
- `EdgeEntity`
- `NodeKind` (generic: `string`)
- `NodeCreateInput`
- `FlowsConnectedData` — stays in pack (it imports `ActionEntity`, `PromptEntity` from pack-generated types)
- `ModelCatalogEntry` — stays in pack (pack-specific data)

### 2b. Move Compiler Output Types

Move from `dsl/types.ts` to SDK `flow-entities.ts` (or companion file):

- `CompiledFlow`, `CompiledEntity`, `CompiledRelation`, `CompiledRole`
- `CompilerContext` (or unify with existing `StepCompileContext`)
- `ValidationError`, `ValidationResult` (already in SDK as re-exports from `seed-compiler`)

### 2c. Delete Pack Duplicates

`dsl/types.ts` currently duplicates SDK's `flow-types.ts` for: `FlowDSL`, `FlowConfig`, `Track`, `isFlowConfig`, `resolveTracks`, `ROOT_FLOW_ROLE`. After Phase 1c made it a re-export barrel, these are already pointing at SDK. Verify no local definitions remain.

### 2d. Export from SDK Build Barrel

Add new exports to `packages/abuddy-sdk/src/build/compilers/index.ts` and `packages/abuddy-sdk/src/build/index.ts`:

```ts
export type { FlowEntity, NodeBase, EdgeEntity, NodeKind, CompiledFlow, CompiledEntity, CompiledRelation, CompiledRole, CompilerContext } from './compilers';
```

### Files Modified (Phase 2)
| File | Change |
|---|---|
| `packages/abuddy-sdk/src/build/compilers/flow-entities.ts` | NEW — base entity + compiler output types |
| `packages/abuddy-sdk/src/build/compilers/index.ts` | Export new types |
| `packages/abuddy-sdk/src/build/index.ts` | Export new types |
| `packages/default-setup/src/features/flows/be/config/types.ts` | Import base types from SDK |
| `packages/default-setup/src/features/flows/be/dsl/types.ts` | Import compiler types from SDK |
| `packages/default-setup/src/extensions/steps/*/types.ts` | Import `NodeBase` from SDK |

---

## Phase 3 — Move Compiler / Validator / Decompiler to SDK

**Goal**: The flow compilation pipeline lives in the SDK, parameterized on EARS constants.

### 3a. Move Compiler

`packages/default-setup/src/features/flows/be/dsl/compiler.ts` (491 lines) → `packages/abuddy-sdk/src/build/compilers/flow-compiler.ts`

Key changes:
- Replace `import { EARS } from '@/__generated__/ears'` → accept EARS entity/relation enums as parameter
- Replace `DSLSwitchNode` special-casing → use `stepRegistry.getBuild(step.type).branches?.(step)` from Phase 1a
- Use generic `DSLStepNode` (already `{ type: string; [key: string]: unknown }` pattern in the compiler)
- Import `CompilerContext`, `CompiledFlow`, etc. from SDK's own types
- Export the `compile()` function and `CompiledRows` type

The compiler's entry point becomes:
```ts
export function compile(
  dsl: Record<string, any>,
  ctx: CompilerContext,
  ears: { Entity: Record<string, any>; RelKind: Record<string, any> },
): CompiledFlow[]
```

### 3b. Consolidate Validator

The pack's `dsl/validator.ts` (384 lines) and SDK's `build/compilers/flow-dsl-validator.ts` (371 lines) are near-identical. The SDK version already exists and uses `stepRegistry`.

Consolidate into the SDK version:
- Verify the pack version has no capabilities the SDK version lacks
- Replace `switch` special-casing with `branches()` dispatch
- Delete pack's `dsl/validator.ts`

### 3c. Move Decompiler

`packages/default-setup/src/features/flows/be/dsl/export-dsl.ts` (423 lines) → `packages/abuddy-sdk/src/build/compilers/flow-decompiler.ts`

Key changes:
- Replace `import { EARS } from '@/__generated__/ears'` → accept EARS as parameter
- Replace `import { NodeEntity, EdgeEntity, FlowEntity } from '../config/types'` → import from SDK (Phase 2)
- Replace `import { FLOW_ROLES } from '../repository/index'` → accept as parameter or move constant
- Import `stepRegistry` from SDK (already does)

The decompiler's entry point becomes:
```ts
export function exportFlowsDSL(
  options: ExportOptions,
  ears: { Entity: Record<string, any>; RelKind: Record<string, any> },
): FlowDSL
```

### 3d. Update Pack Consumers

After the move, update imports in:
- `flows/be/repository/index.ts` — imports `CompiledRows` from dsl/compiler, `ROOT_FLOW_ROLE` from dsl/types
- `flows/be/dsl/export-to-dsl.ts` (CLI tool) — imports `exportFlowsDSL`
- `flows/be/dsl/index.ts` (barrel) — re-exports from SDK instead of local files

The pack's `dsl/` directory shrinks to:
- `index.ts` — barrel re-exporting from SDK + step-derived union types
- `types.ts` — re-export barrel (SDK base + step DSL types + derived union)
- `export-to-dsl.ts` — CLI entry point (calls SDK's exportFlowsDSL with pack's EARS)
- `examples/` — example DSL files (static data, stays)

### 3e. Rebuild pack-cli

After SDK changes: `npm run build` in `packages/pack-cli` so tsup bundles the updated SDK.

### Files Modified (Phase 3)
| File | Change |
|---|---|
| `packages/abuddy-sdk/src/build/compilers/flow-compiler.ts` | NEW — moved from pack |
| `packages/abuddy-sdk/src/build/compilers/flow-decompiler.ts` | NEW — moved from pack |
| `packages/abuddy-sdk/src/build/compilers/flow-dsl-validator.ts` | Updated — consolidated, uses `branches()` |
| `packages/abuddy-sdk/src/build/compilers/index.ts` | Export compile, exportFlowsDSL |
| `packages/abuddy-sdk/src/build/index.ts` | Export compile, exportFlowsDSL |
| `packages/default-setup/src/features/flows/be/dsl/compiler.ts` | DELETE |
| `packages/default-setup/src/features/flows/be/dsl/validator.ts` | DELETE |
| `packages/default-setup/src/features/flows/be/dsl/export-dsl.ts` | DELETE |
| `packages/default-setup/src/features/flows/be/dsl/index.ts` | Re-export barrel from SDK |
| `packages/default-setup/src/features/flows/be/repository/index.ts` | Update imports |

---

## Phase 4 — Move `importNotesFromData` to SDK

**Goal**: The notes import function lives in the SDK, parameterized on EARS.

### 4a. Move Function

`packages/default-setup/src/features/notes/be/import-notes.ts` has three functions:
- `importNotesFromData(data)` — pure in-memory import, all deps already from SDK
- `importNotes(importDir)` — file-based, calls importNotesFromData
- `importNotesMarkdown()` — markdown-based, calls importNotesFromData

Move `importNotesFromData` to `packages/abuddy-sdk/src/seed/import-notes.ts`:
- Parameterize on EARS entity constants (currently uses `EARS.Entity.Note`, `EARS.RelKind.CONTAINS`)
- `ExportedNote` and `ExportedNotes` types already exist in SDK's compilers barrel
- `NoteEntity` type can be replaced with `Record<string, unknown>` or moved as a base type

Keep `importNotes` and `importNotesMarkdown` in the pack — they're file-based utilities that call the SDK function.

### 4b. Update Notes Seeder Consumer

`import-notes.ts` line 12 is consumed by `notes/be/system.ts`. After the move, it imports from the pack's remaining wrapper (which re-exports from SDK).

### Files Modified (Phase 4)
| File | Change |
|---|---|
| `packages/abuddy-sdk/src/seed/import-notes.ts` | NEW — importNotesFromData |
| `packages/abuddy-sdk/src/seed/index.ts` | Export importNotesFromData |
| `packages/default-setup/src/features/notes/be/import-notes.ts` | Remove importNotesFromData, import from SDK |

---

## Phase 5 — Self-Contained Seeder Factories + Manifest Cleanup

**Goal**: Seeder factories import their dependencies internally. Pack authors never see `deps`.

### 5a. Simplify createFlowSeeder

```ts
// Before: createFlowSeeder({ ears, validate, compile, isFlowConfig })
// After:  createFlowSeeder(ears)

import { compile } from '../build/compilers/flow-compiler';
import { validateFlowDSL } from '../build/compilers/flow-dsl-validator';
import { isFlowConfig } from '../build/compilers/flow-types';

export function createFlowSeeder(ears: any): Seeder {
  // Uses compile, validateFlowDSL, isFlowConfig directly — no deps injection
}
```

Delete `FlowSeederDeps` interface.

### 5b. Simplify createNotesSeeder

```ts
// Before: createNotesSeeder({ ears, importNotesFromData })
// After:  createNotesSeeder(ears)

import { importNotesFromData } from './import-notes';

export function createNotesSeeder(ears: any): Seeder {
  // Uses importNotesFromData directly
}
```

Delete `NotesSeederDeps` interface.

### 5c. Remove `deps` from Manifest Schema

In `packages/abuddy-sdk/src/build/manifest.ts`:
```ts
// Before
export interface SeedEntryConfig { path: string; deps?: Record<string, string>; }

// After
export type SeedEntryConfig = string;  // Just the path
```

### 5d. Simplify Codegen

In `packages/abuddy-sdk/src/build/generate-entries.ts`, remove the deps-handling block (the `byPath`, `packImports`, deps wiring). All seeder factories get `(EARS)` or `()`:

```ts
if (factory) {
  seedImports.add(factory);
  registrations.push(
    key === 'settings'
      ? `registerSeeder(${factory}());`
      : `registerSeeder(${factory}(EARS));`
  );
  continue;
}
```

### 5e. Revert Manifest Entries

`abuddy.json` flows and notes entries revert to simple strings:
```jsonc
// Before
"flows": { "path": "src/features/flows/be/dsl", "deps": { ... } }
"notes": { "path": "src/features/notes/be/import-notes", "deps": { ... } }

// After
"flows": "src/seeds/flows"
"notes": "src/seeds/notes"
```

### 5f. Rebuild + Regenerate

1. `npm run build` in pack-cli (rebundles SDK)
2. `abuddy generate-entries` in default-setup (regenerates seeders.ts)
3. Verify generated seeders.ts has no deps imports

### Files Modified (Phase 5)
| File | Change |
|---|---|
| `packages/abuddy-sdk/src/seed/flow-seeder.ts` | Remove deps, import internally |
| `packages/abuddy-sdk/src/seed/notes-seeder.ts` | Remove deps, import internally |
| `packages/abuddy-sdk/src/build/manifest.ts` | Remove deps from SeedEntryConfig |
| `packages/abuddy-sdk/src/build/generate-entries.ts` | Remove deps codegen |
| `packages/default-setup/abuddy.json` | Revert flows/notes to simple strings |

---

## Phase 6 — Move Tests to SDK

### Test inventory

| Pack test | Tests what | Move to SDK? |
|---|---|---|
| `tests/unit/dsl-validator.spec.ts` | `validate()` | Yes — tests SDK's validator |
| `tests/unit/_hybrid/dsl-compiler.spec.ts` | `compile()` | Yes — tests SDK's compiler |
| `tests/unit/_hybrid/dsl-round-trip.spec.ts` | compile → export round-trip | Yes — tests SDK's compiler + decompiler |
| `tests/unit/brain-switch-node.spec.ts` | Runtime switch behavior | No — tests pack-level runtime, uses step entity types |
| `tests/unit/_hybrid/helpers/dsl-factories.ts` | Test helper for compile | Yes — moves with compiler tests |
| `tests/unit/_hybrid/helpers/fixtures.ts` | FlowDSL fixtures | Yes |
| `tests/unit/_hybrid/helpers/load-compiled.ts` | CompiledRows loader | Yes |
| `tests/unit/_hybrid/helpers/round-trip.ts` | Round-trip helper | Yes |

Move destination: `packages/abuddy-sdk/tests/build/` (alongside existing `flow-dsl-validator.spec.ts`)

Update imports from pack paths (`@/features/flows/be/dsl/...`) to SDK paths.

The hybrid tests need EARS — they'll use the same test EARS setup the SDK validator test already uses, or a test fixture.

### Files Modified (Phase 6)
| File | Change |
|---|---|
| `packages/abuddy-sdk/tests/build/flow-compiler.spec.ts` | NEW — moved from pack |
| `packages/abuddy-sdk/tests/build/flow-round-trip.spec.ts` | NEW — moved from pack |
| `packages/abuddy-sdk/tests/build/helpers/` | NEW — moved from pack |
| `packages/default-setup/tests/unit/dsl-validator.spec.ts` | DELETE |
| `packages/default-setup/tests/unit/_hybrid/dsl-compiler.spec.ts` | DELETE |
| `packages/default-setup/tests/unit/_hybrid/dsl-round-trip.spec.ts` | DELETE |

---

## Phase 7 — Cleanup

### Delete empty directories
- `packages/default-setup/src/features/flows/be/dsl/compiler.ts` — already deleted in Phase 3
- `packages/default-setup/src/features/flows/be/dsl/validator.ts` — already deleted in Phase 3
- `packages/default-setup/src/features/flows/be/dsl/export-dsl.ts` — already deleted in Phase 3
- If dsl/ only has `index.ts` + `types.ts` + `export-to-dsl.ts` + `examples/`, keep it

### Verify no remaining duplicates
- `grep -r 'FlowDSL\|DSLStepNode\|CompilerContext\|CompiledFlow' packages/default-setup/src/features/flows/be/dsl/types.ts` — should be re-exports only
- `grep -r 'isFlowConfig\|resolveTracks\|ROOT_FLOW_ROLE' packages/default-setup/src/features/flows/be/dsl/types.ts` — should be re-exports only

### Final verification
1. `npm run typecheck` — FE + BE
2. `npm test` — all tests pass
3. `npm run compile` — DSL compilation works
4. `npm start` — app boots, flows seed correctly
5. `abuddy generate-entries` — codegen produces clean output with no deps

---

## What Stays in the Pack

After all phases, flows-related pack code is:

| Path | Purpose | Why it stays |
|---|---|---|
| `features/flows/be/config/types.ts` | Re-export barrel: SDK base types + step entity types → `NodeEntity` union | Frontend/repository need the typed union |
| `features/flows/be/config/node-config.ts` | Node metadata proxy over step registry | Pack-level convenience for frontend |
| `features/flows/be/config/available-models.ts` | Model catalog data | Pack-specific data |
| `features/flows/be/dsl/index.ts` | Re-export barrel from SDK | Convenience for pack consumers |
| `features/flows/be/dsl/types.ts` | Re-export barrel: SDK generic + step DSL types → `DSLStepNode` union | Pack-level typed union |
| `features/flows/be/dsl/export-to-dsl.ts` | CLI tool (calls SDK's exportFlowsDSL) | CLI entry point, not library code |
| `features/flows/be/dsl/examples/` | Example DSL files | Static data |
| `features/flows/be/repository/` | EARS read/write layer | Pack-specific repository code |
| `features/flows/be/system.ts` | Backend system machine | Pack-specific system |
| `features/notes/be/import-notes.ts` | File-based import wrappers (importNotes, importNotesMarkdown) | File I/O utilities calling SDK's importNotesFromData |

## What Moves to the SDK

| Destination | Source | Lines |
|---|---|---|
| `sdk/build/compilers/flow-compiler.ts` | `dsl/compiler.ts` | ~491 |
| `sdk/build/compilers/flow-decompiler.ts` | `dsl/export-dsl.ts` | ~423 |
| `sdk/build/compilers/flow-dsl-validator.ts` | Consolidated with existing | ~384 |
| `sdk/build/compilers/flow-entities.ts` | `config/types.ts` base types + `dsl/types.ts` compiler output types | ~80 |
| `sdk/seed/import-notes.ts` | `notes/be/import-notes.ts` (importNotesFromData only) | ~200 |
| `sdk/tests/build/flow-compiler.spec.ts` | Pack hybrid tests | ~588 |
| `sdk/tests/build/flow-round-trip.spec.ts` | Pack hybrid tests | ~470 |

## Risks

1. **EARS parameterization**: The compiler/validator use `EARS.Entity.Flow`, `EARS.RelKind.CONTAINS`, etc. as literal enum values. Moving to SDK means accepting these as parameters. Risk: type safety weakens from enum to `any`. Mitigation: use a typed interface for the EARS parameter shape.

2. **Step registry timing**: The compiler imports `stepRegistry` and calls `.getBuild()`. Steps must be registered before compilation runs. This is already true today — no new risk, but worth noting since registration order becomes cross-package.

3. **Pack-cli rebuild**: SDK changes require `npm run build` in pack-cli before `abuddy generate-entries` picks them up (tsup `noExternal: ['@abuddy/sdk']`). This is the existing workflow but easy to forget.

4. **Test EARS fixture**: Hybrid tests need a running EARS instance. The SDK tests will need a test fixture or mock EARS setup. The existing SDK validator test (`flow-dsl-validator.spec.ts`) may already have this — check before moving tests.
