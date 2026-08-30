# Hybrid Tests

Tests that import from both `@/features/*` (default-setup) and `@/core/*` or `@/repository` (api).
They live here so they're clearly separated from pure feature tests.

## API Core Dependencies

| Test | API deps | Why |
|---|---|---|
| `actions-export.spec.ts` | `@/core/ears/attribute-storage`, `@/repository` | Tests export-actions repository function — needs EARS memory + repository proxy |
| `prompts-export.spec.ts` | `@/core/ears/attribute-storage`, `@/repository` | Tests export-prompts repository function — same as above |
| `flows-repository.spec.ts` | `@/core/ears/attribute-storage`, `@/core/shared/repository/errors`, `@/repository` | Tests flows CRUD + validation — needs EARS + repository proxy + error types |
| `dsl-compiler.spec.ts` | `@/core/types` (EARS enum only) | Compiler output references entity types |
| `dsl-round-trip.spec.ts` | (indirect via `helpers/round-trip.ts`) | Round-trip helper uses EARS transaction layer |
| `brain-trigger-dedupe.spec.ts` | `@/core/types` (EARS enum only) | References entity type constants |

### Integration
| `claude-code-permission-flow.integration.spec.ts` | `@/core/shared/resolve-cli` | Needs CLI path resolution |

## Separation Plan

To make these pure default-setup tests:

1. **`@/core/types` (EARS enum)** — Already migrated to `@/registries/ears`. Once the `@/core/types` re-export is dropped, `dsl-compiler` and `brain-trigger-dedupe` become pure feature tests.

2. **`@/repository` (proxy + registerRepository)** — The repository proxy lives in api but serves features. Moving it to `@abuddy/sdk` would let feature tests import it without crossing into api core.

3. **`@/core/ears/*` (attribute-storage, transaction)** — EARS runtime is api infrastructure. The SDK's `initEARSRuntime` pattern (Phase 0 of the plan) would expose test-friendly EARS helpers via `@abuddy/sdk`, decoupling feature tests from api internals.

4. **`@/core/shared/repository/errors`** — Small error types module. Can move to SDK alongside the repository proxy.

5. **`@/core/shared/resolve-cli`** — CLI resolution utility. Can move to SDK or become a feature-local helper.
