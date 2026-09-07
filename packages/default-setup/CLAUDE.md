# Default Setup

The built-in pack for AgentBuddy. Ships everything the app needs out of the box: 13 plugins (each with a backend system and frontend UI), services, seed data, flow steps, artifact viewers, message blocks, tiptap extensions, and migrations.

Declared as a pack via `abuddy.json` (`"builtIn": true`). Registered through `pack-entry.ts` (backend) and `pack-entry-fe.ts` (frontend).

## Package structure

```
src/
  pack-entry.ts          # BE entry — exports PackRegistration (systems, services, EARS, boot, migrations, steps, artifacts, blocks)
  pack-entry-fe.ts       # FE entry — exports plugins, registers tiptap + app extensions
  default-settings.ts    # Full default SettingsData object
  plugins/               # 13 feature plugins (each has be/ and fe/ dirs)
  registries/            # Cross-cutting registrations (EARS, systems, services, boot, extensions, tiptap, etc.)
  seeds/                 # DSL source for actions, prompts, flows, library, notes, faqs
  steps/                 # Flow step definitions (action, llm, switch, fire, query, create, etc.)
  artifacts/             # Artifact viewer definitions + Vue components
  blocks/                # Message block definitions (display + input)
  extensions/            # App-level extensions (Welcome screen)
  migrations/            # Version-targeted data migrations
```

## Plugins

Each plugin lives in `src/plugins/<name>/` with this layout:

- `be/system.ts` — XState backend system machine + event types
- `be/repository/` — EARS read/write layer (registered via side-effect import)
- `be/services/` — Stateless service modules exposed to other systems and actions
- `be/types.ts` — Shared types
- `fe/plugin.ts` — Frontend plugin definition (id, label, icon, state machine, canvas/panel components)
- `fe/state.ts` — XState frontend state machine
- `fe/canvas/` — Main view components
- `fe/references.ts` — Tiptap reference type definitions (if applicable)
- `plugin.config.ts` — Build-time config (name + settings path)
- `settings.ts` — Per-plugin default settings

The 13 plugins: **threads**, **code**, **notes**, **calendar**, **browser**, **library**, **flows**, **actions**, **prompts**, **brain**, **database**, **logs**, **settings**.

Plugin registry: `src/registries/plugins.ts`. Default plugin is Threads.

## Systems

Backend systems registered in `src/registries/systems.ts`. Each system is an XState machine. The logs system is special — it runs as `earlyBootSystem` before EARS hydration (for log capture during boot).

System IDs re-exported from `src/registries/system-ids.ts`.

## Services

Shared services in `src/registries/services/index.ts`. These are stateless modules that systems and actions can call:

`llm`, `database`, `prompt`, `action`, `library`, `browser`, `settings`, `textStream`, `chat`, `artifact`, `brain`, `cli`, `filesystem`, `threads`, `codex`, `modelClient`, `openaiAuth`

The model client (`services/model-client/`) handles LLM streaming, tool calling, conversation management, and context compaction.

## EARS (Entity types + Relations)

Entity types and relation kinds declared in `src/registries/ears.ts` (re-exports from generated `.abuddy/generated/ears`). The pack-entry registers all entity types and relation kinds, plus partition policy (TNode excluded from persistence, Secret routed to secrets store).

Type augmentations:
- `src/registries/entity-shapes.ts` — maps entity type strings to attribute interfaces (`EntityShapeRegistry`)
- `src/registries/event-channels.ts` — maps plugin IDs to outgoing event types (`PluginEventRegistry`)

## Seeds

DSL source files compiled to JSON at build time. Located in `src/seeds/`:

- `actions/` — claude-code actions, codex actions, command actions, onboarding
- `prompts/` — system prompts (db-query, db-transaction, recap, commit-message, edit/plan phase tips)
- `flows/` — root-flow, onboarding-flow, claude-code-flow, codex-flow, command-listener-flow
- `library/` — internal docs (commands reference)
- `notes/` — welcome note
- `faqs/` — markdown FAQ files
- `default-settings.ts` — full default settings object

Build config: `pack.config.ts` points the compiler at each seed directory.

Seed registration: `src/registries/seed/index.ts` registers seeders for actions, prompts, flows, library, notes, and settings with the core seed framework. Boot seed (`runBootSeed`) hashes compiled artifacts and skips seeding when unchanged.

See `src/seeds/CLAUDE.md` for authoring details.

## Flow steps

Step definitions in `src/steps/`. Each step has `index.ts` (definition), optionally `runtime.ts`, `build.ts`, and `form.vue`.

13 steps: **action**, **llm**, **switch**, **fire**, **transform**, **query**, **flow**, **create**, **update**, **keep-alive**, **kill**, **schedule** (trigger), **listener** (trigger).

## Artifacts

Artifact type definitions in `src/artifacts/register.ts`. 16 viewer types with Vue components in `src/artifacts/viewers/`:

text, code, review, image, slack, todo, project, json, graph, table, markdown, claude-session, codex-session, diff, plan, note

FE registration: `src/artifacts/register-fe.ts` (eagerly loads all viewer components for the renderer).

## Message blocks

Block definitions in `src/blocks/register.ts`. Two kinds:

**Display blocks**: prompt, note, markdown, link, tool-activity, thinking, tool-input, context-usage, session-list, actions, toggles

**Input blocks**: file-picker, choice, text, approval, button-group, question, project-select

FE registration: `src/blocks/register-fe.ts`.

## Extensions

- **Tiptap plugins** (`src/registries/tiptap-plugins.ts`) — reference node (inline entity mentions), command suggestion (slash commands), command viewer decoration. Registered in `tiptap-register-fe.ts`.
- **App extensions** (`src/registries/app-extensions.ts`) — Welcome screen component.
- **Reference types** (`src/registries/extensions.ts`) — aggregates ref types, categories, and item providers from threads, library, and notes plugins for the tiptap reference system.

## Migrations

Version-targeted migrations in `src/migrations/`. Registered in `src/migrations/index.ts` as `PackMigration[]`. Run during boot when the stored pack version is below the target.

## Boot sequence contributions

The pack registers these boot hooks via `src/registries/boot.ts`:
- `earlySystem` — logs system (starts before hydration)
- `createDefaultSettings` — ensures Settings entity exists
- `seed` — runs `runBootSeed` (hash-checked seeding)
- Shutdown hook — kills all terminal processes

## Build

- `pack.config.ts` — points DSL compiler at seed source directories
- `npm run compile` from repo root compiles all DSLs to `dist/`
- `tsconfig.json` — uses `@/` path alias pointing to `src/`
- Vitest config at `vitest.config.ts`, test tsconfig at `tsconfig.test.json`
