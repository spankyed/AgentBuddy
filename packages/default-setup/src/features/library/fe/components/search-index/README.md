# Search index views (dormant)

The library's search index editor and tester. **The feature is switched off:** nothing renders these components. `fe/canvas.vue` has their imports and the `create-index`, `edit-index` and `test-index` views commented out with `[SEARCH_INDEX_FF]` tags, as do `fe/state.ts`, `fe/panel.vue` and the backend. `be/search-index/README.md` explains why it's off, lists every call site (`git grep SEARCH_INDEX_FF`) and how to turn it back on.

## Components

| File | What it is |
|---|---|
| `CreateIndexView.vue` | The create/edit view: a header, three tabs (Details, Scope, Sections) over one `SearchIndexFormData`, and save/cancel. Props `editMode?`, `initialData?: SearchIndex`. Emits `SAVE_SEARCH_INDEX(config)`, `UPDATE_SEARCH_INDEX({ indexId, config })`, `CANCEL_CREATE_INDEX`, `CANCEL_EDIT_INDEX` |
| `DetailsSection.vue` | Details tab: name, description, embedding model, index metric (`cosine` or `dot_product`) and connectors (8, 16, 32, 64) |
| `ScopeSection.vue` | Scope tab: excluded documents and excluded folders, each added through an autocomplete input, and an "exclude all subfolders" toggle |
| `SectionsConfig.vue` | Sections tab: a toggle for section-based indexing, segment rules (type Text Block, List or Field; an occurrence; a key for fields; combined or separate indexing for lists and fields), and a `{{segment N}}` template with a preview |
| `TestIndexView.vue` | Runs test searches against an index through the library plugin's state (`UPDATE_TEST_QUERY`, `EXECUTE_TEST_SEARCH`; reads `testingIndex`, `testQuery`, `testResults`, `isSearching`) and shows results grouped by document, with scores and copyable chunks |
| `form/OccurrenceInput.vue` | Occurrence input with quick picks (`first`, `last`, `all`, `N`, `N-X`) |
| `form/SegmentedSlider.vue` | Segmented control (the connectors picker) |
| `form/ToggleSwitch.vue` | Boolean toggle |

The three tab sections take `modelValue: SearchIndexFormData` and emit `update:modelValue`. The form types are in `fe/types/search-index.ts`.

## Embedding models

The model picker lists `EMBEDDING_MODELS` from `features/library/embedding-models.ts`, shared with the backend. The default is `bge-small-en-v1.5`.

- **Local (FastEmbed, no key):** `minilm-l6-v2`, `bge-small-en`, `bge-small-en-v1.5`, `bge-base-en`, `bge-base-en-v1.5`, `e5-large-multilingual`
- **API (`services.inference`, needs an OpenAI key):** `openai:text-embedding-3-small`, `openai:text-embedding-3-large`
