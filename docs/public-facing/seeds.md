# Seeds

Seeds are source files compiled to JSON at build time and written into the database when a pack is installed or updated. `abuddy.json` `boot.seed` names each one.

The SDK compiles three keys a pack seeds itself:

- **Actions** — async functions that do work (call LLMs, query data, emit events)
- **Prompts** — parameterized text templates for LLM calls
- **Flows** — declarative event-driven workflows that orchestrate actions

A feature's default settings go in `features[].settings` (see [Feature settings](manifest.md#feature-settings)); the settings entity and its seed are default-setup's (its `settings` entry and format).

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

### How an action runs

The compiled body of `action` runs in one sandbox, whether a flow's action step runs it or another action calls it through `services.action` (`executeAction`, `getAndExecute`). It receives:

- `params`: the step's resolved input (or the params the caller passed)
- `services`: the object below, with `services.logger` named `action:<label>`, so the Logs view shows which action logged
- `z`: zod, for schemas
- `flowId`: the running flow's trace node id when a flow step runs it; `undefined` otherwise

### Available services

Actions receive a `services` object: default-setup's feature services (each is the object its `abuddy.json` entry names, `path#<key>Service`), the host's services, and the pack's repositories. A pack depending on default-setup gets the same object, typed by `Services` from its generated facade.

**default-setup's services**

| Service | Description |
|---|---|
| `services.chat` | Chat messages and blocks (`sendBlockMessage`, `sendSystemMessage`, `sendChoiceBlock`, `sendQuestionBlock`, `createThreadAndNotify`, …) |
| `services.threads` | Thread chat state (`updateChatState`) |
| `services.artifact` | Artifact creation and updates (`createAndNotify`, `updateAndNotify`, `findOrCreateByType`) |
| `services.library` | Library documents and folders (`get`, `getByCode`, `getByName`, `getByPath`, `getText`, `list`, `create`, `update`, `createFolder`, `rename`, `move`, `remove`), and the chat's slash commands (`commands`; see [Slash commands](#slash-commands)) |
| `services.prompt` | Prompt templates (`usePrompt`, `getByLabel`, `executeTemplate`) |
| `services.action` | Look up and run actions (`getById`, `getByLabel`, `getByCategory`, `executeAction`, `getAndExecute`) |
| `services.brain` | Ad-hoc brain event listeners (`listen`, `unlisten`) |
| `services.scheduler` | Cron schedules for flow triggers (`registerSchedule`, `unregisterByPrefix`, `clearAllSchedules`) |
| `services.database` | Live-data schema and topology context for AI query generation (`buildQueryContext`) |
| `services.settings` | Settings read and write (`getAll`, `getSettingValue`, `updateGeneralSetting`, `updatePluginSetting`, …) |
| `services.cli` | CLI tools: `git`, `gh`, `claudeCode`, `codex`, plus `testCli` |
| `services.codex` | The Codex app-server (threads, turns, approvals, sessions) |
| `services.browser` | Browser automation sessions (`createBrowser`) |
| `services.textStream` | Chunked text streaming for simulated typing (`streamText`, `streamTextByChars`) |

**Host services**

| Service | Description |
|---|---|
| `services.inference` | Model calls (`generateText`, `streamText`, `createAgent`, `embed`/`embedMany`, `generateImage`, `generateSpeech`, `transcribe`, `rerank`) with the user's provider keys; see [Inference](services-and-data.md#inference) |
| `services.repository` | The pack's declared repositories (queries and commands); actions read and write data through them |
| `services.logger` | Structured logging, named `action:<label>` |
| `services.emitter` | Typed sends to plugins and systems (`sendToPlugin`, `sendToSystem` naming a system `<pack>/<feature>`, such as `'my-pack/bookmarks'`, `sendToBrainSystem`) |
| `services.appData` | Reset, back up and restore the app's data; whether the user finished onboarding (`hasOnboarded`, `completeOnboarding`) |
| `services.traceStore` | Read flow execution records |
| `services.secrets` | The user's API keys as metadata (`list`, `select`, `rename`, `delete`, `status`); never values |
| `services.filesystem` | Files and folders on disk, as UTF-8 text (`readFile`, `writeFile`, `readDir`, `mkdir`, `stat`, `exists`, `rename`, `remove`) |

### Metadata

`ActionMeta` (`@abuddy/sdk/build`):

| Field | Type | Description |
|---|---|---|
| `label` | `string` | The action's name: flow `action` steps and `services.action.getByLabel` find it by label. Two actions with one label fail the build |
| `description` | `string?` | Shown in the Actions UI |
| `category` | `string?` | Groups the action in the Actions UI (`abuddy add action --category`, default the pack id) |
| `input` | `Record<string, ActionParameter>` | The parameters, by name |
| `output` | `unknown?` | A description of the result, stored with the action |

`ActionParameter`: `type` (`'string' \| 'number' \| 'boolean' \| 'object' \| 'array' \| 'any'`), `description?`, `required?`, `default?`, `placeholder?`. These describe the parameters; nothing validates `params` against them or fills in `default` when the action runs.

### Parameters

The build keeps only the function's body, and the runtime calls it with fixed parameter names, so keep them named `params`, `services`, `z` and `flowId`:

| Parameter | From a flow `action` step | From `services.action.executeAction(actionFn, params)` / `getAndExecute(label, params)` |
|---|---|---|
| `params` | The step's `params`, overridden by its resolved `map` (see [Mappings](#mappings)) | `params` |
| `services` | The app's `services` | The app's `services` |
| `z` | zod | `undefined` |
| `flowId` | The running flow's trace node id | `undefined` |

The function's return value is the step's result (`$.lastStep.result`).

### Rules

The build bundles each action file with esbuild and extracts its `meta` and the body of `action`:

- **Imports**: a relative import is bundled into the action. The only package import allowed is `@abuddy/sdk/actions` (`formatProviderError(error, provider, alternatives?)`, `buildTranscript(messages, { maxMessages?, maxChars? })`); any other package, `node:` modules included, fails the build. Type-only imports (`ActionMeta`, `Services`, `Z`) are erased and always allowed.
- **Node globals** (`require`, `process`, `__dirname`, `__filename`, `Buffer`, `global`) in the bundled code only produce a build warning, but the action runs in the app's backend without them.
- **`meta` is evaluated on its own**: write it as an object literal that references no imports or other variables.
- **Top-level helpers** (functions and constants next to `action`) are inlined into the action. A helper function whose only uses are direct calls can declare a `services` parameter: the build removes it and the helper uses the action's `services`.
- **Model calls need no imports**: `output` is data (`{ type: 'object', schema }`, `{ type: 'choice', options }`, …), tools are plain `{ description, inputSchema, execute }` objects, and `stopWhen` is a function. Agents, embeddings, images and speech work the same way (`services.inference.createAgent`, `embed`, `generateImage`, …). See [Inference](services-and-data.md#inference).
- **Scanning**: every `.ts` file under the directory, subdirectories included, is compiled when it has a line starting `export const meta`. Other files (shared helpers) and `*.example.ts` files are skipped. A `_` prefix doesn't skip an action file.

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

### Metadata

`PromptMeta` (`@abuddy/sdk/build`): `label` (unique; a duplicate fails the build), `description?`, `category?`, `inputs: Record<string, TemplateInput>`, `outputSchema?`.

`TemplateInput`: `name`, `type` (`'string' \| 'number' \| 'boolean' \| 'object' \| 'array' \| 'any'`), `description?`, `required?`, `defaultValue?`, `example?`. Like an action's parameters, these describe the inputs; the template applies its own defaults.

### Rules

- `template(params, usePrompt)` must be **synchronous** and return a string. Keep the parameters named `params` and `usePrompt`: the build keeps only the body.
- `usePrompt(label, params)` renders another prompt by label (up to 10 levels deep), returning `undefined` when there's none.
- Prompt files are scanned and bundled like actions: `export const meta`, relative imports, `@abuddy/sdk/actions` as the only package import, no `*.example.ts`.
- Prompts are rendered by label with `services.prompt.usePrompt('Summarize Text', params)`, or by a flow's `llm` step.

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
          // A bare key reads the previous step's result: Classify returned { intent }
          { if: "intent == 'question'", steps: [
            action('Lookup', { label: 'lookup', map: { question: '$.event.data.payload.text' } }),
          ]},
          { if: "intent == 'request'", steps: [
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

### Flow definitions

A flow file's default export is a `FlowDSL` (`@abuddy/sdk/build`): flow name → a `Track[]`, or a `FlowConfig`.

| Type | Fields |
|---|---|
| `FlowConfig` | `tracks: Track[]`; `root?: boolean` marks the root flow, which the brain starts when the app starts (at most one; default-setup's `Root Flow` is the app's); `sourceHash?` is written by the build, a hash of `tracks` and `root` |
| `Track` | One trigger field (`event` for a listener, `schedule` for a schedule), `label?`, `description?`, `exits: DSLStepNode[][]` (each exit a chain of steps, run in parallel) |
| `DSLNodeBase` | Options every step helper takes: `label?`, `description?`, `final?`, `next?` |

Every other flow runs as a subflow that a running flow spawned: default-setup's `Root Flow` spawns its long-running work modes from its entry track. An event reaches every running flow (see `fire`'s `scope`).

A step's options:

| Option | Effect |
|---|---|
| `label` | The node's label. Defaults per step (the action or prompt name, the event, the flow name, `Create <entity>`, `Switch <index>`, …). Labels are unique within a flow, across its tracks, branches and track labels: a duplicate fails the build (`Duplicate step label`), so label repeated steps, and give a step an explicit label when its default matches an `on()` track's (`fire('x')` beside `on('x', …)`) |
| `description` | Stored on the node, shown in the editor |
| `final` | When this step completes, the flow completes with the step's result (a subflow's result becomes its step's result in the parent) |
| `next` | Continues at the node with this label in the same flow instead of the next step in the chain; an unknown label fails validation |

A flow without a `final` step completes when all its tracks drain, unless it has a `schedule` track. `keepAlive()` never completes, so its track never drains.

### Flow helpers

`#generated/flow-helpers` exports `entry` and `on` from the SDK, a helper per step with a `dsl` entry in the manifest, and a track builder per trigger other than `event` (see [Flow helpers](extensions.md#flow-helpers)). A pack gets its dependencies' flow helpers re-exported too: `generate-entries` writes each dependency's as `src/__generated__/deps/<id>.flow-helpers.{js,d.ts}` from its snapshot. Each helper's `opts` is typed from its step's `DSL…Node` interface.

default-setup's helpers:

| Helper | Step type | Options (besides `label`, `description`, `final`, `next`) | Does |
|---|---|---|---|
| `entry(...exits)` | `listener` track | — | The `flow.entry` track, run when the flow starts. Each argument is a chain; several run in parallel. Needs at least one (`entry([keepAlive()])`) |
| `on(event, exits, label?)` | `listener` track | — | Runs `exits` when the flow receives `event`. `label` defaults to the event |
| `schedule(cron, exits, label?)` | `schedule` track | — | Runs `exits` on a cron schedule (5 or 6 fields, checked at build) while the flow runs. `label` defaults to `Schedule (<cron>)`. The flow doesn't complete when its tracks drain |
| `action(action, opts?)` | `action` | `map?: Record<string, string>`, `params?: Record<string, any>` | Runs the action with this label; the result is its return value. The label must be an action this pack's `actions` seed compiles |
| `llm(prompt, opts?)` | `llm` | `map?`, `model?: ModelId` (`provider:model`, default `anthropic:claude-opus-5`), `temperature?`, `maxTokens?`, `systemPrompt?` | Renders the prompt with this label with the mapped params and calls `services.inference.generateText`. Result `{ text, usage, finishReason, warnings? }`. The label must be a prompt this pack's `prompts` seed compiles |
| `fire(event, opts?)` | `fire` | `scope?: 'local' \| 'global'` (default `local`), `payload?: unknown` | Sends `event` with `payload`: its `$.` strings are resolved at any depth of objects and arrays (`'$.lastStep.result'` gives the value itself), other values are literal. `local` sends to the flow running the step, `global` to every running flow; `services.brain` listeners get it in either scope, with `targetFlowId` set for `local`. Result `{ eventFired, eventScope, targetFlowId, payload }` |
| `subflow(flow, opts?)` | `subflow` | `inherit?: boolean` (default `true`), `map?` | Starts the flow with this name and completes when it does. Its `flow.entry` event data holds the mapped fields (`$.event.data.<target>`). With `inherit` it also holds the parent track's event data (a mapped field wins), and the entry track starts with the parent track's steps, so `$.lastStep` and `$.steps[label=…]` read the parent's until the subflow runs its own |
| `branch(conditions, else?, label?)` | `switch` | — | `conditions: { if: string; steps: DSLStepNode[] }[]`, `else?: DSLStepNode[]`. Runs the steps of the first condition that matches (see [Switch conditions](#switch-conditions)), else `else`; with no match and no `else` the chain ends. After a branch's steps, the chain continues with the step after the switch |
| `keepAlive(label?)` | `keep_alive` | — | Never completes: keeps its track, and the flow, running |
| `kill(label = 'Kill Flow')` | `kill` | — | Stops the flow running the step |
| `query(prompt, opts?)` | `query` | `as?: string` (default `rows`, not `query`), `model?: ModelId` (default `anthropic:claude-opus-5`) | The model turns `prompt` into a read-only EARS query, instructed by the `DB Query System` prompt with `services.database.buildQueryContext()`, and the step runs it with the database console's read-only executor. Result `{ query, [as]: value }`. Fails when the model can't be called, returns no query, or the query fails or writes |
| `create(entity, opts?)` | `create` | `map?`, `params?: Record<string, unknown>` (literal fields; mapped fields win), `inferLabel?: boolean` (default `true`) | Creates an entity of type `entity`, which must be registered in the running app (`isEntityType`: the SDK's or any registered pack's). Without a `label` field, the label comes from `title`, `name` or `topic`, else `New <Entity> <n>`. Result the created row |
| `update(target, opts?)` | `update` | `map?`, `params?`, `onMissing?: 'fail' \| 'ignore' \| 'create'` (default `fail`), `entity?: string` | Writes the fields to the entity with id `target`: a `$.` path resolved when the step runs (`$.lastStep.result.id` after a `create`; `$.lastStep.id` is the trace node's id) or a literal id. A `null` field drops it. Result the row with `updated: true`. With no such entity, `fail` errors naming the id, `ignore` results `{ updated: false }`, and `create` creates an `entity` (required at build) with the fields, result the row with `updated: false, created: true` |
| `transform(script, opts?)` | `transform` | `outputType?: 'json' \| 'text' \| 'custom'` (default `json`), `map?` | `script` is an async function body run as an action runs (`services.action.executeAction`), with `services` and `params`: `params.input` is the previous step's result, then the mapped fields (a mapped `input` replaces it). Result: `json` the returned value round-tripped through JSON (fails if it isn't serializable), `text` `String(value)`, `custom` the value as returned. A script error fails the step with `Transform step "<label>" script failed: <message>` |

`action`, `llm`, `fire`, `subflow`, `create` and `update` option names come from their `DSL…Node` interfaces in `packages/default-setup/src/extensions/steps/<step>/types.ts`.

### Mappings

A step's `map` is `{ target: source }`. Each source is resolved when the step runs:

- A string starting `$.` is a path into the step's execution context. `[field=value]` picks an array item.
- Any other string is parsed as JSON when it parses (`'3'` → `3`, `'true'` → `true`), otherwise used as a literal string.
- A value that resolves to `undefined` is passed as `undefined`.

An `action` step's `params`, and a `create` or `update` step's fields, are the step's `params` with the mapped values over them; `llm` renders its prompt with the mapped values.

| Path | Value |
|---|---|
| `$.event.type` | The event that started the track (`flow.entry`, `user.command`, `schedule.<node id>`) |
| `$.event.data` | The event's data |
| `$.event.data.payload` | A sent event's payload: what `fire`'s `payload` holds, or what a client or `runFlow` sent (`$.event.data.payload.text`) |
| `$.event.data.<target>` | In a subflow's `flow.entry` track, the subflow step's mapped field, or, when it inherits, the parent event's field |
| `$.lastStep.result` | The result of the step that ran before this one in the track (`$.lastStep.label` its label) |
| `$.steps[label=<label>].result` | The result of an earlier step in this track, by label (`$.steps[id=<trace node id>]` by trace node) |

`$.steps` holds only the track's own steps, in the order they completed (a subflow that inherits starts its entry track with the parent track's).

### Switch conditions

A condition's `if` is `<key> <operator> <value>`:

- **Key**: a `$.` path into the execution context, or a bare key read from the previous step's result (`intent` is `$.lastStep.result.intent`). An `if` with no operator is `<key> == true`.
- **Value**: a `$.` path, `true`/`false`, a number, a quoted string (`'question'`), or otherwise the rest of the text as a string.

| Operator | Matches when |
|---|---|
| `==`, `===` | loosely equal (`==`) |
| `!=`, `!==` | loosely not equal |
| `>`, `<`, `>=`, `<=` | both sides compared as numbers |
| `contains`, `starts_with`, `ends_with` | the key's value as a string contains, starts or ends with the value |
| `matches` | the value, as a regular expression (up to 500 characters), matches the key's value |
| `is_empty` | the key's value is `null`, `undefined`, `''`, `[]` or `{}` (takes no value) |
| `is_null` | the key's value is `null` or `undefined` (takes no value) |

### Rules

- The default export is the `FlowDSL` object (`export default { ... } satisfies FlowDSL`). Flow files run at build time in Node, so they can import anything; import step helpers from `#generated/flow-helpers`.
- Only the `.ts` files directly in the flows directory are read, not subdirectories. Files starting with `_` and `*.example.ts` files are skipped, so shared flow pieces can live in `_helpers.ts`.
- A flow name defined twice, or more than one `root: true`, fails the build.
- At build time, `action` and `llm` steps must name actions and prompts this pack's own `actions` and `prompts` seeds compile. At seed time a flow is checked again against every action and prompt in the database; a flow that fails is reported and not seeded.

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

A specialty key takes its path as a string or `{ "path": … }`; any other key is a [seed entry](#seeding-entities). `abuddy build` compiles each key into `<key>.seed.json` (media into `media/<key>/`) and writes `seeds.json`, which names the pack and indexes the keys and their items for Settings → Import Pack Seeds. Seeding runs at boot and when a pack is installed or reloaded, in `replace-on-collision` mode, and is skipped when the compiled output's hash hasn't changed. The hash covers every seeded key's compiled file, including default-setup's `settings`: changing default settings re-runs the boot seed (its other rows are still skipped by their own hashes), while `seedPolicy.skipAtBoot` keeps boot seeding from resetting settings. At boot, packs seed in dependency order, so a pack's seeds can reference what a pack it declares a dependency on seeded. A seed that reports errors fails: an external pack's error is recorded on its installed-packs entry, and the same output isn't retried until it changes — or until one of the packs it depends on seeds, since that is the other thing that can change the outcome. Installing the pack again is also a fresh attempt, even at the version already installed: an install replaces the compiled files, and what was last seeded is remembered as the files and not only their contents.

### Seed policy

`boot.seedPolicy` skips seed keys during boot seeding. It applies to built-in packs only (the loader drops an external pack's boot seed manifest, and its seeds run through the per-pack seeding above).

| Field | Effect |
|---|---|
| `skipAtBoot: string[]` | These keys are never seeded at boot (default-setup: `settings`) |
| `skipAfterOnboarding: string[]` | These keys are seeded at boot only until the user has onboarded (default-setup: `notes`) |

### Include sets

Seeders take an include set per key (`SeedIncludeSet = true | ReadonlySet<string>`, from `@abuddy/sdk/utils`). `true` or no entry seeds every item; a set seeds only the top-level items it names, and an empty set skips the key. Boot seeding builds them from `seedPolicy`; Import Pack Seeds from the items the user picks. Items are named as `seeds.json` lists them:

| Key | Item name |
|---|---|
| `actions`, `prompts` | The label |
| `flows` | The flow name |
| A seed entry | The record's first `identity` field other than `parent`, else its `name`, `title` or `label` |

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

| Format field | Description |
|---|---|
| `format` / `compiler` | Exactly one: `markdown-tree`, `json`, or a compiler module path (see [Compiler modules](#compiler-modules)) |
| `entity` | The entity type the records seed, or an array of types. Each record's `entity` must be one of them (and `tree.branchEntity`); a built-in format tags records with `entity` only when it's a single string. Omitted, the entry is compiled but not seeded. Each type must be declared by the pack, a dependency or the SDK |
| `identity` | Fields matched to find an existing row. `"parent"` also requires the row to be linked from the record's tree parent by `tree.relKind`. Required unless the entity type has a `find` hook: seeding a record without either fails |
| `tree.branch` | A directory's own file (`index.md`) giving the directory's frontmatter and body |
| `tree.branchEntity` | The entity type directories seed; defaults to `entity` |
| `tree.relKind` | The relation from a parent row to each child row; defaults to `contains` |
| `fields` | `markdown-tree` only (the manifest rejects it elsewhere): record field → `{ from, default?, type? }` |
| `media` | A relative directory under an entry's `path` (no `.` or `..` segments), copied with the seeds |

### Markdown

- Each `.md` file is a record, and `entity` is a single type (`tree.branchEntity` gives directories theirs). Frontmatter is YAML 1.2 (CRLF line endings and a byte order mark are fine), so `title: 2024` reads as a number; `"type": "string"` coerces it back.
- `fields` maps record fields to a source: `body` (the markdown after the frontmatter), `filename` (the file or directory name with dashes as spaces), `path` (relative to the entry's `path`) or `frontmatter.<name>`. `default` applies when the source is absent, `null` or an empty string (`title:` or `title: ""`); `"filename"` as a default means the display name. A field with no value and no `default` is left out of the record. Seeds track the fields a record sets (see [Change tracking](#change-tracking)), so leave defaults a user may change, like flags, to the entity's defaults or a `create` hook.
- With `tree`, each subdirectory is a parent record (its `branch` file gives its frontmatter and body, `branchEntity` its type) and its files are children, linked with `relKind`. Without `tree`, only the top-level files are read.
- `media` is a directory under the entry's `path`, copied with the seeds and not read as records (no other directory is skipped); `![alt](media/pic.png)` links in any of a record's text fields (nested values included) are rewritten to the row's `media://<id>/pic.png`.

### JSON

```json
"seedFormats": { "tags": { "format": "json", "entity": "Tag", "identity": ["name"] } },
"boot": { "seed": { "tags": { "path": "src/seeds/tags.json", "format": "tags" } } }
```

The file holds an array of records (or `{ "records": [...] }`); a record may carry its own `entity` and `children`.

### Compiler modules

When a source needs parsing that field sources can't express, give the format a `compiler` module instead of a built-in `format`. Its default export gets a `SeedCompileContext` (`key`, `path`: the entry's absolute path, `packDir`: the seeding pack's directory, `format`) and returns records, or a promise of them, each tagged with its `entity`:

```typescript
// src/seeds/compilers/glossary.ts
import { compileMarkdownTree, type SeedCompileContext, type SeedRecord } from '@abuddy/sdk/build';

export default function compileGlossary({ path, format }: SeedCompileContext): SeedRecord[] {
  // Skip the format's media directory, if it has one
  return compileMarkdownTree(path, { media: format.media }).map((item) => ({
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

The build loads TypeScript compiler modules itself, and bundles every compiler module your formats name into `dist/build/seed-compilers.mjs` so packs depending on yours can use those formats. A record's `sourceHash` defaults to a hash of its fields (and its children's hashes); set it yourself to decide what counts as a change. A format without `entity` is compiled but not seeded: pack code reads `<key>.seed.json` (default-setup's FAQs work this way).

### Seeder modules

An entry `{ "seeder": "src/seeds/custom.ts" }` (no `path` or `format`) replaces the format and generic seeder with the module's named export `seed`, which the generated `seeders.ts` puts in the pack's registration under the entry key. The build compiles nothing for it, so the module brings its own data.

An entry with all three, `{ "path", "format", "seeder" }`, is compiled with the format, and the module's `seed` seeds the compiled `<key>.seed.json` instead of the generic seeder, even when the format names no entity. default-setup's `settings` entry works this way: its format merges the default settings into one record, and its seeder resets the user's settings when the seed is imported.

```typescript
// src/seeds/custom.ts
import type { SeederContext, SeedCounts } from '@abuddy/sdk/utils';

export function seed(ctx: SeederContext): SeedCounts {
  ctx.log('  custom seed');
  return { created: 0, updated: 0, skipped: 0 };
}
```

| `SeederContext` | Description |
|---|---|
| `compiledDir` | The pack's compiled seeds directory |
| `include?` | This key's include set (see [Include sets](#include-sets)) |
| `mode?` | `'keep-existing' \| 'replace-on-collision' \| 'wipe-and-replace'` (see [Change tracking](#change-tracking)) |
| `log(...args)` | Logs when seeding is verbose |

`seed` is synchronous and returns `SeedCounts`: `created`, `updated`, `skipped`, and `errors?: string[]`, where a non-empty list fails the seed.

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

| `SeedHooks<R>` member | Called | Returns |
|---|---|---|
| `container?: boolean` | Not called: it marks the entity a holder of other records (a folder) | — |
| `find?(record, context)` | To match a record that no row's `seedKey` matches; replaces `identity` | `{ id, sourceHash? }` or `undefined` |
| `create?(record, context)` | For a record with no row | The new row's id |
| `update?(id, record, context)` | For a changed record whose row isn't edited | — |
| `remove?(id)` | By `wipe-and-replace`, and to undo a create whose media copy or stamping failed | — |

`container` is how two packs share a folder. A row another record's seed claimed (another pack's, or another entry's of your pack) is normally not yours, whatever its name, so your record seeds a row of its own beside it. When the entity's hooks set `container: true`, your record's `find` match is reused as the parent instead: its children are seeded under it in every mode (`keep-existing` skips only the children that exist), and the row itself is never updated, stamped or re-keyed — it stays the record that seeded it. The seed counts it as skipped. Whichever seed creates the row first owns it: the fields another seed's record sets on it (a folder's description) are dropped. The row is found by `find` on every seed, so if the user renames or moves it, the next seed creates the folder again where your records expect it. default-setup sets it on `Collection`, so a pack seeding `internal/commands/mine.md` with its `library` format puts its document in default-setup's folders rather than forking them. Its `find` hooks match a name within `parentId`, so a folder of the same name elsewhere is a different row.

`SeedHookContext`: `parentId?` (the tree parent's row), `index` (the record's position among its siblings), `clearedFields: string[]` (on `update`, the fields the previous seed set that the record no longer sets; empty for `find` and `create`). A missing hook falls back to the generic seeder's behavior. A hook that throws fails that record (reported in the seed's errors) and seeding moves on.

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
| `wipe-and-replace` | Every row of the entry's entity types (its format's `entity`) is removed first, whoever created it: the user's rows and other packs' rows of those types too, even when the entry has no records of a type. Then all records are created. |

Rows without a stored `sourceHash` (rows users created) stay user-owned. A seeded row without `seededFields` (flows: `seededGraph`) can't be checked for edits, so it's left alone like an edited one.

## Slash commands

A slash command is a `/name` the chat composer recognizes. The composer's list is two sources merged:

1. **The manifest**: `commands: [{ "name": "standup", "placeholder": "Topic" }]` at the top level of `abuddy.json`. They come with the pack: installing or enabling it adds them, disabling or uninstalling it takes them away. A name another registered pack declares is refused, and with it the whole pack, so `abuddy build` fails for a name one of your dependencies declares. Names are `^[a-z][a-z0-9-]*$` and unique across the app.
2. **The library**: every document in the `internal/commands` folder, each with a field section of `**name**: placeholder` lines. Users edit those from the Library, so a pack seeds there what it wants them to change; default-setup seeds `Claude Code commands` and `Codex commands` from `src/seeds/library/internal/commands/`, and declares its own `pr2md` and `instructions` in the manifest.

Declared commands come first, in the order their packs were first registered (a pack rebuilt or updated keeps its place); a document repeating a declared name is ignored, and a name two documents define keeps the first. The threads system sends the list when a client connects, and again when it has changed after a pack changes while the app runs (installed, updated, enabled, disabled, uninstalled or rebuilt, or its seeds imported from Settings; the bus's `PACK_CHANGED`) or a library change alters it (a document in the folder, or the folder, created, edited, moved, renamed or deleted).

Uninstalling a pack removes its declared commands but not the documents it seeded: they're the user's library now, so their commands stay listed, with no flow handling them, until the user deletes them.

Sending `/name args` fires a `user.command` event (`$.event.data.payload.command` is the name); there's no routing from a name to an action. To add a command:

1. Write the action that does the work (its `category` only groups it in the Actions UI).
2. Handle it in a flow: an `on("user.command", ...)` branch whose switch compares `payload.command` (`command-listener-flow.ts` for standalone commands; the Claude Code and Codex flows route `cc-*` and `cdx-*`).
3. List it: add it to `commands` in `abuddy.json`, or add `**name**: placeholder` to a document in `internal/commands` (in default-setup, one of the files under `src/seeds/library/internal/commands/`).

A command listed without a handler does nothing, and a handled command that isn't listed is sent as a plain message.
