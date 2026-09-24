# Services, EARS & Migrations

## Services

Services are stateless modules that systems and actions can call. They come in two flavors:

- **Feature services** — scoped to a feature, declared in `features[].services`
- **Pack-level services** — shared across the pack, declared in `packServices`

### Scaffolding

```bash
abuddy add service cache                         # pack-level
abuddy add service bookmarks --feature bookmarks # feature-level
```

### Writing a service

A service is an object exported by name. `services.<key>` is that object, so its members are what systems, actions and dependent packs call:

```typescript
// src/extensions/services/cache.ts
const store = new Map<string, unknown>();

export const cacheService = {
  get: (key: string) => store.get(key),
  set: (key: string, value: unknown) => store.set(key, value),
  clear: () => store.clear(),
};
```

There is no fixed interface: the shape is pack-specific. The export is the service object itself (an object literal or a class instance, `export const cacheService = new Cache()`), never a factory function or a class: `generate-entries` fails on one. Other exports of the module stay out of the service, so helpers the pack uses internally are imported directly. The service's type is the type of the export, and dependent packs build against it: give the export an explicit type when its inferred type would name a third-party package.

### Manifest

Each entry names the file and its export, as `"path#exportName"`. The export can come from the file itself or be re-exported (`export { cacheService } from './cache-impl'`, a barrel's `export *`); `generate-entries` resolves it with the TypeScript compiler and fails when the file or export doesn't exist, or the export is a type or function.

**Pack-level:**
```json
{
  "packServices": {
    "cache": "src/extensions/services/cache.ts#cacheService"
  }
}
```

**Feature-level:**
```json
{
  "features": [
    {
      "id": "bookmarks",
      "services": {
        "bookmarks": "src/features/bookmarks/be/services/bookmarks.ts#bookmarksService"
      }
    }
  ]
}
```

Service names (the keys) are identifiers. `abuddy add service <name>` writes both: a module exporting `<name>Service` (camelCase) and its entry.

### Generated aggregation

`generate-entries` creates `__generated__/services.ts` (import it as `#generated/services`), which:

1. Imports each feature and pack-level service export
2. Exports a `featureServices` object aggregating them (`Services` is typed from it)
3. Exports `Services`: this pack's services, its dependencies' services and the host's (`logger`, `emitter`, `appData`, `traceStore`, `inference`, `secrets`, and `repository` typed with your repositories)
4. Exports `services`, the host's services proxy typed as `Services`

```typescript
import { services } from '#generated/services';

services.cache.get('key');              // this pack's service
services.brain.listen(/* … */);         // a dependency's service
services.repository.bookmarkQueries;    // repositories (see below)
```

Actions access services via the `services` parameter. Service names are global across installed packs: the host refuses to register a pack whose service name another pack or the host already uses.

### Host services

`services` holds eight host services. The SDK implements three itself, over the running app: `logger` and `emitter` over the app's event bus, and `repository` from the app's EARS engine. The app implements the other five, `appData`, `traceStore`, `inference`, `secrets` and `filesystem` (operations on stored data, keys and files); their contracts are types in `@abuddy/sdk/services`. `services.inference` and `services.repository` are covered below:

| Service | Methods |
|---|---|
| `services.appData` | `reset()` resets the whole app as a fresh boot leaves it: deletes all stored data and API keys, then runs each pack's `onInit` and boot seed and the app's migrations. `exportBackup(targetPath, name?, databases?)` copies databases (and media) into a new backup directory. `importBackup(path)` replaces stored data with a backup and reloads memory from it, restoring the previous data on failure. `backupInfo(path)` reads a backup's metadata, or `null`. `hasOnboarded()` says whether the user finished onboarding, and `completeOnboarding()` records it; the app keeps it apart from settings, so resetting settings leaves it. |
| `services.traceStore` | Read-only access to the volatile trace store (flow execution records): `entities()`, `getEntityMeta(id)`, `getAttr(kind, id)`, `relations({ kind?, src?, tgt?, limit? })`. |
| `services.secrets` | The user's API keys, without their values: `list()` (each key's `id`, `provider`, `label`, whether it's `selected`, timestamps), `select(id)`, `rename(id, label)`, `delete(id)` and `status()` (how keys are protected). Keys are added, and their values replaced, only in Settings → Secrets. A key's `provider` (`SecretProvider`) is a model provider or `'custom'`, for keys the app's own integrations name. |
| `services.filesystem` | Files and folders on the user's disk, as UTF-8 text: `readFile(path)`, `writeFile(path, content)` (creating missing parent folders), `exists(path)`, `mkdir(path)` (with its parents), `readDir(path)` (`{ name, isDirectory }` entries), `stat(path)` (`size`, `mtime`, `isFile`, `isDirectory`), `rename(from, to)` and `remove(path)` (a folder with its contents; a missing path isn't an error). In unit tests it fails until the test mocks it with `mockService('filesystem', …)`. |
| `services.logger` | `debug`, `info`, `warn`, `error` (any arguments), sent to the app as redacted log events. In an action it's named `action:<label>`. `createLogger(source)` from `@abuddy/sdk/logger` gives a logger tagged with your own source. |
| `services.emitter` | `broadcastToPlugin(plugin, event)` (to the frontend) and `sendToSystem(system, event)` (onto the bus); `sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType, payload?, targetFlowId? })` fires a flow event. `Services` types both with your pack's events. An action is content — a row a user can edit, export and copy into another pack — so both name every feature `<packId>/<featureId>`, your own too (`'my-pack/bookmarks'`, `'default-setup/threads'`); the app's own are the pack `host`'s (`'host/application'`). The host sends to the plugin or system the name is, and throws for a name nothing is registered under, suggesting the `<packId>/<featureId>` form when a bare name matches one pack's feature. What an action sends says where it came from: your pack in `Message.from`, and the action as `action:<label>` in `Message.via`, which is also what names its logger — so a message the app couldn't deliver names the action in the same string you grep the logs for. |

Backups never include API keys; `exportBackup` copies the primary database (`lmdb`, with media) and the trace store (`volatileLmdb`). `importBackup` restores only the databases the app has, and leaves out any other a backup lists.

### API keys

The user adds keys in Settings → Secrets: several per provider (one per account, each with a label), with one selected per provider. `services.inference` uses the selected key.

- **Where they're kept:** the host stores each key's metadata in plain text and its value encrypted (AES-256-GCM) in one file in the app's data directory, readable only by the user (mode `0600`; on Windows the mode has no effect, and the file relies on the user profile's access control). The data key that encrypts values is held by the OS credential store (macOS Keychain, Windows Credential Manager, or Secret Service on Linux) and is read the first time a value is used. Where the OS has none, Settings says so when it opens (the app checks the credential store once, reading an entry that doesn't exist, so there's no item to ask access to); where the store refuses later (a locked keyring, a denied prompt), adding a key fails and Settings says so then. Either way it offers to keep the data key in a file next to the keys instead, after which it says they're unprotected. Reset deletes the keys and keeps their data key, which encrypts the keys added next: a copy of the data directory used by the same user on the same machine shares it, so resetting the copy leaves the original's keys readable. A keys file that can't be read is deleted on reset.
- **What never sees a value:** packs, the frontend, events, error reports, backups and the database. `services.secrets` has no value-reading method. Logs, including what's written with `console` (as the text the console prints), pass through redaction that replaces the values of credential fields (`apiKey`, `token`, `authorization`, …) and strings shaped like OpenAI, Anthropic, Groq and Google keys. Mistral and Cohere keys have no recognizable shape, so they're matched by hash instead: whenever the app stores or reads a key value, it records that value's SHA-256 digest (never the value), and redaction masks any long token in text whose digest it recognizes. So a prefix-less key is redacted once the app has used it since it started — which it has before any call that could log it. What that leaves: a key stored in an earlier run and not used again in this one, and a value printed run together with other characters (`MISTRAL_KEY_<value>`) rather than as a token of its own.
- **What this doesn't protect against:** code running inside the app. Packs run in the app's process with full Node.js access, so a pack could read the credential store or the file itself: installing a pack means trusting it with your keys. Other programs running as you can reach the OS credential store too, except where the OS ties an item to the app (macOS Keychain).

### Inference

`services.inference` calls models with the key the user selected for each provider in Settings → Secrets (see [API keys](#api-keys)); a call to a provider with no key, or none selected, fails naming what to do. Nothing about a call comes from the environment: each provider gets the selected key and the provider's own URL (`PROVIDER_BASE_URLS` in `@abuddy/sdk/models`), so variables like `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` can't send a call, with the user's key, somewhere else. Its calls are the AI SDK's own (`ai` 7), with `model` named by a `provider:model` id:

| Call | Returns |
|---|---|
| `generateText(options)` | the AI SDK's `generateText` result: `text`, `output`, `toolCalls`, `steps`, `usage`, … |
| `streamText(options)` | a promise of the AI SDK's `streamText` result: `stream` (parts), `textStream`, `text`, … |
| `createAgent(settings)` | a promise of the AI SDK's `ToolLoopAgent`: `generate({ prompt })` and `stream({ prompt })` loop over `instructions`, `tools` and `output` until `stopWhen` (20 steps by default); its model and key resolve on each call |
| `embed(options)` / `embedMany(options)` | the AI SDK's `embed` / `embedMany` results: `embedding` / `embeddings` |
| `generateImage(options)` | the AI SDK's `generateImage` result: `image` (`uint8Array`, `base64`, `mediaType`) and `images` |
| `generateSpeech(options)` | the AI SDK's `generateSpeech` result: `audio` |
| `transcribe(options)` | the AI SDK's `transcribe` result: `text`, `segments`, `language` |
| `rerank(options)` | the AI SDK's `rerank` result: `ranking` and `rerankedDocuments` |

Each call takes models from the providers that give that kind (`providerCapabilities` in `@abuddy/sdk/models`); a model id from another provider doesn't compile (`EmbeddingModelId`, `ImageModelId`, `SpeechModelId`, `TranscriptionModelId`, `RerankingModelId`) and fails naming the provider at runtime:

| Provider | Language | Embedding | Image | Speech | Transcription | Reranking |
|---|---|---|---|---|---|---|
| `anthropic` | ✓ | | | | | |
| `openai` | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `google` | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `groq` | ✓ | | | | ✓ | |
| `mistral` | ✓ | ✓ | | ✓ | ✓ | |
| `cohere` | ✓ | ✓ | | | | ✓ |

`@abuddy/sdk/models` exports:

| Export | What it is |
|---|---|
| `ProviderName`, `ModelId`, `ModelKind`, `ModelIdOf<K>` (and the per-kind ids above) | `provider:model` id types |
| `providerCapabilities` | The table above: provider → the model kinds it serves |
| `providerLabels` | Display names (`openai` → `OpenAI`) |
| `PROVIDER_BASE_URLS` | The URL each provider is called at |
| `availableModels` | The language model catalog, `ModelCatalogEntry[]`: `id`, `name`, optional `description`, `contextWindow`, `costPer1kInput`, `costPer1kOutput`, `capabilities` |
| `parseModelId(id)` | `{ provider, model }`, or `undefined` when the id doesn't name a known provider and a model |
| `isModelId(id)` | Type guard for the same check |

```typescript
import { isStepCount, tool } from 'ai';
import { z } from 'zod';
import { services } from '#generated/services';

// Text
const { text } = await services.inference.generateText({
  model: 'anthropic:claude-sonnet-4-5',
  instructions: 'Be brief.',
  prompt: 'Summarize this note: …',
});

// Structured output, as data or as an Output from ai
const { output } = await services.inference.generateText({
  model: 'openai:gpt-5-mini',
  prompt: 'Tag this note: …',
  output: { type: 'object', schema: z.object({ tags: z.array(z.string()) }) },  // or Output.object({ schema })
});
const { output: label } = await services.inference.generateText({
  model: 'openai:gpt-5-mini',
  prompt: 'Is this note a task or a reference?',
  output: { type: 'choice', options: ['task', 'reference'] },   // label: 'task' | 'reference'
});

// Tools, looping until the model answers (at most 5 steps)
const lookup = tool({
  description: 'Look up a note by title',
  inputSchema: z.object({ title: z.string() }),
  execute: async ({ title }) => services.repository.noteQueries.all().find((note) => note.title === title)?.content,
});
const answer = await services.inference.generateText({ model: 'openai:gpt-5', prompt: 'What does my shopping note say?', tools: { lookup }, stopWhen: isStepCount(5) });

// Streaming
const stream = await services.inference.streamText({ model: 'google:gemini-2.5-pro', prompt: 'Draft a reply' });
for await (const part of stream.textStream) process.stdout.write(part);

// An agent: instructions, tools and output, reused across calls
const planner = await services.inference.createAgent({
  model: 'anthropic:claude-opus-5',
  instructions: 'Turn notes into tasks.',
  tools: { lookup },
  output: { type: 'array', element: z.object({ task: z.string(), due: z.string().optional() }) },
});
const { output: tasks } = await planner.generate({ prompt: 'What do I need to do this week?' });

// Embeddings, images, speech and transcription
const { embeddings } = await services.inference.embedMany({ model: 'openai:text-embedding-3-small', values: ['Buy milk', 'Call Sam'] });
const { image } = await services.inference.generateImage({ model: 'openai:gpt-image-1', prompt: 'A carton of milk' });
const { audio } = await services.inference.generateSpeech({ model: 'openai:gpt-4o-mini-tts', text: 'Buy milk' });
const { text: heard } = await services.inference.transcribe({ model: 'groq:whisper-large-v3', audio: audio.uint8Array });
const { rerankedDocuments } = await services.inference.rerank({ model: 'cohere:rerank-v3.5', query: 'groceries', documents: ['Buy milk', 'Call Sam'] });
```

- **`output` takes data or an `Output`.** The data forms mirror `ai`'s `Output` helpers, and `output` in the result is typed from them:

  | `output` | Same as | Result |
  |---|---|---|
  | `{ type: 'text' }` | `Output.text()` | `string` |
  | `{ type: 'json', name?, description? }` | `Output.json()` | any JSON value |
  | `{ type: 'object', schema, name?, description? }` | `Output.object({ schema })` | the schema's type |
  | `{ type: 'array', element, minItems?, maxItems?, name?, description? }` | `Output.array({ element })` | an array of the element's type |
  | `{ type: 'choice', options, name?, description? }` | `Output.choice({ options })` | one of the options |

  An `Output` (including one you implement) passes through as is. The data form can be stored, and code that can't import `ai` can write it. `schema` and `element` take what `Output.object` does (a zod or other standard schema, or `jsonSchema()` from `ai`) or a plain JSON Schema object, as stored settings hold one: the provider gets that schema, and the result is typed `unknown` and isn't validated against it.
- **Every model is named by id,** including the one `prepareStep` (or an agent's `prepareCall`) picks for a step or call: `prepareStep: ({ stepNumber }) => stepNumber > 0 ? { model: 'openai:gpt-5-mini' } : undefined`.
- **The rest of a call's pieces are `ai`'s:** `tool`, `isStepCount` and types like `ModelMessage`. `ai` 7 is a peer dependency of `@abuddy/sdk`, installed with it (add it to your pack's own dependencies if your package manager doesn't install peers); your pack never builds a model or holds a key.
- **TypeScript 5.7 or later**, which `ai` 7's types need.
- **Actions** can't import `ai`, and don't need to: `output` as data, tools as plain `{ description, inputSchema, execute }` objects (`tool()` only returns its argument), and `stopWhen` as a function (`({ steps }) => steps.length >= 5`).
- **Unit tests** mock the service with `mockInference` (see [Testing](testing.md#models)).

Pack code never imports `@abuddy/host`, the app's private package: `abuddy build` fails a bundle that does.

---

## EARS (Entity-Attribute-Relation Store)

EARS is a lightweight in-memory graph database backed by LMDB. Packs declare entity types and relation kinds in the manifest, and use the repository pattern for data access.

The engine is its own package, `@abuddy/ears`, which packs may depend on and import directly: the app shares one instance of it with every pack, as it does `@abuddy/sdk`. Import from:

| Module | What |
|---|---|
| `#generated/ears` | Your pack's `EARS` constants and the typed `qx`, `tx`, `find*`, `createEntity*`, `updateEntity`, `getAttr` (checked against your, your dependencies' and the SDK's shapes). Use these by default |
| `#generated/repository` | `repository`, typed with your and your dependencies' repositories |
| `@abuddy/ears` | The engine's untyped API: `untypedQx`, `untypedTx`, relation, role, graph and blueprint helpers, `RepositoryError`, the core `EARS` types, `BaseEntity`, and `createEarsEngine`/`installEngine` for tests and tooling |
| `@abuddy/sdk/types` | What the SDK adds to the engine's types: its `EARS` (with the SDK's entities and relation kinds) and the SDK entity shapes |
| `@abuddy/sdk/repositories` | The SDK entities' repositories |

### Declaring entities

```json
{
  "entities": {
    "Bookmark": "Bookmark",
    "Tag": "Tag"
  },
  "relKinds": {
    "TAGGED_WITH": "tagged_with"
  }
}
```

Keys become TypeScript constants; values are runtime strings. An entity's key must be its type name (`"Bookmark": "Bookmark"`). `generate-entries` creates typed exports in `__generated__/ears.ts`:

```typescript
// Auto-generated — import from here
import { EARS } from '#generated/ears';

EARS.Entity.Bookmark  // "Bookmark"
EARS.RelKind.TAGGED_WITH  // "tagged_with"
```

### Queries and transactions

EARS queries (`qx`) and transactions (`tx`) are **synchronous** — do not `await` them.

```typescript
import { EARS, qx, tx, createEntityWithDefaults } from '#generated/ears';

const bookmarks = qx(EARS.Entity.Bookmark).pickAll();                 // typed with the Bookmark shape
const id = tx(EARS.Entity.Bookmark).batchPut({ url, title }).id();   // EARS.EntityId<'Bookmark'>
const created = createEntityWithDefaults(EARS.Entity.Bookmark, { url, title }, 'BKM');
```

A name the engine doesn't know as an entity type is read as an entity id, so the query finds nothing rather than
failing. That matters when a pack your code queries isn't installed: `qx(EARS.Entity.Bookmark)` returns an empty
list, not an error, and its rows are still there — reachable by id, and readable again as soon as the pack is back.
`#generated/ears` rejects an entity name your pack and its dependencies don't declare at compile time, so this only
bites where the name is a runtime `string`.

`tx` from `#generated/ears` checks the values of declared fields when it knows the entity:
seeded with an entity type, or with an id that carries one (see *Entity ids* below). Fields
the shape doesn't declare are still accepted, and a plain id leaves every write unchecked.

```typescript
tx(id).put('title', 'Docs')        // ok
tx(id).put('title', 42)            // compile error: title is a string
tx(id).put('clickCount', 3)        // ok: not declared, not checked
tx(plainId).put('title', 42)       // ok: a plain id doesn't say which entity it is
```

`tx` from `@abuddy/ears` is the same function, unchecked.

`qx(id).links(kinds)` returns the ids an entity links to. To read the relations themselves (their ids and `info`, such as a flow edge's handles) use `findRelations`; `getRelationStats(kind)` counts them:

```typescript
import { findRelations, getRelationStats, removeRelationById } from '@abuddy/ears';

const [edge] = findRelations({ sourceEntity: nodeId, relationType: EARS.RelKind.TRANSITIONS_TO });
edge.info;                         // { sourceHandle: 'yes' }
removeRelationById(edge.id);
getRelationStats(EARS.RelKind.CONTAINS);   // { total, uniqueSources, uniqueTargets }
```

`untypedQx` from `@abuddy/ears` is the unchecked query, for fields only known at runtime.

### Roles

A role is a string tag on an entity (`EARS.RoleKind` is a `string`; `EARS.RoleKind.Custom('pinned')` brands one). Roles are stored as attributes, so they persist with the entity.

| Call | From | Does |
|---|---|---|
| `tx(id).grant(role)` / `.revoke(role)` | `#generated/ears` | Adds / removes the role; no-op when already there / absent |
| `tx(id).ensure(role, scope?)` | `#generated/ears` | Makes `id` the only holder: revokes the role from every entity that has it (or from `scope`), then grants it |
| `qx(type).withRole(role)` | `#generated/ears` | Narrows a query to holders |
| `findWithRole(type, role)` / `findFirstWithRole(type, role)` | `#generated/ears` | Typed rows holding the role, soft-deleted rows (`deleted: true`) left out |
| `grantRole(id, role)` / `revokeRole(id, role)` | `@abuddy/ears` | Direct attribute writes; `grantRole` doesn't check for a duplicate |
| `getRoles(id)` | `@abuddy/ears` | The entity's roles, `string[]` |

### Relation and entity helpers

From `@abuddy/ears` (untyped):

| Call | Does |
|---|---|
| `createRelation(sourceId, kind, targetId)` | Same as `tx(sourceId).link(kind, targetId)` |
| `removeRelation(sourceId, kind, targetId?)` | Removes that relation; without `targetId`, every `kind` relation from the source |
| `removeRelationById(relationId)` | Removes one relation by id (from `findRelations`) |
| `destroyEntity(id)` | Hard-deletes the entity: its attributes and every relation to or from it |
| `exists(id)` | Whether any row has the id (soft-deleted rows included) |
| `countEntities(entityType)` | Rows of the type, soft-deleted rows left out |
| `isEntityType(name)` | Whether the running app has registered the entity type: the SDK's and every registered pack's |

### Blueprints

`bp(entityType)` builds a description of an entity graph; `spawn(blueprint)` writes it and returns the root id:

```typescript
import { bp, spawn } from '@abuddy/ears';

const tag = bp(EARS.Entity.Tag).attr('name', 'docs').build();
const id = spawn(
  bp(EARS.Entity.Bookmark)
    .attr('url', url)
    .grant('unread')                          // role
    .ensure('latest')                         // role only this entity holds
    .link(EARS.RelKind.TAGGED_WITH, tag)      // a nested blueprint, or an existing id
    .build(),
);
```

Nested blueprints are spawned and linked (replacing an identical existing relation). With the default `{ dedupe: true }`, a blueprint object reached twice creates one entity.

### Graph helpers

From `@abuddy/ears`; each walks relations of the given kind(s) and returns ids:

| Call | Returns |
|---|---|
| `descendants(start, kind)` / `ancestors(start, kind)` | Every entity reachable by following `kind` out of / into `start`, `start` excluded |
| `rootParent(start, kind)` | The last entity reached following `kind` backwards (`start` when it has no parent) |
| `leaves(kind, entityType?)` | Entities with no outgoing `kind` relation |
| `lowestCommonAncestor(a, b, kind)` | The nearest shared ancestor on a `kind` tree, or `null` |
| `topoSort(roots, kind, entityType?)` | `roots` and everything below them in dependency order; throws on a cycle |
| `shortestPath(src, tgt, kinds)` | The id path from `src` to `tgt`, or `null` |
| `wouldCreateCycle(src, tgt, kinds)` | `true` when `tgt` already reaches `src`, so linking `src → tgt` would close a cycle |
| `linkSymmetric(a, b, kind, info?)` | Links both directions; throws on `a === b` |

### Repository pattern

Each feature can keep its reads and writes in repository objects:

```
src/features/bookmarks/be/repository/
  queries.ts     # export const bookmarkQueries = { … }
  commands.ts    # export const bookmarkCommands = { … }
```

Declare them in the feature's `repositories` (name → `path#exportName`):

```json
{
  "features": [
    {
      "id": "bookmarks",
      "repositories": {
        "bookmarkQueries": "src/features/bookmarks/be/repository/queries.ts#bookmarkQueries",
        "bookmarkCommands": "src/features/bookmarks/be/repository/commands.ts#bookmarkCommands"
      }
    }
  ]
}
```

The generated pack entry carries them in its registration, and the app registers them with its engine before any system starts. Repository names are the app's, not the feature's: `abuddy build` fails on a name two of your features declare, or one a dependency declares, naming both, since the app refuses to register two packs that share a repository name. Use them through `repository` from `#generated/repository`, typed with your repositories and your dependencies':

```typescript
import { repository } from '#generated/repository';

repository.bookmarkCommands.create({ url, title });
```

### Trash (soft delete)

`trash` from `@abuddy/sdk/repositories` moves entities of any type to a trash instead of deleting them. A trashed entity stays stored, marked `deleted: true` with the time it was trashed (`deletedAt`); the `find*` helpers leave it out, and `findByIdRaw` still reads it.

```typescript
import { trash } from '@abuddy/sdk/repositories';

trash.move([bookmarkId]);                        // the ids it moved (not missing or already trashed ones)
trash.list<Bookmark>('Bookmark');                // the trashed bookmarks
trash.olderThan<Bookmark>('Bookmark', 7 * 24 * 60 * 60 * 1000);  // trashed more than 7 days ago
trash.restore([bookmarkId]);                     // removes both marks
trash.isTrashed(bookmarkId);
```

What trashing means beyond the marks stays with your feature: trashing an entity's children with it, or emptying the trash by deleting the entities (`tx(id).destroy()`).

### Engine instances

Each app has one EARS engine, which the app creates at startup. Everything above (`qx`, `tx`, `repository`, the helpers from `#generated/ears` and `@abuddy/ears`) acts on the engine that's *installed*; a pack never creates or replaces it in the app.

Unit tests and tooling create their own with `createEarsEngine` from `@abuddy/ears`. A new engine is empty, and shares nothing with the app's or with other engines:

```typescript
import { createEarsEngine, installEngine } from '@abuddy/ears';

const engine = createEarsEngine({ isEntityType: (name) => ['Bookmark', 'Tag'].includes(name) });
engine.query.tx('Bookmark').put('url', 'https://example.com');   // the engine's own query face
engine.query.qx('Bookmark').count();                             // 1

installEngine(engine.query);   // now the free functions (qx, tx, repository…) act on it
```

- `engine.query` has `qx`, `tx`, the finders, relation reads, graph helpers and its repository registry, untyped.
- `engine.admin` is for the code that created the engine: bulk loading, clearing (`admin.clear()`), direct attribute and relation writes. Pack code never gets it.
- `isEntityType` tells an entity type from an id: `tx('Bookmark')` creates a Bookmark only when it returns true for `'Bookmark'`.
- `installEngine(engine.query)` returns the engine it replaced, so a tool can put it back (`installEngine(undefined)` uninstalls).
- Calling `qx`, `tx` or `repository` with no engine installed throws, naming how to install one.

In a pack's unit tests you don't need any of this: `setupPackTests` from `@abuddy/testing/harness` installs an engine with your pack's and its dependencies' entity types, and gives each test a fresh one ([Testing](testing.md)).

### Entity shapes

To get typed attributes on entities, declare shapes in the manifest:

```json
{
  "entityShapes": {
    "Bookmark": {
      "source": "src/features/bookmarks/be/types.ts",
      "type": "BookmarkAttributes"
    }
  }
}
```

The shapes (yours, your dependencies' and the SDK's) type the query helpers that
`#generated/ears` exports: `qx`, `tx`, `findById`, `findByIdRaw`, `findAll`, `findWhere`, `findFirst`,
`findWithFields`, `findByIdWithFields`, `findWithRole`, `findFirstWithRole`, `createEntity`,
`createEntityWithDefaults`, `updateEntity`, `getAttr` and `getAttrs`. Of these, `@abuddy/ears`
exports only `tx`, unchecked. The `find*` helpers leave out soft-deleted rows (`deleted: true`), except
`findByIdRaw`. A shape the build can't find (a wrong `source` or `type`) fails the build. It also
exports the types `EntityShape<E>` (one entity type's shape), `OwnEntityShapes` (this pack's
declared shapes), `PackShapes` (the SDK's, the dependencies' and this pack's), `EntityName`, and
`AllEntities` (the `EARS.Entity` map). Queries seeded with a declared entity type are checked
against its shape:

```ts
import { EARS, qx } from '#generated/ears';

qx(EARS.Entity.Bookmark).where('url', u)      // ok — declared attribute
qx(EARS.Entity.Bookmark).where('urll', u)     // compile error
qx(EARS.Entity.Bookmark).pickAll()[0].title   // typed, no cast needed
qx(EARS.Entity.Bookmark).orderBy('createdAt') // BaseEntity fields are included
```

`where`, `orderBy`, `distinct`, `groupBy`, `pickAll`, `pick` and `pickOne` all narrow this way
(`pick`/`pickOne` take only declared fields and return exactly those), and `linksPick`
narrows its fields to the relation's *target* entity type. Entity types **without** a
declared shape read as `BaseEntity & Record<string, unknown>`: every field is there, but
you have to narrow a value before using it. An id carries its entity type when it comes
from a typed helper (`createEntity(EARS.Entity.Bookmark)` returns `EARS.EntityId<'Bookmark'>`),
so builders seeded with it (`qx(id)`, `findById(id)`, `updateEntity(id, …)`) are typed too;
unbranded ids (`EARS.EntityId`) and `qx()` with no seed read as undeclared.

### Entity ids

Ids carry their entity type when it's known: from `createEntity` and `tx(entityType).id()`, and
from typed queries (`ids()`, `first()`, `pick` and a row's `id`). The next call is then typed
without naming the shape:

```ts
const first = qx(EARS.Entity.Bookmark).first();   // EARS.EntityId<'Bookmark'> | null
if (first) findById(first)?.title;                 // typed with the Bookmark shape
```

A plain `EARS.EntityId` (from an event, JSON or a route) carries no entity type and is accepted
anywhere a typed one is, including `includes`/`Set.has` on a list of typed ids. Only an id of a
*different* entity type is rejected:

```ts
const openBookmark = (id: EARS.EntityId<'Bookmark'>) => { … };
openBookmark(idFromEvent);     // ok: a plain id
openBookmark(tagId);           // compile error: an EARS.EntityId<'Tag'>
```

`abuddy build` lists your entities without a shape, whose fields read as `unknown` values.

Declare every attribute you actually write. A field written at runtime but missing from
the interface (a soft-delete marker, say) becomes a compile error at its read sites.

### Entity names

The helpers take an entity type as a literal only when your pack or a dependency declares it:
an undeclared name isn't registered at runtime, so a query for it silently matches nothing.
`#generated/ears` exports the accepted names as `EntityName`. A name known only at runtime
(typed `string`) is accepted and reads as undeclared.

```ts
import { EARS, findAll, type EntityName } from '#generated/ears';

findAll(EARS.Entity.Bookmark)          // ok
findAll('Bookmark')                    // ok: declared
findAll('Bookmrk')                     // compile error
findAll(nameFromSettings)              // ok: a string, rows read as undeclared
findAll<Bookmark>(nameFromSettings)    // ok: rows read as the shape you pass

// A generic helper constrains its entity type to EntityName
function newestOf<E extends EntityName>(entityType: E) {
  return findAll(entityType).sort((a, b) => b.createdAt - a.createdAt);  // fields every entity has
}
newestOf(EARS.Entity.Bookmark)[0].title  // callers get the Bookmark shape
```

A helper generic over any string (`<E extends string>(entityType: E)`) is rejected, because
TypeScript can't check a name it doesn't know yet. Constrain it to `EntityName`, or pass
`entityType as string` to opt out. To use another pack's entities, declare that pack in
`dependencies`: this also brings in its shapes.

### Constraints

- Entity types and relation kinds must be globally unique across all installed packs.
- The SDK owns a few entity types and relation kinds, which every pack has and none declares:
  - `Relation`: every link between entities is stored as one (`RelationEntity`).
  - The flow model its flow compiler, flow seeder and steps API use: `Flow`, `Node`, `TNode`, `Action` and `Prompt` (`FlowEntity`, `NodeBase`, `TNodeEntity`, `ActionEntity`, `PromptEntity`), and the `contains`, `transitions_to`, `instance_of`, `spawned` and `tracked` relation kinds.
  - Your step node types extend `NodeBase` (`interface PingNode extends NodeBase`). Your pack reads `Node` rows as the union of its own and its dependencies' step node types (each pack's facade exports them as `PackStepNodes`), or as `NodeBase` when none define any.
  - The SDK owns these entities' repositories too, exported from `@abuddy/sdk/repositories`: `flowRepository` (flows, nodes, edges, the root flow, `importFromDSL`), `tnodeRepository`, `actionRepository` and `promptRepository`. Call them directly; they aren't in `services.repository`, which holds packs' repositories (default-setup's `flowsQueries`, `actionQueries` and `promptQueries` expose them by reference and add their views, so its code uses `repository` alone; a pack of yours can do the same).
  - Settings, library documents and notes belong to default-setup (`Settings`, `Document`, `Collection`, `Note`); a pack depending on it uses them like any dependency's entities. The app's own state (onboarding, versions, seed hashes) isn't an entity packs see: ask `services.appData.hasOnboarded()`. API keys aren't entities: the host keeps them ([API keys](#api-keys)).
  - `TNode` rows are execution records. They and their relations are written to the volatile trace store instead of the primary database, and aren't loaded back into memory at startup; read past runs with `services.traceStore`.
- External packs cannot use `partitionPolicy` (routing entity types to the volatile store is reserved for the built-in pack).

---

## Migrations

Migrations are version-targeted data transformations that run on app boot when the stored pack version is below the target.

### Scaffolding

```bash
abuddy add migration --version 0.2.0
```

Creates `src/migrations/0.2.0.ts` and lists it in `src/migrations/index.ts`.

### Writing a migration

```typescript
import type { PackMigration } from '@abuddy/sdk/framework';

export const migration: PackMigration = {
  target: '0.2.0',
  description: 'Add default tags to bookmarks',
  up() {
    // Migration logic
    // Use idempotent guards: check if the change is needed before applying
  },
};
```

### Rules

- **Target the next release version** — migrations run when `stored_version < target <= pack_version` (the pack's manifest version; for the built-in pack, the app's).
- **Idempotent guards** — always check if the change is needed before applying, since migrations may re-run.
- **Never bump `package.json` version** — the release process handles version bumps.
- **One file per version** — multiple changes targeting the same version go in the same file.

### Registration

```typescript
// src/migrations/index.ts
import type { PackMigration } from '@abuddy/sdk/framework';
import { migration as v020 } from './0-2-0';

export const migrations: PackMigration[] = [
  v020,
];
```

### Manifest

```json
{
  "migrations": "src/migrations/index.ts"
}
```
