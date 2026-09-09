# Seeds — Actions, Prompts & Flows

Seeds are DSL source files that get compiled to JSON at build time and executed in a sandboxed runtime. They are the primary way to add behavior to a pack without writing new backend systems.

There are three seed types:

- **Actions** — async functions that do work (call LLMs, query data, emit events)
- **Prompts** — parameterized text templates for LLM calls
- **Flows** — declarative event-driven workflows that orchestrate actions

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

Seeds are compiled during `abuddy build` into JSON files in `dist/`. At boot time, the seeder hashes the compiled output and skips re-seeding when nothing has changed.

## Commands as actions

Commands are actions with `category: 'commands'` triggered by `/name` in chat. To add one:

1. Create an action in `src/seeds/actions/commands/`
2. Add an `on("user.command", ...)` branch in a flow
3. Register the command in your documentation or help text
