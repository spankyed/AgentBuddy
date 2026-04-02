# Writing Actions

## Overview

Actions are async function bodies stored as JavaScript strings and executed at runtime via the `AsyncFunction` constructor. The action code runs in a sandboxed scope with only the explicitly provided variables available.

Source files live in `src/actions/` and are compiled to JSON via `npm run compile:actions`.

## Quick Start

1. Create a new `.ts` file in `src/actions/`
2. Export a `meta` object and an `action` function
3. Run `npm run compile:actions`
4. Import the generated `dist/compiled-actions.json` via the app UI (IMPORT_ACTIONS)

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
- `services.library` — Document library (`get`, `getByCode`, `getByName`, `getText`, `list`, `create`, `update`, `createFolder`, `remove`, `move`, `rename`)
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

- **No bare package imports** — you cannot import from `node_modules` (e.g. `import { x } from 'lodash'`). Relative path imports are allowed (e.g. `../shared/utils`, `./helper`) as long as imported files only use `import type` (no value imports)
- **No `require()`** — the function body cannot load modules at runtime
- **No Node.js globals** — `process`, `fs`, `__dirname`, `__filename`, `Buffer`, `global` are not available
- **No module-scoped state** — everything inside the `action` function is the function body; anything outside is stripped
- **No top-level side effects** — only the function body is extracted and executed

## Helper Files

You can extract reusable logic into helper files at any relative path. The compiler uses esbuild to bundle imports — all imported declarations are inlined into the action function body at compile time, so the resulting `actionFn` string remains self-contained.

Common locations for helpers:
- `src/actions/` — helpers reusable across both actions and prompts
- `src/actions/` — sibling helpers (files without `export const meta` are skipped during compilation)
- Any other relative path reachable from the action file

### Creating a helper file

```typescript
// src/actions/string-utils.ts

export function formatName(name: string): string {
  return name.trim().toLowerCase();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

### Importing in an action

All import styles are supported — named, default, aliased, and wildcard:

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

- **Helper files must be self-contained** — no imports (except `import type`) within helper files
- **No Node.js globals** in helper files — same restrictions as action files
- **No bare package imports** — cannot import from `node_modules`
- Missing files or exports are treated as **compile errors** (the action is skipped)
- Files in `src/actions/` without `export const meta` are treated as helpers and skipped during compilation

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

Run from the project root or `packages/api/`:

```bash
npm run compile:actions
```

This uses esbuild to bundle and transpile all `.ts` files in `src/actions/`, resolving relative imports and inlining helper code. It then extracts the function body and metadata and writes `dist/compiled-actions.json`. Files without `export const meta` are treated as helper files and skipped during compilation (but can be imported by action files).

The compiled JSON is git-tracked and can be imported via the app UI using the existing IMPORT_ACTIONS flow.
