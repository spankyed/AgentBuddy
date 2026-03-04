# Writing Actions

## Overview

Actions are async function bodies stored as JavaScript strings and executed at runtime via the `AsyncFunction` constructor. This means the action code runs in a sandboxed scope with only the explicitly provided variables available.

This guide covers how to write TypeScript action source files in `packages/api/actions/defaults/`, which are compiled to JSON via `npm run compile:actions`.

## Quick Start

1. Create a new `.ts` file in `packages/api/actions/defaults/`
2. Export a `meta` object and an `action` function
3. Run `npm run compile:actions` from the project root (or `packages/api/`)
4. Import the generated `compiled-actions.json` via the app UI (IMPORT_ACTIONS)

## Template

```typescript
import type { ActionMeta, Services, Z } from '../types';

export const meta: ActionMeta = {
  label: 'My Action',
  description: 'What this action does',
  category: 'general',
  input: {
    myParam: {
      type: 'string',
      description: 'Description of the parameter',
      required: true,
      placeholder: 'e.g. some value',
    },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  z: Z,
  flowId: string,
) {
  const { myParam } = params;

  // Your action logic here
  await services.logger.info('Action executed', { myParam });

  return { success: true };
}
```

## Runtime Variables

When an action executes, these variables are available in scope:

| Variable | Type | Description |
|----------|------|-------------|
| `params` | `Record<string, any>` | Input parameters passed to the action |
| `services` | `Services` | All backend service modules (see below) |
| `z` | `Z` | Zod schema validation library |
| `flowId` | `string` | The flow instance ID (when run from a flow node) |

### Available Services

The `services` object provides access to all backend modules:

- `services.logger` — Structured logging (`info`, `warn`, `error`)
- `services.llm` — LLM generation (`generateText`, `generateObject`, `streamText`)
- `services.emitter` — Event emitter (`sendToPlugin`, `sendToSystem`)
- `services.database` — Database access (EARS entity system, queries)
- `services.prompt` — Prompt template management (`usePrompt`)
- `services.action` — Action execution (`getByLabel`, `executeAction`)
- `services.library` — Document library (`getDocByCode`)
- `services.browser` — Browser automation (Playwright)
- `services.repository` — Data repository (threads, flows, artifacts)
- `services.settings` — Settings management
- `services.textStream` — Text streaming utilities
- `services.chat` — Chat operations (create threads, send messages, block messages)
- `services.artifact` — Artifact management (create, update)
- `services.brain` — Brain/flow execution system

## Do's

- **Use async/await** for all asynchronous operations
- **Return results** — return an object with relevant data from your action
- **Use `services.logger`** for logging instead of `console.log`
- **Validate inputs with `z`** (Zod) when parameters need runtime validation
- **Handle errors** — wrap risky operations in try/catch and log failures
- **Keep actions focused** — one action should do one thing well

## Don'ts

- **No imports** — except `import type { ... } from '../types'` and `import { ... } from '../shared/*'` (see [Shared Helpers](#shared-helpers) below)
- **No `require()`** — the function body cannot load modules at runtime
- **No Node.js globals** — `process`, `fs`, `__dirname`, `__filename`, `Buffer`, `global` are not available
- **No module-scoped state** — everything inside the `action` function is the function body; anything outside is stripped
- **No top-level side effects** — only the function body is extracted and executed

## Shared Helpers

You can extract reusable logic into shared helper files at `packages/api/actions/shared/`. The compiler inlines imported declarations into the action function body at compile time, so the resulting `actionFn` string remains self-contained.

### Creating a shared file

Create a `.ts` file in `actions/shared/`:

```typescript
// actions/shared/string-utils.ts

export function formatName(name: string): string {
  return name.trim().toLowerCase();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

### Importing in an action

```typescript
import type { ActionMeta, Services, Z } from '../types';
import { formatName } from '../shared/string-utils';

export const meta: ActionMeta = {
  label: 'Greet User',
  input: { name: { type: 'string', required: true } },
};

export async function action(params: Record<string, any>, services: Services) {
  const name = formatName(params.name);
  return { greeting: `Hello, ${name}!` };
}
```

The compiled `actionFn` will contain:

```javascript
function formatName(name) {
  return name.trim().toLowerCase();
}

const name = formatName(params.name);
return { greeting: `Hello, ${name}!` };
```

### Constraints

- **Named imports only** — `import { foo } from '../shared/bar'`
- **No aliases** — `import { foo as bar }` is not supported
- **No default imports** — `import foo from '../shared/bar'` is not supported
- **No wildcard imports** — `import * as utils from '../shared/bar'` is not supported
- **Shared files must be self-contained** — no imports (except `import type`) within shared files
- **No Node.js globals** in shared files — same restrictions as action files
- Missing files or exports are treated as **compile errors** (the action is skipped)

## Metadata Reference

The `meta` export defines action metadata:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | `string` | Yes | Display name of the action |
| `description` | `string` | No | What the action does |
| `category` | `string` | No | Grouping category (e.g. `onboarding`, `testing`, `database`) |
| `input` | `Record<string, ActionParameter>` | Yes | Parameter definitions (can be `{}`) |
| `output` | `any` | No | Output schema description |

### ActionParameter

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'string' \| 'number' \| 'boolean' \| 'object' \| 'array' \| 'any'` | Parameter type |
| `description` | `string` | What the parameter is for |
| `required` | `boolean` | Whether the parameter must be provided |
| `default` | `any` | Default value if not provided |
| `placeholder` | `string` | UI placeholder text |

## Examples

### Simple action

```typescript
export const meta: ActionMeta = {
  label: 'Log Message',
  input: {},
};

export async function action(params: Record<string, any>, services: Services) {
  await services.logger.info('Hello from action!');
  return { success: true };
}
```

### Action with parameters

```typescript
export const meta: ActionMeta = {
  label: 'Create Thread',
  input: {
    topic: { type: 'string', required: true },
    tags: { type: 'array', default: [] },
  },
};

export async function action(params: Record<string, any>, services: Services) {
  const thread = services.chat.createThreadAndNotify({
    topic: params.topic,
    tags: params.tags || [],
  });
  return { threadId: thread.id, success: true };
}
```

### LLM usage

```typescript
export async function action(params: Record<string, any>, services: Services, z: Z) {
  const result = await services.llm.generateText({
    model: { provider: 'openai', model: 'gpt-4o' },
    prompt: params.prompt,
    temperature: 0.7,
  });
  return { text: result.text };
}
```

### Zod validation

```typescript
export async function action(params: Record<string, any>, services: Services, z: Z) {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  });
  const validated = schema.parse(params);
  await services.logger.info('Validated input', validated);
  return validated;
}
```

## Compilation

Run from the project root:

```bash
npm run compile:actions
```

Or from `packages/api/`:

```bash
npm run compile:actions
```

This reads all `.ts` files in `actions/defaults/`, strips types, extracts the function body and metadata, and writes `actions/compiled-actions.json`.

The compiled JSON is git-tracked and can be imported via the app UI using the existing IMPORT_ACTIONS flow.
