# Manifest Reference

The `abuddy.json` file at the root of your pack is the single source of truth. It declares features, extensions, content, entities, dependencies, and boot-time hooks. The CLI reads it to generate code, compile content, and bundle your pack.

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
| `features` | `Record<string, PackFeatureEntry>` | no | Feature declarations (system + plugin bundles), keyed by feature id |
| `steps` | `Record<string, StepEntry>` | no | Flow step types, keyed by type. Each names its facets: `build` (or `trigger`), `fe`, `runtime` and `dsl`. The build facets are shipped as `build/steps.build.mjs`, so packs depending on yours validate flows with your step code; see [Steps](extensions.md#steps) |
| `artifacts` | `Record<string, { icon, fe? }>` | no | Artifact types, keyed by type; see [Artifacts](extensions.md#artifacts) |
| `blocks` | `Record<string, { kind?, fe?, be? }>` | no | Message blocks, keyed by type; see [Blocks](extensions.md#blocks) |
| `migrations` | `string` | no | Path to migrations index file |
| `packServices` | `Record<string, string>` | no | Pack-level services, in the same form as [a feature's `services`](#packfeatureentry-fields) |
| `commands` | `{ name, placeholder }[]` | no | Slash commands the pack adds to the chat: `name` as typed after the `/` (`^[a-z][a-z0-9-]*$`, unique across the app: `abuddy build` fails when a dependency, or anything it depends on, declares it), `placeholder` what the composer shows after it. Sending one fires a `user.command` event your flows handle; see [Slash commands](content.md#slash-commands) |
| `entities` | `Record<string, string>` | no | EARS entity type declarations; see [Entities and relations](#entities-and-relations) |
| `relKinds` | `Record<string, string>` | no | EARS relation kind declarations; see [Entities and relations](#entities-and-relations) |
| `dependencies` | `Record<string, string>` | no | Pack dependencies (`id` -> semver, `github:owner/repo range`, or `file:path`) |
| `permissions` | `string[]` | no | Required capabilities: `ears`, `llm`, `filesystem`, `network`, `terminal` |
| `boot` | `PackBootConfig` | no | Boot hooks and content; see [Boot configuration](#boot-configuration) |
| `fe` | `object` | no | FE-only registrations; see [Frontend configuration](#frontend-configuration) |
| `entityShapes` | `Record<string, { source, type }>` | no | Entity type -> TS interface mappings |
| `content.formats` | `Record<string, ContentFormatConfig>` | no | Named content formats: how a source becomes records. `content.sources` entries name them, dependents as `<pack id>:<name>`; see [Content](content.md#writing-entities) |
| `content.writers` | `Record<string, string>` | no | Content writers for entity types this pack declares: the entity type's value in `entities` -> `path#exportName` of a `ContentWriter` object (`find`, `create`, `update`, `remove`, all optional). Every pack writing that type goes through them; see [Content](content.md#content-hooks) |
| `dsl` | `Record<string, DslEntry>` | no | Monaco editor type definitions for code the app edits; see [DSL definitions](#dsl-definitions) |

## Features

The `features` map is the primary way to add functionality. Each entry is keyed by its feature id and bundles a backend system, frontend plugin, settings, and services.

```json
{
  "features": {
    "bookmarks": {
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
  }
}
```

### PackFeatureEntry fields

| Field | Type | Required | Description |
|---|---|---|---|
The entry's **key** is the feature id: a lowercase letter, then letters and digits
(`^[a-z][a-zA-Z0-9]*$`, e.g. `notes`, `calendarEvents`). It becomes an identifier in generated code, so
JavaScript reserved words (`default`, `export`, …) aren't allowed. Being a key is what makes a duplicate id
unrepresentable.

| `designation` | `string` | no | Links the system to an EARS designation. Must equal the feature `id` (`abuddy validate` checks it) |
| `settings` | `string` | no | Path to a module default-exporting the feature's default settings; see [Feature settings](#feature-settings) |
| `system` | `{ entry, contract?, events? }` | no | Backend system module. `entry` must **default-export** its `SystemEntry`; how it's declared doesn't matter. `contract` is `"path#Export"` of the system's contract — a declared type holding its `incoming`, `internal`, `outgoing` and `context` (`SystemContract`, `@abuddy/sdk/framework`) — which the build reads without running or resolving the machine, so it lives in a leaf module such as `be/contract.ts`. Omit it for a system that sends and receives nothing. What its plugin receives is the contract's outgoing events; a plugin that also takes events from another feature or another pack declares those itself, in its own `Contract` (`plugin.contract`). `events.incoming` lists event types the bus routes to the system besides those its machine declares. |
| `plugin` | `{ entry, contract?, default? }` | no | Frontend plugin module. `entry` must **default-export** its `Plugin`, which carries the plugin's `id`, `label`, `icon` and `isPinned`. `contract` is `"path#exportName"` of the plugin's contract — a declared type holding the state it publishes and the inbox others may send to (`PluginInbox`, `@abuddy/sdk/fe`). Put it in a leaf module your plugin's machine doesn't import, so codegen can read it without resolving the machine; omit it for a plugin that publishes nothing, which still receives its own feature's system events. `default: true` opens this plugin when the app starts — at most one of your features may claim it, and across the app the first pack to register one wins. Without a claim, your pack's first plugin feature is its default |
| `services` | `Record<string, string>` | no | Services. Keys are identifiers, the names on `services`; values are `"path#exportName"`: a source file and the name of its export holding the service object (an object literal or class instance, not a factory). See [Services](services-and-data.md#services) |
| `repositories` | `Record<string, string>` | no | Repository objects. Keys are identifiers, the names on `repository`; values are `"path#exportName"`. Carried by the generated pack entry's registration (the app registers them with its engine) and typed on `repository` from `#generated/repository`. A name is the app's, not the feature's: declaring one twice in a pack, or one a dependency declares, fails the build, since the app refuses to register two packs that share a repository name |
| `typesEntry` | `string` | no | Additional types to include in the generated type barrel |
| `references` | `string` | no | Path to the module declaring which of the feature's things are linkable from an editor. Built-in packs only: ignored for external packs |

A feature can have just a system (backend-only), just a plugin (frontend-only), or both.

### Feature settings

The `settings` module default-exports the feature's defaults, which the generated entry puts in the pack's registration, and the app reads when the pack loads. It may set only the feature's own plugin settings and its sidebar visibility:

```typescript
// src/features/bookmarks/settings.ts
export default {
  visible: true,
  plugins: {
    bookmarks: { sortBy: 'date' },
  },
};
```

Any other key (a top-level key other than `plugins` and `visible`, another plugin's `plugins.<id>`, or a `visible` that isn't a boolean) fails `abuddy build`.

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
    "sources": {
      "actions": "src/content/actions",
      "prompts": "src/content/prompts",
      "flows": { "path": "src/content/flows" }
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `hooks` | `string` | Module exporting lifecycle hooks (see below) |
| `content` | `Record<string, string \| ContentSourceConfig>` | Content sources: `actions`, `prompts` and `flows` take a path; any other key is `{ path, format }` (optionally with `applier`) or `{ applier }`. **Every content source writes entities into the database** — that is what `content.sources` is for, so content your own code reads back is an ordinary import of your own source, not an entry here. Declare a feature's default settings with `features.<id>.settings` |

The `hooks` module's named exports become the pack's boot hooks:

```typescript
// src/hooks.ts
export const onInit = () => ensureDefaults();     // after EARS hydration, before migrations and content
export const onShutdown = () => stopProcesses(); // when the pack's backend stops (app exit, pack unload or reload)
```

| Export | Runs |
|---|---|
| `onInit` | Once per boot, after EARS hydration and before migrations and content. Create rows the pack's systems expect to exist here |
| `onShutdown` | When the pack's backend stops. Release what outlives its actors: processes, timers, listeners |

Every system starts when the bus does, after hydration. There is no way for a feature to ask to start before it.

### ContentSourceConfig

`actions`, `prompts` and `flows` accept a path, or `{ "path": …, "onUserEdit"?: … }`. Any other key is one of:

| Shape | Description |
|---|---|
| `{ "path", "format" }` | `path`: source directory or file, relative to the pack root. `format`: a name in this pack's `content.formats`, or `"<dependency id>:<name>"` for a dependency's; that dependency must be declared in `dependencies` |
| `{ "path", "format", "applier" }` | Compiled with the format, and written by the pack module's `apply(ctx)` instead of the format applier |
| `{ "applier" }` | A pack module exporting `apply(ctx)`, used instead of a format and the format applier |

Every shape also takes `onUserEdit`, which decides what happens about an item the user has edited:

| Field | Type | Description |
|---|---|---|
| `onUserEdit` | `"theirs" \| "offer"` | `theirs` (the default): their edit makes the item theirs for good, and the app never mentions it again. `offer`: the app records that a newer version is waiting and the Packs view lets them take it or keep theirs. Neither overwrites their edit. See [Content](content.md#theirs-or-offer-what-happens-to-an-item-the-user-edited) |

An entry can't carry format settings, and an unknown key given a path string fails validation. A `content.artifacts` entry takes no `onUserEdit`: nothing of an artefact is written, so there is no edit of the user's for a policy to be about. See [Content](content.md#writing-entities) for examples.

### ContentFormatConfig

A `content.formats` value, keyed by the format name: a lowercase letter, then lowercase letters, digits and hyphens. It needs exactly one of `format` and `compiler`.

| Field | Type | Description |
|---|---|---|
| `format` | `"markdown-tree" \| "json"` | Compile an entry's source with a built-in format: a directory of markdown, or a JSON array of records |
| `compiler` | `string` | A module in this pack whose default export compiles an entry's source into records. Bundled into `dist/build/content-compilers.mjs` for dependents |
| `entity` | `string \| string[]` | Entity types the records content (the pack's, a dependency's or the SDK's). Omitted, entries are compiled but not written |
| `identity` | `string[]` | Fields matched to find an existing row (`"parent"` = the tree parent). Ignored when the type's owning pack registers a `find` content writer |
| `tree` | `{ branch?, branchEntity?, relKind? }` | Walk subdirectories as parent rows: a directory's own file, its entity type, and the parent → child relation (default `contains`) |
| `fields` | `Record<string, { from, default?, type? }>` | `markdown-tree` only: record field → `body`, `filename`, `path` or `frontmatter.<name>` |
| `media` | `string` | Directory under an entry's `path` copied with the content; `media/<file>` links become `media://<id>/<file>` |

## Frontend configuration

```json
{
  "fe": {
    "tiptapPlugins": "src/extensions/tiptap/index.ts",
    "appExtensions": {
      "welcome": "src/extensions/app/Welcome.vue"
    },
    "bundleUi": false
  }
}
```

| Field | Type | Description |
|---|---|---|
| `tiptapPlugins` | `string` | Tiptap plugin registration module |
| `appExtensions` | `Record<string, string>` | Named app extensions: extension name (an identifier) → Vue component path |
| `bundleUi` | `boolean` | Bundle a copy of `@abuddy/ui` into the pack instead of using the app's (default `false`). All of `@abuddy/ui` is bundled, so the pack never mixes the two. |

The frontend entry itself isn't declared here: `abuddy build` bundles `src/pack-entry-fe.ts` (or `.js`) if present, else the generated `src/__generated__/pack-entry-fe.ts`, into the pack's `runtime/fe.js`, with any extracted styles as `runtime/fe.css`. The app loads whichever of those two files the installed pack has.

## Build configuration

```json
{
  "build": {
    "opaqueDeps": ["elkjs"]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `opaqueDeps` | `string[]` | Dependencies the frontend bundle includes whole instead of tree-shaking, by package name |

Everything under `build` changes what `abuddy build` produces, or how long it takes, and nothing the app
loads — which is what separates it from the sections above.

**`opaqueDeps` is for a dependency that is already a bundle** — shipped as one already-minified file, or
compiled from another language — where tree-shaking removes almost nothing and walking it is most of what
the frontend build spends its time on. It trades a little output size for build time: on the pack
AgentBuddy ships, naming its one such dependency took `abuddy build` from 23.3s to 20.6s for 38 KB on an
8.5 MB bundle (median of 3 interleaved runs, 2026-10-08). Every other module is shaken as before, so a
dependency you wrote yourself does not belong here — it would keep its dead code for nothing.

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

Keys become TypeScript constants in the generated `ears.ts`, values are the runtime strings stored in the database. An entity's key must be its type name, the same as its value (`"Bookmark": "Bookmark"`); a relation kind's key and value may differ.

No two packs may use the same name: a key or a value another installed pack declares fails `abuddy build` (for a dependency) and the app's registration of the pack.

The SDK defines the entity types `Relation`, `Flow`, `Node`, `TNode`, `Action` and `Prompt`, and the relation kinds `CONTAINS` (`contains`), `TRANSITIONS_TO` (`transitions_to`), `INSTANCE_OF` (`instance_of`), `SPAWNED` (`spawned`) and `TRACKED` (`tracked`), for every pack. A pack can't declare any of them, as a key or as a value: the error names each entry to remove, and editors using `abuddy.schema.json` flag them. A dependency built by an older CLI that still lists them fails the build until it's rebuilt.

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
| `globals` | `Record<string, string>` | Globals in scope and their types. With `globals`, the generated FE entry's registration carries the definitions from `dist/defs/monaco/<name>-defs.d.ts` in its `dslTypes` |

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

  "features": {
    "bookmarks": {
      "settings": "src/features/bookmarks/settings.ts",
      "system": {
        "entry": "src/features/bookmarks/be/system.ts"
      },
      "plugin": {
        "entry": "src/features/bookmarks/fe/plugin.ts"
      },
      "services": {}
    }
  },

  "steps": {
    "bookmark-check": {
      "build": "src/extensions/steps/bookmark-check/build.ts#bookmarkCheckStepBuild",
      "fe": "src/extensions/steps/bookmark-check/fe.ts#bookmarkCheckStepFE"
    }
  },

  "boot": {
    "sources": {
      "actions": "src/content/actions",
      "flows": "src/content/flows"
    }
  }
}
```
