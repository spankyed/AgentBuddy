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

`generate-entries` creates `__generated__/services.ts` which:

1. Imports all feature and pack-level services
2. Exports a `featureServices` object aggregating them
3. Exports `Services`, `Z`, and `EntityId` types

Actions access services via the `services` parameter. Systems can import services directly.

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

EARS queries and transactions are **synchronous** — do not `await` them.

```typescript
import { repository } from '@abuddy/sdk/ears';

// Query (synchronous)
const bookmarks = qx(() =>
  repository.bookmarkQueries.getAll()
);

// Transaction (synchronous)
tx(() => {
  repository.bookmarkCommands.create({ url, title });
});
```

### Repository pattern

Each feature can have a `repository/` directory with query and command modules:

```
src/features/bookmarks/be/repository/
  index.ts       # Register repository (side-effect import)
  queries.ts     # Read operations
  commands.ts    # Write operations
```

Register the repository via a side-effect import in the system file:

```typescript
// system.ts
import './repository/index';  // register repository
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

This generates a `EntityShapeRegistry` module augmentation so EARS queries return typed results.

### Constraints

- Entity types and relation kinds must be globally unique across all installed packs.
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
