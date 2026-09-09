# Manifest Reference

The `abuddy.json` file at the root of your pack is the single source of truth. It declares features, extensions, seeds, entities, dependencies, and boot-time hooks. The CLI reads it to generate code, compile seeds, and bundle your pack.

## Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Unique pack identifier (kebab-case) |
| `name` | `string` | yes | Human-readable display name |
| `version` | `string` | yes | Semver version (e.g. `"0.1.0"`) |
| `description` | `string` | no | Short description |
| `hostVersion` | `string` | no | Semver range of compatible host versions (e.g. `">=0.3.0"`) |
| `license` | `string` | no | SPDX license identifier |
| `builtIn` | `boolean` | no | `true` for the built-in pack only |
| `features` | `PackFeatureEntry[]` | no | Feature declarations (system + plugin bundles) |
| `steps` | `string \| { register, definitions[] }` | no | Flow step registration |
| `artifacts` | `string` | no | Path to artifact registration file |
| `blocks` | `string` | no | Path to block registration file |
| `migrations` | `string` | no | Path to migrations index file |
| `packServices` | `Record<string, string>` | no | Pack-level service modules (`key` -> `path`) |
| `defaultPlugin` | `string` | no | Feature ID of the default sidebar plugin |
| `entities` | `Record<string, string>` | no | EARS entity type declarations |
| `relKinds` | `Record<string, string>` | no | EARS relation kind declarations |
| `dependencies` | `Record<string, string>` | no | Pack dependencies (`id` -> semver or `github:owner/repo range`) |
| `permissions` | `string[]` | no | Required capabilities: `ears`, `llm`, `filesystem`, `network`, `terminal` |
| `boot` | `PackBootConfig` | no | Boot-time hooks |
| `fe` | `object` | no | FE-only registrations |
| `partitionPolicy` | `object` | no | EARS persistence routing (built-in only) |
| `entityShapes` | `Record<string, { source, type }>` | no | Entity type -> TS interface mappings |
| `dsl` | `Record<string, DslEntry>` | no | DSL definitions for build-time compilation |
| `seedTypes` | `string[]` | no | Seed type identifiers |

## Features

The `features` array is the primary way to add functionality. Each entry bundles a backend system, frontend plugin, settings, and services.

```json
{
  "features": [
    {
      "id": "bookmarks",
      "designation": "bookmarks",
      "settings": "src/features/bookmarks/settings.ts",
      "system": {
        "entry": "src/features/bookmarks/be/system.ts",
        "exportName": "bookmarksEntry"
      },
      "plugin": {
        "entry": "src/features/bookmarks/fe/plugin.ts",
        "label": "Bookmarks",
        "icon": "Bookmark"
      },
      "services": {
        "bookmarks": "src/features/bookmarks/be/services/bookmarks"
      }
    }
  ]
}
```

### PackFeatureEntry fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Unique feature identifier |
| `designation` | `string` | no | Links the system to an EARS designation |
| `settings` | `string` | no | Path to default settings file |
| `system` | `{ entry, exportName, outgoingEventsType? }` | no | Backend system module |
| `plugin` | `{ entry, label, icon, isPinned? }` | no | Frontend plugin definition |
| `services` | `Record<string, string>` | yes | Service modules (`key` -> `path`) |
| `typesEntry` | `string` | no | Additional types to include in the generated type barrel |
| `earlySystem` | `boolean` | no | Run before EARS hydration (built-in only) |
| `contributions` | `string` | no | Path to contribution type providers |

A feature can have just a system (backend-only), just a plugin (frontend-only), or both.

## Steps

Flow step definitions can be declared as a simple path or a structured object:

```json
{
  "steps": {
    "register": "src/extensions/steps/register.ts",
    "definitions": [
      { "type": "my-step", "path": "src/extensions/steps/my-step", "kind": "step" },
      { "type": "my-trigger", "path": "src/extensions/steps/my-trigger", "kind": "trigger" }
    ]
  }
}
```

The `register` path points to a hand-maintained barrel file that imports and exports all step definitions. The `definitions` array is used by `generate-entries` for flow-helper codegen.

### StepEntry fields

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Step type identifier |
| `path` | `string` | Directory containing the step definition |
| `kind` | `"step" \| "trigger"` | Whether this is a regular step or a trigger |
| `dsl` | `object` | Optional DSL configuration for flow-helper generation |

## Boot configuration

The `boot` object configures hooks that run during app startup:

```json
{
  "boot": {
    "createDefaultSettings": "src/default-settings.ts",
    "seed": {
      "actions": "src/seeds/actions",
      "prompts": "src/seeds/prompts",
      "flows": { "path": "src/seeds/flows" }
    },
    "seedPolicy": {
      "skipAtBoot": ["flows"],
      "skipAfterOnboarding": ["onboarding"]
    },
    "shutdown": "src/shutdown.ts"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `earlySystem` | `string` | System that boots before EARS hydration (built-in only) |
| `createDefaultSettings` | `string` | Module that ensures default settings exist |
| `seed` | `Record<string, string \| SeedEntryConfig>` | Seed data sources (actions, prompts, flows, etc.) |
| `seedPolicy` | `object` | Controls which seed types to skip at boot or after onboarding |
| `shutdown` | `string` | Module called on app shutdown |

### SeedEntryConfig

When a seed value is an object instead of a string path:

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Directory containing seed source files |
| `seeder` | `string` | Custom seeder module path |
| `entityType` | `string` | EARS entity type for collection seeders |
| `lookupField` | `string` | Field used to deduplicate seeded entities |

## Frontend configuration

```json
{
  "fe": {
    "tiptapPlugins": "src/registries/tiptap-plugins.ts",
    "appExtensions": {
      "welcome": "src/extensions/Welcome.vue"
    },
    "styles": "src/styles/global.css"
  }
}
```

## Dependencies

```json
{
  "dependencies": {
    "other-pack": ">=0.1.0",
    "github-pack": "github:user/repo >=0.2.0"
  }
}
```

Dependencies are resolved in order: local workspace -> `.abuddy/deps/` cache -> GitHub releases -> registry (future). Run `abuddy fetch-deps` to pull dependency type manifests for cross-pack type interop.

## Entities and relations

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

Keys become TypeScript constants in the generated `ears.ts`, values are the runtime strings stored in the database. Entity types and relation kinds must be globally unique across all installed packs.

## Example manifest

```json
{
  "id": "bookmarks",
  "name": "Bookmarks",
  "version": "0.1.0",
  "hostVersion": ">=0.3.0",
  "license": "MIT",

  "entities": {
    "Bookmark": "Bookmark"
  },

  "features": [
    {
      "id": "bookmarks",
      "settings": "src/features/bookmarks/settings.ts",
      "system": {
        "entry": "src/features/bookmarks/be/system.ts",
        "exportName": "bookmarksEntry"
      },
      "plugin": {
        "entry": "src/features/bookmarks/fe/plugin.ts",
        "label": "Bookmarks",
        "icon": "Bookmark"
      },
      "services": {}
    }
  ],

  "steps": {
    "register": "src/extensions/steps/register.ts",
    "definitions": []
  },

  "boot": {
    "seed": {
      "actions": "src/seeds/actions",
      "flows": "src/seeds/flows"
    }
  }
}
```
