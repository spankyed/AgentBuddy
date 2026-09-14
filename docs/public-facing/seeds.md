# Seeds

Seeds are source files compiled to JSON at build time and written into the database when a pack is installed or updated. `abuddy.json` `boot.seed` names each one.

The SDK compiles four keys itself:

- **Actions** — async functions that do work (call LLMs, query data, emit events)
- **Prompts** — parameterized text templates for LLM calls
- **Flows** — declarative event-driven workflows that orchestrate actions
- **Settings** — the pack's default settings

Any other entity type — yours, a dependency's, or the SDK's — is seeded from markdown or JSON with an entry object in `abuddy.json`, and no SDK code (see [Seeding entities](#seeding-entities)).

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

  // Generate text with an LLM
  const result = await services.llm.generateText({
    model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    prompt: summaryPrompt || text,
  });

  // Generate structured output with a zod schema
  const Classification = z.object({
    intent: z.string(),
    confidence: z.number(),
  });

  const classified = await services.llm.generateObject({
    model: { provider: 'openai', model: 'gpt-4o' },
    schema: Classification,
    prompt: text,
  });

  // Log results
  services.logger.info('Analysis complete', { summary: result.text });

  return {
    summary: result.text,
    intent: classified.object.intent,
  };
}
```

### Available services

Actions receive a `services` object with access to:

| Service | Description |
|---|---|
| `services.llm` | LLM calls (`generateText`, `generateObject`) |
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

Seed rows of an entity type from markdown or JSON with an entry object. The keys are yours to name.

### Markdown

```json
{
  "entities": { "Memo": "Memo" },
  "boot": {
    "seed": {
      "memos": {
        "path": "src/seeds/memos",
        "format": "markdown-tree",
        "entity": "Memo",
        "identity": ["title", "parent"],
        "tree": { "branch": "index.md", "relKind": "contains" },
        "fields": {
          "title": { "from": "frontmatter.title", "default": "filename", "type": "string" },
          "pinned": { "from": "frontmatter.pinned", "default": false },
          "text": { "from": "body" }
        },
        "media": "media"
      }
    }
  }
}
```

- Each `.md` file is a record. Frontmatter is YAML 1.2, so `title: 2024` reads as a number; `"type": "string"` coerces it back.
- `fields` maps record fields to a source: `body` (the markdown after the frontmatter), `filename` (the file or directory name with dashes as spaces), `path` (relative to `path`) or `frontmatter.<name>`. `default` applies when the source is absent; `"filename"` as a default means the display name.
- With `tree`, each subdirectory is a parent record (its `branch` file gives its frontmatter and body, `branchEntity` its type) and its files are children, linked with `relKind`. Without `tree`, only the top-level files are read.
- `media` is copied with the seeds; `![alt](media/pic.png)` links are rewritten to the row's `media://<id>/pic.png`.

### JSON

```json
"tags": { "path": "src/seeds/tags.json", "format": "json", "entity": "Tag", "identity": ["name"] }
```

The file holds an array of records (or `{ "records": [...] }`); a record may carry its own `entity` and `children`.

### Compiler modules

When a source needs parsing that field sources can't express, point `compiler` at a module. Its default export gets `{ key, path, packDir, entry }` and returns records, each tagged with its `entity`:

```typescript
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
"glossary": { "path": "src/seeds/glossary", "compiler": "src/seeds/compile-glossary.ts", "entity": "Term", "identity": ["term"] }
```

The build loads TypeScript compiler modules itself. A record's `sourceHash` defaults to a hash of its fields (and its children's hashes); set it yourself to decide what counts as a change. An entry without `entity` is compiled but not seeded: pack code reads `<key>.seed.json` (default-setup's FAQs work this way). `seeder` replaces the generic seeder with a module exporting `seed(ctx)`.

### Seed hooks

Without hooks, the seeder writes rows directly: it matches existing rows on `identity`, creates new ones with their fields, and links children with `tree.relKind`. When an entity type needs more — shortCodes, ordering, validation, derived links — the pack that declares the type registers seed hooks for it:

```json
{
  "entities": { "Memo": "Memo" },
  "seedHooks": { "Memo": "src/features/memos/be/seed-hooks.ts#memoSeedHooks" }
}
```

```typescript
import type { SeedHooks, SeedRecord } from '@abuddy/sdk/seed';
import { repository } from '#generated/repository';

export const memoSeedHooks: SeedHooks<SeedRecord & { title: string; text: string }> = {
  find: (record) => repository.memoQueries.byTitle(record.title),       // { id, sourceHash } | undefined
  create: (record, { parentId, index }) => repository.memoCommands.add(record.text, record.title).id,
  update: (id, record) => repository.memoCommands.update(id, record.text),
  remove: (id) => repository.memoCommands.delete(id),
};
```

Hooks are looked up by entity type, so every pack that seeds `Memo` — yours or one depending on it — goes through them. A `find` hook replaces the entry's `identity`. default-setup registers hooks for `Note`, `Document` and `Collection`: a pack depending on default-setup seeds notes with a `markdown-tree` entry for `Note` and gets the same shortCodes, display order and links as default-setup's own notes.

### Change tracking

Seeded rows store their record's `sourceHash`. Re-seeding follows the same rules for every entry:

| Import mode | Existing row |
|---|---|
| `replace-on-collision` (and boot seeding) | Updated only when the stored hash differs. A row with no stored hash is treated as user-created and left alone. Children are still visited. |
| `keep-existing` | Left alone, with its children. |
| `wipe-and-replace` | Every row of the entry's entity types is removed first, then all records are created. |

Upgrading from the previous seed format: notes seeded before `sourceHash` existed have no stored hash, so later seeds leave them alone; seeded library documents and collections may be overwritten once, on the first boot after the upgrade.

## Commands as actions

Commands are actions with `category: 'commands'` triggered by `/name` in chat. To add one:

1. Create an action in `src/seeds/actions/commands/`
2. Add an `on("user.command", ...)` branch in a flow
3. Register the command in your documentation or help text
