# Library search index (dormant)

Semantic search over library documents: documents are split into chunks (whole documents, or the sections and list items `segmentRules` pick), embedded, and stored in a vector index per library folder. It's switched off. The code stays here, typed where it can be, so it's easy to find and to turn back on.

## What it is

| Part | Where |
|---|---|
| Embedding models: local FastEmbed models, and API models `services.inference` runs by `provider:model` id | `../../embedding-models.ts` (shared with the index editor) |
| Embedding, chunking, index files | `service.ts` (FastEmbed for local models, `services.inference.embed`/`embedMany` for the rest; `usearch` indices) |
| Index and chunk rows, indexing, search | `repository.ts` (`SearchIndex` and `IndexedDoc` entities, declared in `abuddy.json`) |
| FastEmbed model names | `config/fastembed-mapping.ts` |
| Where indices and FastEmbed weights live | `paths.ts` (`search-indices/`, `models-cache/` in the app's data directory) |
| Types | `types/search-index.ts` (backend), `../../fe/types/search-index.ts` (index editor form) |
| Index editor views | `../../fe/components/search-index/` |

## Why it's off

`service.ts`, `repository.ts` and `config/fastembed-mapping.ts` import `fastembed` and `usearch`, which no workspace installs. default-setup's `tsconfig.json` excludes those three files, and every call site is commented out with a `[SEARCH_INDEX_FF]` tag:

- `be/system.ts`: search index events and actions (list, create, update, delete, search)
- `be/repository/commands.ts`: indexing a document when it's created or updated, and removing it from indices when it or its folder is deleted
- `fe/canvas.vue`, `fe/panel.vue`, `fe/state.ts`, `fe/components/FileSystemBrowser.vue`: the index views, the panel's index list and the Create Index button
- `features/database/fe/components/BackupRestore.vue`: backing up and restoring search indices

`git grep SEARCH_INDEX_FF` lists them.

## Turning it on

1. Install the dependencies in default-setup: `npm i fastembed usearch --workspace @app/default-setup` (last used: `fastembed@^1.14.1`, `usearch@^2.15.2`).
2. Remove the three files from default-setup's `tsconfig.json` `exclude`, and fix what the typecheck reports.
3. Restore the `[SEARCH_INDEX_FF]` call sites.
4. Bring it onto the current pack structure before shipping it:
   - register the index's queries and commands as repositories in `abuddy.json` (`searchIndexQueries`/`searchIndexCommands`), used through `repository`, instead of the module functions `be/repository/commands.ts` and `be/system.ts` import directly;
   - decide whether local FastEmbed models stay, or every embedding goes through `services.inference`;
   - unit-test indexing and search on the harness (`@abuddy/testing/harness`), with `mockInference` for the API models.
