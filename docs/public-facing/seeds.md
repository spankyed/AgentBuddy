# Seeds

Seeds are source files compiled to JSON at build time and written into the database when a pack is installed or updated. `abuddy.json` `boot.seed` names each one.

The SDK compiles four keys itself:

- **Actions** — async functions that do work (call LLMs, query data, emit events)
- **Prompts** — parameterized text templates for LLM calls
- **Flows** — declarative event-driven workflows that orchestrate actions
- **Settings** — the pack's default settings

Any other entity type — yours, a dependency's, or the SDK's — is seeded from markdown or JSON with a format and a seed entry in `abuddy.json`, and no SDK code (see [Seeding entities](#seeding-entities)).

## Actions

An action is an async function with typed metadata. Actions are invoked by flow steps or directly by the runtime.

### Scaffolding

```bash
abuddy add action analyze-text --category analysis
```

Creates `src/seeds/actions/analysis/analyze-text.ts`.

### Structure

```typescript
import type { ActionMeta } from '@abuddy/sdk/build';
import type { Services, Z } from '#generated/services';

export const meta: ActionMeta = {
  label: 'Analyze Text',
  description: 'Summarizes text and classifies its intent',
  category: 'analysis',
  input: {
    text: {
      type: 'string',
      description: 'The text to analyze',
      required: true,
      placeholder: 'e.g. I need help setting up my account',
    },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { text } = params;

  // Use a prompt template
  const summaryPrompt = services.prompt.usePrompt('Summarize Text', {
    text,
    maxSentences: 2,
  });

  // Generate text with a model (provider:model id)
  const result = await services.inference.generateText({
    model: 'anthropic:claude-sonnet-4-5',
    instructions: 'Answer in two sentences.',
    prompt: summaryPrompt || text,
  });

  // Generate structured output with the injected zod
  const { output: classified } = await services.inference.generateText({
    model: 'openai:gpt-5-mini',
    prompt: `Classify the intent of this text: ${text}`,
    output: { type: 'object', schema: z.object({ intent: z.string(), confidence: z.number() }) },
  });

  // Log results
  services.logger.info('Analysis complete', { summary: result.text });

  return {
    summary: result.text,
    intent: classified.intent,
  };
}
```

### Available services

Actions receive a `services` object with access to:

| Service | Description |
|---|---|
| `services.inference` | Model calls (`generateText`, `streamText`, `createAgent`, `embed`/`embedMany`, `generateImage`, `generateSpeech`, `transcribe`, `rerank`) with the user's provider keys; see [Inference](services-and-data.md#inference) |
| `services.prompt` | Prompt template resolution (`usePrompt`) |
| `services.threads` | Thread and message operations |
| `services.chat` | Chat interactions |
| `services.artifact` | Artifact creation and management |
| `services.brain` | Brain/memory operations |
| `services.database` | Database queries |
| `services.browser` | Browser integration |
| `services.settings` | Settings read/write |
| `services.logger` | Structured logging |
| `services.emitter` | Event emission to plugins |

### Rules

- **No bare Node.js imports** — actions run in a sandboxed scope. The compiler enforces this.
- **Import types only** — use `import type` for `ActionMeta`, `Services`, `Z`. Runtime values come from function parameters.
- **Model calls need no imports**: `output` is data (`{ type: 'object', schema }`, `{ type: 'choice', options }`, …), tools are plain `{ description, inputSchema, execute }` objects, and `stopWhen` is a function. Agents, embeddings, images and speech work the same way (`services.inference.createAgent`, `embed`, `generateImage`, …). See [Inference](services-and-data.md#inference).
- **Files without `export const meta` are treated as inlined helpers** — they won't be compiled as standalone actions.
- **Files prefixed with `_` are skipped** by the compiler.

## Prompts

A prompt is a synchronous template function with typed inputs.

### Scaffolding

```bash
abuddy add prompt summarize-text
```

Creates `src/seeds/prompts/summarize-text.ts`.

### Structure

```typescript
import type { PromptMeta } from '@abuddy/sdk/build';

export const meta: PromptMeta = {
  label: 'Summarize Text',
  description: 'Generates a concise summary of the provided text',
  category: 'analysis',
  inputs: {
    text: {
      name: 'text',
      type: 'string',
      required: true,
      description: 'The text to summarize',
    },
    maxSentences: {
      name: 'maxSentences',
      type: 'number',
      defaultValue: 3,
      description: 'Maximum sentences in summary',
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'The generated summary' },
    },
  },
};

export function template(params: Record<string, any>) {
  const maxSentences = params.maxSentences || 3;

  return `Summarize the following text in ${maxSentences} sentence(s) or fewer.

Text:
${params.text}`;
}
```

### Rules

- The `template` function must be **synchronous** and return a string.
- No imports or side effects at runtime.
- Prompts are resolved by label at runtime via `services.prompt.usePrompt('Summarize Text', params)`.

## Flows

A flow is a declarative workflow composed of steps. Flows use a DSL with typed helpers generated from your pack's step definitions.

### Scaffolding

```bash
abuddy add flow onboarding
```

Creates `src/seeds/flows/onboarding.ts`.

### Structure

```typescript
import type { FlowDSL } from '@abuddy/sdk/build';
import { entry, on, keepAlive, action, fire, branch, subflow } from '#generated/flow-helpers';

export default {
  // Linear: entry -> action -> fire
  'Analysis Flow': [
    entry([
      action('Analyze Text', { label: 'analyze' }),
      fire('analysis.complete', { label: 'notify' }),
    ]),
  ],

  // Long-running: init + keep alive + event listeners
  'Monitor Flow': [
    entry([
      action('Initialize', { label: 'init' }),
      keepAlive(),
    ]),
    on('user.message', [[
      action('Process', { label: 'process' }),
      fire('message.processed'),
    ]], 'Handle Message'),
  ],

  // Branching: action -> conditional branches
  'Support Flow': [
    entry([
      action('Classify', { label: 'classify' }),
      branch(
        [
          { if: "$.intent == 'question'", steps: [
            action('Lookup', { label: 'lookup' }),
          ]},
          { if: "$.intent == 'request'", steps: [
            action('Process Request', { label: 'process' }),
          ]},
        ],
        [fire('support.escalated', { label: 'escalate' })],
      ),
    ]),
  ],

  // Parallel entry branches
  'Setup Flow': [
    entry(
      [action('Load Config', { label: 'config' })],
      [action('Warm Cache', { label: 'cache' })],
      [keepAlive()],
    ),
  ],

  // Sub-flow delegation
  'Orchestrator Flow': [
    entry([
      subflow('Analysis Flow', { label: 'run analysis' }),
      fire('orchestration.complete'),
    ]),
  ],
} satisfies FlowDSL;
```

### DSL helpers

| Helper | Description |
|---|---|
| `entry(...branches)` | Flow entry point. Each argument is a step chain (array). Multiple arguments create parallel branches. |
| `on(event, branches, label?)` | Event listener. Activates when the flow receives the named event. |
| `keepAlive()` | Keeps the flow alive after its entry chain completes. Required for long-running flows with `on()` listeners. |
| `action(label, opts?)` | Execute a named action. |
| `fire(event, opts?)` | Emit an event. |
| `branch(conditions, fallback?)` | Conditional branching based on expressions. |
| `subflow(name, opts?)` | Delegate to another flow. |

Step-specific helpers (like `action`, `fire`, `branch`) are auto-generated from your pack's step definitions in `#generated/flow-helpers`.

### Rules

- Default export must be a `FlowDSL` object (`export default { ... } satisfies FlowDSL`).
- Import helpers from `#generated/flow-helpers` (auto-generated, typed).
- Files prefixed with `_` are treated as helpers and not compiled.

## Manifest configuration

Point your manifest at the seed directories:

```json
{
  "boot": {
    "seed": {
      "actions": "src/seeds/actions",
      "prompts": "src/seeds/prompts",
      "flows": "src/seeds/flows"
    }
  }
}
```

`abuddy build` compiles each key into `<key>.seed.json` (media into `media/<key>/`) and writes `seeds.json`, an index of the keys and their items that Settings → Import Pack Seeds previews. At boot, the app hashes the compiled output and skips re-seeding when nothing has changed.

## Seeding entities

Seed rows of an entity type from markdown or JSON in two parts of `abuddy.json`:

- **A format** in `seedFormats` says how a source becomes records: a built-in format (`markdown-tree` or `json`) or a compiler module, and the settings it uses.
- **A seed entry** in `boot.seed` names a source and the format that compiles it: `{ "path", "format" }`. The entry key is yours to name.

```json
{
  "entities": { "Memo": "Memo" },
  "seedFormats": {
    "memos": {
      "format": "markdown-tree",
      "entity": "Memo",
      "identity": ["title", "parent"],
      "tree": { "branch": "index.md", "relKind": "contains" },
      "fields": {
        "title": { "from": "frontmatter.title", "default": "filename", "type": "string" },
        "pinned": { "from": "frontmatter.pinned" },
        "text": { "from": "body" }
      },
      "media": "media"
    }
  },
  "boot": {
    "seed": {
      "memos": { "path": "src/seeds/memos", "format": "memos" }
    }
  }
}
```

An entry can't set or change any format settings; a pack that needs different settings defines its own format. Format names are lowercase with hyphens.

### Markdown

- Each `.md` file is a record. Frontmatter is YAML 1.2, so `title: 2024` reads as a number; `"type": "string"` coerces it back.
- `fields` maps record fields to a source: `body` (the markdown after the frontmatter), `filename` (the file or directory name with dashes as spaces), `path` (relative to the entry's `path`) or `frontmatter.<name>`. `default` applies when the source is absent; `"filename"` as a default means the display name. A field with no value and no `default` is left out of the record. Seeds track the fields a record sets (see [Change tracking](#change-tracking)), so leave defaults a user may change, like flags, to the entity's defaults or a `create` hook.
- With `tree`, each subdirectory is a parent record (its `branch` file gives its frontmatter and body, `branchEntity` its type) and its files are children, linked with `relKind`. Without `tree`, only the top-level files are read.
- `media` is a directory under the entry's `path`, copied with the seeds; `![alt](media/pic.png)` links are rewritten to the row's `media://<id>/pic.png`.

### JSON

```json
"seedFormats": { "tags": { "format": "json", "entity": "Tag", "identity": ["name"] } },
"boot": { "seed": { "tags": { "path": "src/seeds/tags.json", "format": "tags" } } }
```

The file holds an array of records (or `{ "records": [...] }`); a record may carry its own `entity` and `children`.

### Compiler modules

When a source needs parsing that field sources can't express, give the format a `compiler` module instead of a built-in `format`. Its default export gets `{ key, path, packDir, format }` and returns records, each tagged with its `entity`:

```typescript
// src/seeds/compilers/glossary.ts
import { compileMarkdownTree, type SeedCompileContext, type SeedRecord } from '@abuddy/sdk/build';

export default function compileGlossary({ path }: SeedCompileContext): SeedRecord[] {
  return compileMarkdownTree(path).map((item) => ({
    entity: 'Term',
    term: String(item.frontmatter.term ?? item.displayName),
    definition: item.body.trim(),
  }));
}
```

```json
"seedFormats": { "glossary": { "compiler": "src/seeds/compilers/glossary.ts", "entity": "Term", "identity": ["term"] } },
"boot": { "seed": { "glossary": { "path": "src/seeds/glossary", "format": "glossary" } } }
```

The build loads TypeScript compiler modules itself, and bundles every compiler module your formats name into `dist/build/seed-compilers.mjs` so packs depending on yours can use those formats. A record's `sourceHash` defaults to a hash of its fields (and its children's hashes); set it yourself to decide what counts as a change. A format without `entity` is compiled but not seeded: pack code reads `<key>.seed.json` (default-setup's FAQs work this way). An entry `{ "seeder": "src/seeds/custom.ts" }` replaces the format and generic seeder with a module exporting `seed(ctx)`.

### A dependency's formats

An entry can name a format of a pack it depends on as `"<pack id>:<name>"`. It compiles your sources with that pack's settings and compiler module, so you get the same records it would:

```json
{
  "dependencies": { "default-setup": "*" },
  "boot": {
    "seed": {
      "team-notes": { "path": "src/seeds/notes", "format": "default-setup:notes" },
      "team-docs": { "path": "src/seeds/docs", "format": "default-setup:library" }
    }
  }
}
```

default-setup's formats:

| Format | Seeds | Sources |
|---|---|---|
| `notes` | `Note` | Markdown notes; frontmatter `title`, `type` (`document`, `tasklist`, `task`), `icon`, `favorite`, `hideCompletedChildren`, `completed`. A directory is a parent note, its `index.md` giving the parent's frontmatter and content |
| `library` | `Collection`, `Document` | A directory is a collection (`_meta.md` frontmatter `name`, `description`); a file is a document (frontmatter `name`, `tags: [a, b]`; `<!-- section:type -->` markers split its content). `media/` links become the document's media |
| `faqs` | none (compiled only) | The Help tab's FAQs; not useful to other packs |

Any pack can define a format for any entity type it can seed (its own, a dependency's or the SDK's). Only the pack that declares an entity type defines its seed hooks.

### Seed hooks

Without hooks, the seeder writes rows directly: it matches existing rows on the format's `identity`, creates new ones with their fields, and links children with `tree.relKind`. When an entity type needs more — shortCodes, ordering, validation, derived links — the pack that declares the type registers seed hooks for it:

```json
{
  "entities": { "Memo": "Memo" },
  "seedHooks": { "Memo": "src/seeds/hooks/memos.ts#memoSeedHooks" }
}
```

```typescript
// src/seeds/hooks/memos.ts
import type { SeedHooks, SeedRecord } from '@abuddy/sdk/seed';
import { repository } from '#generated/repository';

export const memoSeedHooks: SeedHooks<SeedRecord & { title: string; text: string; pinned?: boolean }> = {
  find: (record) => repository.memoQueries.byTitle(record.title),       // { id, sourceHash } | undefined
  create: (record, { parentId, index }) => repository.memoCommands.add({ title: record.title, text: record.text, pinned: record.pinned }).id,
  // clearedFields: fields the previous seed set that the record no longer sets, reset to a new memo's
  update: (id, record, { clearedFields }) => repository.memoCommands.update(id, {
    title: record.title,
    text: record.text,
    pinned: record.pinned ?? (clearedFields.includes('pinned') ? false : undefined),
  }),
  remove: (id) => repository.memoCommands.delete(id),
};
```

`create` and `update` store the record's fields under their names, as the record gives them, and `update` writes every field the record sets: change tracking records those fields' stored values. `update` also resets the fields in `clearedFields` to what `create` gives a record that doesn't set them (see [Change tracking](#change-tracking)). Hooks are keyed by entity type, not by format, so every pack that seeds `Memo` — with your format, its own, or one depending on yours — goes through them. A `find` hook replaces the format's `identity`. default-setup registers hooks for `Note`, `Document` and `Collection`, so rows seeded with its formats get the same shortCodes, display order and links as default-setup's own.

### Change tracking

Seeded rows store their record's `sourceHash`, and `seededFields`: the names of the record's fields and a hash of the values the seeder wrote to them. A row is edited when those fields no longer hold what the seeder wrote, whatever changed them (the app's editors, the database console, a flow). Fields a record doesn't set aren't tracked: a user can favorite a seeded note and it still takes seed updates.

When a changed record no longer sets a field its previous seed set (the source dropped `completed: true`), updating the row resets that field: without hooks the seeder drops it from the row, and an `update` hook gets it in `clearedFields` to reset (default-setup's Note hooks reset it to a new note's value). A field no seed of the row ever set, like a user's favorite, isn't touched.

Seeded rows also store a `seedKey`: the seeding pack's id, the entry key and the record's identity in the source (for a tree, its ancestors' too). A seed finds a row by its `seedKey` first, so a row the user renamed is still found, left as renamed (a renamed row is edited), and not seeded again as a copy. Two packs' records with the same entry key and identity seed a row each. A row without a `seedKey` that matches a record's identity (a user's row with the same name) isn't seeded again beside it. The pack id comes from `seeds.json`, which `abuddy build` writes; seeding compiled seeds without it fails until the pack is rebuilt.

Flows follow the same rules. A seeded flow stores `seededGraph`, a hash of what the seeder wrote for it: its row's fields, its nodes' fields, and the relations between them (independent of their order). Editing, adding or removing a node or transition, or renaming the flow, makes it edited. Moving nodes in the editor doesn't.

Unlike other rows, a flow's id and its nodes' ids come from the flow's name, so flows can't share a name: a pack's flow isn't seeded when another pack already seeded a flow with its name, or a user's flow has the ids it would write. The existing flow is left as it is and the seed reports an error (`Flow "X": a flow with this name already exists (seeded by <pack>)`, or `(created by the user)`). A user's flow with the name (and its own ids) is left alone as user-owned, as for other rows.

A subflow step naming a flow the same pack seeds runs that seeded flow, however the user renamed it, and never another flow with its name. When the pack's seed left a user's or another pack's flow with that name in place of its own, the step runs that flow. Other names run the flow with that label.

Re-seeding follows the same rules for every entry:

| Import mode | Existing row |
|---|---|
| `replace-on-collision` (and boot seeding) | Updated only when the stored hash differs and the row isn't edited. A row with no stored hash is treated as user-created, and an edited row is left as it is. Children are still visited. |
| `keep-existing` | Left alone, with its children. |
| `wipe-and-replace` | Every row of the entry's entity types is removed first, then all records are created. |

Rows without a stored `sourceHash` (rows users created) stay user-owned. A seeded row without `seededFields` (flows: `seededGraph`) can't be checked for edits, so it's left alone like an edited one.

## Commands as actions

Commands are actions with `category: 'commands'` triggered by `/name` in chat. To add one:

1. Create an action in `src/seeds/actions/commands/`
2. Add an `on("user.command", ...)` branch in a flow
3. Register the command in your documentation or help text
