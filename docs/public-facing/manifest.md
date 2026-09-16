# Manifest Reference

The `abuddy.json` file at the root of your pack is the single source of truth. It declares features, extensions, seeds, entities, dependencies, and boot-time hooks. The CLI reads it to generate code, compile seeds, and bundle your pack.

## Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | `string` | no | JSON Schema reference for editor validation |
| `$manifestVersion` | `1` | no | Schema version. Enables future format evolution. |
| `id` | `string` | yes | Unique pack identifier: a lowercase letter, then lowercase letters, digits and hyphens (`^[a-z][a-z0-9-]*$`) |
| `name` | `string` | yes | Human-readable display name |
| `version` | `string` | yes | Semver version, starting with `major.minor.patch` (e.g. `"0.1.0"`, `"0.2.0-beta.1"`) |
| `description` | `string` | no | Short description |
| `hostVersion` | `string` | no | Semver range of compatible host versions (e.g. `">=0.3.0"`) |
| `license` | `string` | no | SPDX license identifier |
| `builtIn` | `boolean` | no | `true` for packs built into the app only |
| `features` | `PackFeatureEntry[]` | no | Feature declarations (system + plugin bundles) |
| `steps` | `{ register, build?, definitions[] }` | no | Flow step registration. `build` is a barrel of build-only step facets (no FE or runtime imports), shipped as `build/steps.build.mjs` so packs depending on yours validate flows with your step code; `abuddy init` scaffolds it and `abuddy add step` adds to it |
| `artifacts` | `string` | no | Path to artifact registration file |
| `blocks` | `string` | no | Path to block registration file |
| `migrations` | `string` | no | Path to migrations index file |
| `packServices` | `Record<string, string>` | no | Pack-level services, in the same form as [`features[].services`](#packfeatureentry-fields) |
| `commands` | `{ name, placeholder }[]` | no | Slash commands the pack adds to the chat: `name` as typed after the `/` (`^[a-z][a-z0-9-]*$`, unique across the app: `abuddy build` fails when a dependency, or anything it depends on, declares it), `placeholder` what the composer shows after it. Sending one fires a `user.command` event your flows handle; see [Slash commands](seeds.md#slash-commands) |
| `defaultPlugin` | `string` | no | Feature ID of the default sidebar plugin |
| `entities` | `Record<string, string>` | no | EARS entity type declarations; see [Entities and relations](#entities-and-relations) |
| `relKinds` | `Record<string, string>` | no | EARS relation kind declarations; see [Entities and relations](#entities-and-relations) |
| `dependencies` | `Record<string, string>` | no | Pack dependencies (`id` -> semver, `github:owner/repo range`, or `file:path`) |
| `permissions` | `string[]` | no | Required capabilities: `ears`, `llm`, `filesystem`, `network`, `terminal` |
| `boot` | `PackBootConfig` | no | Boot hooks and seeds; see [Boot configuration](#boot-configuration) |
| `fe` | `object` | no | FE-only registrations; see [Frontend configuration](#frontend-configuration) |
| `partitionPolicy` | `{ excludedEntityTypes?: string[] }` | no | Entity types kept in memory only, never persisted. Built-in packs only: the app ignores it for an external pack, with a warning |
| `entityShapes` | `Record<string, { source, type }>` | no | Entity type -> TS interface mappings |
| `seedFormats` | `Record<string, SeedFormatConfig>` | no | Named seed formats: how a source becomes records. `boot.seed` entries name them, dependents as `<pack id>:<name>`; see [Seeds](seeds.md#seeding-entities) |
| `seedHooks` | `Record<string, string>` | no | Seed hooks for entity types this pack declares: the entity type's value in `entities` -> `path#exportName` of a `SeedHooks` object (`find`, `create`, `update`, `remove`, all optional). Every pack seeding that type goes through them; see [Seeds](seeds.md#seed-hooks) |
| `dsl` | `Record<string, DslEntry>` | no | Monaco editor type definitions for code the app edits; see [DSL definitions](#dsl-definitions) |

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
        "entry": "src/features/bookmarks/be/system.ts"
      },
      "plugin": {
        "entry": "src/features/bookmarks/fe/plugin.ts"
      },
      "services": {
        "bookmarks": "src/features/bookmarks/be/services/bookmarks.ts#bookmarksService"
      }
    }
  ]
}
```

### PackFeatureEntry fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Unique feature identifier: a lowercase letter, then letters and digits (`^[a-z][a-zA-Z0-9]*$`, e.g. `notes`, `calendarEvents`). It becomes an identifier in generated code |
| `designation` | `string` | no | Links the system to an EARS designation. Must equal the feature `id` (`abuddy validate` checks it) |
| `settings` | `string` | no | Path to a module default-exporting the feature's default settings; see [Feature settings](#feature-settings) |
| `system` | `{ entry, outgoingEventsType?, sendsTo?, events? }` | no | Backend system module. `entry` must **default-export** its `SystemEntry`. `sendsTo` lists plugins it sends events to besides its own feature's (other features of the pack, dependency plugins, or `application`); each one's `emit` type then accepts this system's outgoing events. `events.incoming` lists event types the bus routes to the system besides those its machine declares. |
| `plugin` | `{ entry }` | no | Frontend plugin module. `entry` must **default-export** its `Plugin`, which carries the plugin's `id`, `label`, `icon` and `isPinned` |
| `services` | `Record<string, string>` | no | Services. Keys are identifiers, the names on `services`; values are `"path#exportName"`: a source file and the name of its export holding the service object (an object literal or class instance, not a factory). See [Services](services-and-data.md#services) |
| `repositories` | `Record<string, string>` | no | Repository objects. Keys are identifiers, the names on `repository`; values are `"path#exportName"`. Registered by the generated pack entry and typed on `repository` from `#generated/repository` |
| `typesEntry` | `string` | no | Additional types to include in the generated type barrel |
| `earlySystem` | `boolean` | no | Start this feature's system before EARS hydration. Built-in packs only: validation rejects it in an external pack |
| `contributions` | `string` | no | Path to contribution type providers. Built-in packs only: ignored for external packs |

A feature can have just a system (backend-only), just a plugin (frontend-only), or both.

### Feature settings

The `settings` module default-exports the feature's defaults, which the app registers when the pack loads. It may set only the feature's own plugin settings and its sidebar visibility:

```typescript
// src/features/bookmarks/settings.ts
export default {
  plugins: {
    _meta: { visibility: { bookmarks: true } },
    bookmarks: { sortBy: 'date' },
  },
};
```

Any other key (a top-level key other than `plugins`, another plugin's `plugins.<id>`, or `_meta` keys other than `visibility.<feature id>` set to a boolean) fails `abuddy build`.

## Steps

Flow step definitions use the structured object form.

```json
{
  "steps": {
    "register": "src/extensions/steps/register.ts",
    "build": "src/extensions/steps/build.ts",
    "definitions": [
      { "type": "my-step", "path": "src/extensions/steps/my-step", "kind": "step" },
      { "type": "my-trigger", "path": "src/extensions/steps/my-trigger", "kind": "trigger" }
    ]
  }
}
```

The `register` path points to a hand-maintained barrel file that imports and exports all step definitions. The `definitions` array is used by `generate-entries` for flow-helper codegen.

The `build` path points to a second barrel with only each step's build facet (`compile`, `validate`, `decompile`, `getLabel`, trigger facets) and no FE or runtime imports. `abuddy build` bundles it to `dist/build/steps.build.mjs`, and packs that depend on yours load it to validate their flows with your step code. Without `build`, the CLI validates this pack's own flows with `register`, and dependents get no step code.

### StepEntry fields

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Step type identifier |
| `path` | `string` | Directory containing the step definition |
| `kind` | `"step" \| "trigger"` | Whether this is a regular step or a trigger |
| `dsl` | `{ primaryField?, defaultLabel?, custom? }` | Generates a flow helper for the step, named after the type (`keep_alive` → `keepAlive`). Without `dsl`, the step gets no helper |

A step's `dsl` fields:

| Field | Helper |
|---|---|
| `primaryField` | `name(<primaryField>: string, opts?)`, with the other fields of the `export interface DSL…Node` in the step's `types.ts` (required) as options |
| `defaultLabel` | `name(label = defaultLabel)` |
| `custom: true` | No generated helper: re-exports the step's own `helpers` module |
| `{}` | `name(label?)` |

## Boot configuration

The `boot` object configures hooks that run during app startup:

```json
{
  "boot": {
    "hooks": "src/hooks.ts",
    "seed": {
      "actions": "src/seeds/actions",
      "prompts": "src/seeds/prompts",
      "flows": { "path": "src/seeds/flows" }
    },
    "seedPolicy": {
      "skipAtBoot": ["flows"],
      "skipAfterOnboarding": ["onboarding"]
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `hooks` | `string` | Module exporting lifecycle hooks (see below) |
| `seed` | `Record<string, string \| SeedEntryConfig>` | Seed sources: `actions`, `prompts`, `flows` and `settings` take a path; any other key is `{ path, format }` or `{ seeder }`. `settings` (the app's defaults) is for built-in packs only; declare a feature's defaults with `features[].settings` |
| `seedPolicy` | `object` | Controls which seed types to skip at boot or after onboarding |

The `hooks` module's named exports become the pack's boot hooks:

```typescript
// src/hooks.ts
export const onInit = () => ensureDefaults();     // after EARS hydration, before migrations and seeds
export const onShutdown = () => stopProcesses(); // when the pack's backend stops (app exit, pack unload or reload)
```

| Export | Runs |
|---|---|
| `onInit` | Once per boot, after EARS hydration and before migrations and seeds. Create rows the pack's systems expect to exist here |
| `onShutdown` | When the pack's backend stops. Release what outlives its actors: processes, timers, listeners |

A system that must start before hydration is a feature with `earlySystem: true`, not a boot hook.

### SeedEntryConfig

`actions`, `prompts`, `flows` and `settings` accept a path or `{ "path": … }`. Any other key is one of:

| Shape | Description |
|---|---|
| `{ "path", "format" }` | `path`: source directory or file, relative to the pack root. `format`: a name in this pack's `seedFormats`, or `"<dependency id>:<name>"` for a dependency's; that dependency must be declared in `dependencies` |
| `{ "seeder" }` | A pack module exporting `seed(ctx)`, used instead of a format and the generic seeder |

An entry can't carry format settings, and an unknown key given a path string fails validation. See [Seeds](seeds.md#seeding-entities) for examples.

### SeedFormatConfig

A `seedFormats` value, keyed by the format name: a lowercase letter, then lowercase letters, digits and hyphens. It needs exactly one of `format` and `compiler`.

| Field | Type | Description |
|---|---|---|
| `format` | `"markdown-tree" \| "json"` | Compile an entry's source with a built-in format: a directory of markdown, or a JSON array of records |
| `compiler` | `string` | A module in this pack whose default export compiles an entry's source into records. Bundled into `dist/build/seed-compilers.mjs` for dependents |
| `entity` | `string \| string[]` | Entity types the records seed (the pack's, a dependency's or the SDK's). Omitted, entries are compiled but not seeded |
| `identity` | `string[]` | Fields matched to find an existing row (`"parent"` = the tree parent). Ignored when the type's owning pack registers a `find` seed hook |
| `tree` | `{ branch?, branchEntity?, relKind? }` | Walk subdirectories as parent rows: a directory's own file, its entity type, and the parent → child relation (default `contains`) |
| `fields` | `Record<string, { from, default?, type? }>` | `markdown-tree` only: record field → `body`, `filename`, `path` or `frontmatter.<name>` |
| `media` | `string` | Directory under an entry's `path` copied with the seeds; `media/<file>` links become `media://<id>/<file>` |

## Frontend configuration

```json
{
  "fe": {
    "tiptapPlugins": "src/extensions/tiptap/index.ts",
    "appExtensions": {
      "welcome": "src/extensions/Welcome.vue"
    },
    "bundleUi": false
  }
}
```

| Field | Type | Description |
|---|---|---|
| `tiptapPlugins` | `string` | Tiptap plugin registration module |
| `appExtensions` | `Record<string, string>` | Named app extensions: extension name → Vue component path |
| `bundleUi` | `boolean` | Bundle a copy of `@abuddy/ui` into the pack instead of using the app's (default `false`). All of `@abuddy/ui` is bundled, so the pack never mixes the two. |

The frontend entry itself isn't declared here: `abuddy build` bundles `src/pack-entry-fe.ts` (or `.js`) if present, else the generated `src/__generated__/pack-entry-fe.ts`, into the bundle's `runtime/fe.js`, with any extracted styles as `runtime/fe.css`. The app loads whichever of those two files the installed bundle has.

## Dependencies

```json
{
  "dependencies": {
    "other-pack": ">=0.1.0",
    "github-pack": "github:user/repo >=0.2.0",
    "local-pack": "file:../path/to/pack"
  }
}
```

Three dependency formats are supported:

| Format | Example | Description |
|---|---|---|
| Semver range | `">=0.1.0"`, `"*"` | Resolves from this machine (the workspace, the app configured for `abuddy test`, installed apps), then the `.abuddy/deps/` cache |
| `github:` | `"github:user/repo >=0.2.0"` | Resolves from GitHub releases (optional semver filter) |
| `file:` | `"file:../other-pack"` | Resolves from a local filesystem path (relative to pack root or absolute). Always reads fresh — skips cache. Ideal for local development. |

Resolution order for semver and `github:` deps: the workspace (`../<id>`, `../../packages/<id>`, `../../<id>`) -> the app configured for `abuddy test` -> installed AgentBuddy apps -> `.abuddy/deps/` cache -> GitHub releases (`github:` only). Each must satisfy the range. `file:` deps resolve directly from the given path and do not fall through to other resolvers. See [`abuddy fetch-deps`](cli.md#abuddy-fetch-deps).

Run `abuddy fetch-deps` to pull dependency snapshots for cross-pack type interop.

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

The SDK defines the entity types `Relation`, `Flow`, `Node`, `TNode`, `Action`, `Prompt` and `Settings`, and the relation kinds `CONTAINS` (`contains`), `TRANSITIONS_TO`, `INSTANCE_OF`, `SPAWNED` and `TRACKED`, for every pack. A pack can't declare them, neither the key nor the value.

## DSL definitions

```json
{
  "dsl": {
    "action": {
      "entry": "src/defs/action.ts",
      "targets": ["monaco"],
      "prefix": "action:",
      "inline": ["ai"],
      "globals": { "services": "typeof _dsl.services" }
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `entry` | `string` | Module whose types are bundled into the definitions |
| `targets` | `["monaco"]` | Editors that get the definitions |
| `prefix` | `string` | Editor models whose path starts with it get these definitions (e.g. `action:`) |
| `inline` | `string[]` | Packages whose declarations are bundled into the definitions besides your own modules and `@abuddy/*`. The editor loads no `node_modules`, so a type it needs from another package belongs here; everything else stays an import |
| `globals` | `Record<string, string>` | Globals in scope and their types. With `globals`, the generated FE entry registers the definitions from `dist/defs/monaco/<name>-defs.d.ts` |

For each entry with a `monaco` target, `abuddy build` writes `dist/defs/monaco/<name>-defs.d.ts`: the entry's types bundled into one declaration file, wrapped as `declare module "@app/defs/<name>"`.

## Example manifest

```json
{
  "id": "bookmarks",
  "name": "Bookmarks",
  "version": "0.1.0",
  "hostVersion": ">=0.3.0",
  "license": "MIT",

  "dependencies": {
    "default-setup": "*"
  },

  "entities": {
    "Bookmark": "Bookmark"
  },

  "features": [
    {
      "id": "bookmarks",
      "settings": "src/features/bookmarks/settings.ts",
      "system": {
        "entry": "src/features/bookmarks/be/system.ts"
      },
      "plugin": {
        "entry": "src/features/bookmarks/fe/plugin.ts"
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
