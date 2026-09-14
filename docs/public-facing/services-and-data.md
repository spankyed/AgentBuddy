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

```typescript
// src/extensions/services/cache.ts
export function createCacheService() {
  const store = new Map<string, unknown>();
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    clear: () => store.clear(),
  };
}
```

There is no fixed interface — the shape is pack-specific. Services are typically factory functions that return an object with methods.

### Manifest

**Pack-level:**
```json
{
  "packServices": {
    "cache": "src/extensions/services/cache.ts"
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
        "bookmarks": "src/features/bookmarks/be/services/bookmarks"
      }
    }
  ]
}
```

### Generated aggregation

`generate-entries` creates `__generated__/services.ts` (import it as `#generated/services`), which:

1. Imports all feature and pack-level services
2. Exports a `featureServices` object aggregating them
3. Exports `Services`: this pack's services, its dependencies' services and the host's (`logger`, `emitter`, `appData`, `traceStore`, and `repository` typed with your repositories)
4. Exports `services`, the host's services proxy typed as `Services`

```typescript
import { services } from '#generated/services';

services.cache.get('key');              // this pack's service
services.llm.streamText(/* … */);       // a dependency's service
services.repository.bookmarkQueries;    // repositories (see below)
```

Actions access services via the `services` parameter. Service names are global across installed packs: the host refuses to register a pack whose service name another pack or the host already uses.

### Host data services

The host implements operations on the app's stored data as a whole; packs call them through `services`:

| Service | Methods |
|---|---|
| `services.appData` | `reset()` deletes all stored data and reopens empty stores. `exportBackup(targetPath, name?, databases?)` copies databases (and media) into a new backup directory. `importBackup(path)` replaces stored data with a backup and reloads memory from it, restoring the previous data on failure. `backupInfo(path)` reads a backup's metadata, or `null`. |
| `services.traceStore` | Read-only access to the volatile trace store (flow execution records): `entities()`, `getEntityMeta(id)`, `getAttr(kind, id)`, `relations({ kind?, src?, tgt?, skipDeleted?, limit? })`. |

Pack code never imports `@abuddy/host`, the app's private package: `abuddy build` fails a bundle that does.

---

## EARS (Entity-Attribute-Relation Store)

EARS is a lightweight in-memory graph database backed by LMDB. Packs declare entity types and relation kinds in the manifest, and use the repository pattern for data access.

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

Keys become TypeScript constants; values are runtime strings. `generate-entries` creates typed exports in `__generated__/ears.ts`:

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

`tx` from `#generated/ears` checks the values of declared fields when it knows the entity:
seeded with an entity type, or with an id that carries one (see *Entity ids* below). Fields
the shape doesn't declare are still accepted, and a plain id leaves every write unchecked.

```typescript
tx(id).put('title', 'Docs')        // ok
tx(id).put('title', 42)            // compile error: title is a string
tx(id).put('clickCount', 3)        // ok: not declared, not checked
tx(plainId).put('title', 42)       // ok: a plain id doesn't say which entity it is
```

`tx` from `@abuddy/sdk/ears` is the same function, unchecked.

`qx(id).links(kinds)` returns the ids an entity links to. To read the relations themselves (their ids and `info`, such as a flow edge's handles) use `findRelations`; `getRelationStats(kind)` counts them:

```typescript
import { findRelations, getRelationStats, removeRelationById } from '@abuddy/sdk/ears';

const [edge] = findRelations({ sourceEntity: nodeId, relationType: EARS.RelKind.TRANSITIONS_TO });
edge.info;                         // { sourceHandle: 'yes' }
removeRelationById(edge.id);
getRelationStats(EARS.RelKind.CONTAINS);   // { total, uniqueSources, uniqueTargets }
```

`untypedQx` from `@abuddy/sdk/ears` is the unchecked query, for fields only known at runtime.

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

The generated pack entry registers them before any system starts. Use them through `repository` from `#generated/repository`, typed with your repositories and your dependencies':

```typescript
import { repository } from '#generated/repository';

repository.bookmarkCommands.create({ url, title });
```

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
`#generated/ears` exports: `qx`, `tx`, `findById`, `findAll`, `findWhere`, `findFirst`,
`findWithFields`, `findWithRole`, `createEntity`, `createEntityWithDefaults`, `updateEntity`,
`getAttr` and `getAttrs`. Of these, `@abuddy/sdk/ears` exports only `tx`, unchecked. A shape the
build can't find (a wrong `source` or `type`) fails the build. Queries seeded with a declared
entity type are checked against its shape:

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
  - Your step node types extend `NodeBase` (`interface PingNode extends NodeBase`). Your pack reads `Node` rows as the union of its own and its dependencies' step node types, or as `NodeBase` when none define any.
  - The data the SDK's settings seeder and its services write and read: `Settings` (`SettingsEntity`) and `Secret` (`SecretEntity`). Library documents and notes belong to default-setup (`Document`, `Collection`, `Note`); a pack depending on it uses them like any dependency's entities.
  - `TNode` rows are execution records and are never persisted, and `Secret` rows are kept in the secrets store.
- External packs cannot use `partitionPolicy` (entity routing to excluded/secrets stores is reserved for the built-in pack).

---

## Migrations

Migrations are version-targeted data transformations that run on app boot when the stored pack version is below the target.

### Scaffolding

```bash
abuddy add migration --version 0.2.0
```

Creates `src/migrations/0-2-0.ts`.

### Writing a migration

```typescript
import type { PackMigration } from '@abuddy/sdk/build';

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

- **Target the next release version** — migrations run when `stored_version < target <= app_version`.
- **Idempotent guards** — always check if the change is needed before applying, since migrations may re-run.
- **Never bump `package.json` version** — the release process handles version bumps.
- **One file per version** — multiple changes targeting the same version go in the same file.

### Registration

```typescript
// src/migrations/index.ts
import type { PackMigration } from '@abuddy/sdk/build';
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
