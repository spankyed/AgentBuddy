# Repository-level tests

Tests that call default-setup's repositories and backend modules directly, without `startApp`. They import only default-setup (`@/…`), `@abuddy/sdk` and `@abuddy/ears`, never the API or `@abuddy/host`, and run on the harness from `tests/setup.ts` like the rest of the unit suite. The export and flows specs also empty the database in their own `beforeEach` with `resetTestData()` from `@abuddy/sdk/testing` (a fresh engine, keeping the repositories the harness registered from the pack's registration). The directory's name is historical: these specs once imported the API's EARS and repository modules too.

| Spec | Covers | Imports |
|---|---|---|
| `actions-export.spec.ts` | `exportActions`: exported fields and metadata, directory creation, an empty export, export → re-import round trip | `repository` (`@/__generated__/repository`), `@/features/actions/be/repository` (a side-effect import that registers nothing: the repositories come from the pack's registration), `@/features/actions/be/repository/export-actions`, `helpers/action-fixtures.ts` |
| `prompts-export.spec.ts` | `exportPrompts`: the same cases for prompts | `repository`, `@/features/prompts/be/repository`, `@/features/prompts/be/repository/export-prompts`, `helpers/prompt-fixtures.ts` |
| `flows-repository.spec.ts` | Flow node validation: schedule cron expressions on create and update, draft nodes of other types | `RepositoryErrorCode` (`@abuddy/ears`), `repository`, `@/features/flows/be/repository` |
| `brain-trigger-dedupe.spec.ts` | `dedupeMatchingTriggerNodes`: duplicate track keys dropped with a warning, nodes without a track key and parallel tracks kept | `@/features/brain/be/trigger-dedupe`, `EARS` (`@/__generated__/ears`) |

`helpers/action-fixtures.ts` and `helpers/prompt-fixtures.ts` hold the seeded action and prompt definitions.
