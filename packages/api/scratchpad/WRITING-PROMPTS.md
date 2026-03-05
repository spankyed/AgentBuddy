# Writing Prompts

## Overview

Prompts are synchronous template function bodies stored as JavaScript strings and executed at runtime via the `Function` constructor. The template code runs in a sandboxed scope with only `params` and `usePrompt` available. Templates must return a string.

Source files live in `scratchpad/prompts/` and are compiled to JSON via `npm run compile:prompts`.

## Quick Start

1. Create a new `.ts` file in `scratchpad/prompts/`
2. Export a `meta` object and a `template` function
3. Run `npm run compile:prompts`
4. Import the generated `compiled-prompts.json` via the app UI (IMPORT_PROMPTS)

## Template

```typescript
import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'My Prompt',
  description: 'What this prompt does',
  category: 'general',
  inputs: {
    topic: {
      name: 'topic',
      type: 'string',
      description: 'The topic to write about',
      required: true,
      example: 'machine learning',
    },
  },
};

export function template(
  params: Record<string, any>,
  usePrompt: (label: string, params: Record<string, any>) => string | undefined,
) {
  const { topic } = params;

  return `Write a detailed explanation about ${topic}.`;
}
```

## Runtime Variables

When a template executes, these variables are available in scope:

| Variable | Type | Description |
|----------|------|-------------|
| `params` | `Record<string, any>` | Input parameters passed to the template |
| `usePrompt` | `(label: string, params: Record<string, any>) => string \| undefined` | Compose other prompts by label |

## Do's

- **Return a string** — templates must always return a string
- **Keep templates pure** — no side effects, just string construction
- **Use `usePrompt`** to compose prompts from other prompts instead of duplicating text
- **Document inputs** — provide `description` and `example` on each input for discoverability
- **Keep prompts focused** — one prompt should serve one purpose

## Don'ts

- **No async/await** — template functions are synchronous
- **No bare package imports** — you cannot import from `node_modules`
- **No `require()`** — the function body cannot load modules at runtime
- **No Node.js globals** — `process`, `fs`, `__dirname`, `__filename`, `Buffer`, `global` are not available
- **No module-scoped state** — everything inside the `template` function is the function body; anything outside is stripped
- **No top-level side effects** — only the function body is extracted and executed

## Composing Prompts with `usePrompt`

Templates can reference other prompts by label using the `usePrompt` function. This enables composition without duplicating content.

```typescript
export function template(
  params: Record<string, any>,
  usePrompt: (label: string, params: Record<string, any>) => string | undefined,
) {
  const baseInstructions = usePrompt('base-instructions', {
    role: 'AI assistant',
    style: params.style || 'friendly',
  });

  return `${baseInstructions || ''}

Now respond to the following:
${params.userMessage}`;
}
```

**Important:** `usePrompt` returns `undefined` if the referenced prompt is not found. Always handle this case. Prompt nesting has a maximum depth of 10 to prevent infinite loops.

## Helper Files

You can extract reusable logic into helper files at any relative path. The compiler uses esbuild to bundle imports — all imported declarations are inlined into the template function body at compile time, so the resulting `templateFn` string remains self-contained.

Common locations for helpers:
- `scratchpad/shared/` — helpers reusable across both actions and prompts
- `scratchpad/prompts/` — sibling helpers (files without `export const meta` are skipped during compilation)

### Creating a helper file

```typescript
// scratchpad/shared/format-list.ts

export function formatList(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}
```

### Importing in a prompt

```typescript
import type { PromptMeta } from '../types';
import { formatList } from '../shared/format-list';

export const meta: PromptMeta = {
  label: 'Task List Prompt',
  inputs: {
    tasks: { name: 'tasks', type: 'array', required: true },
  },
};

export function template(params: Record<string, any>) {
  return `Complete the following tasks:\n${formatList(params.tasks)}`;
}
```

The compiled `templateFn` will contain:

```javascript
function formatList(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

return `Complete the following tasks:\n${formatList(params.tasks)}`;
```

### Constraints

- **Helper files must be self-contained** — no imports (except `import type`) within helper files
- **No Node.js globals** in helper files — same restrictions as prompt files
- **No bare package imports** — cannot import from `node_modules`
- Missing files or exports are treated as **compile errors** (the prompt is skipped)
- Files in `scratchpad/prompts/` without `export const meta` are treated as helpers and skipped during compilation

## Metadata Reference

The `meta` export defines prompt metadata:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | `string` | Yes | Unique display name (used by `usePrompt` to reference this prompt) |
| `description` | `string` | No | What the prompt does |
| `category` | `string` | No | Grouping category (e.g. `analysis`, `formatting`, `system`) |
| `inputs` | `Record<string, TemplateInput>` | Yes | Expected input parameters (can be `{}`) |
| `outputSchema` | `any` | No | JSON schema describing expected LLM output structure |

### TemplateInput

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Parameter name (should match the key in `inputs`) |
| `type` | `'string' \| 'number' \| 'boolean' \| 'object' \| 'array' \| 'any'` | Parameter type |
| `description` | `string` | What the input is for |
| `required` | `boolean` | Whether the input must be provided (default `true`) |
| `defaultValue` | `any` | Default value if not provided |
| `commonSources` | `string[]` | Common data paths for UI mapping hints |
| `example` | `any` | Example value for documentation |

## Examples

### Simple prompt

```typescript
export const meta: PromptMeta = {
  label: 'Summarize Text',
  description: 'Generates a concise summary',
  category: 'analysis',
  inputs: {
    text: { name: 'text', type: 'string', required: true },
  },
};

export function template(params: Record<string, any>) {
  return `Summarize the following text:\n${params.text}`;
}
```

### Prompt with structured output

```typescript
export const meta: PromptMeta = {
  label: 'Extract Entities',
  category: 'analysis',
  inputs: {
    text: { name: 'text', type: 'string', required: true },
    entityTypes: { name: 'entityTypes', type: 'array', example: ['person', 'place'] },
  },
  outputSchema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' } } },
      },
    },
  },
};

export function template(params: Record<string, any>) {
  const types = (params.entityTypes || ['person', 'place', 'organization']).join(', ');

  return `Extract all entities of type: ${types}

Text:
${params.text}

Return a JSON object with an "entities" array.`;
}
```

### Composing from another prompt

```typescript
export const meta: PromptMeta = {
  label: 'Translate with Context',
  inputs: {
    text: { name: 'text', type: 'string', required: true },
    language: { name: 'language', type: 'string', required: true },
    style: { name: 'style', type: 'string', defaultValue: 'formal' },
  },
};

export function template(
  params: Record<string, any>,
  usePrompt: (label: string, params: Record<string, any>) => string | undefined,
) {
  const systemContext = usePrompt('translation-guidelines', {
    language: params.language,
    style: params.style,
  });

  return `${systemContext || ''}

Translate the following text to ${params.language}:
${params.text}`;
}
```

## Compilation

Run from the project root or `packages/api/`:

```bash
npm run compile:prompts
```

This uses esbuild to bundle and transpile all `.ts` files in `scratchpad/prompts/`, resolving relative imports and inlining helper code. It then extracts the function body and metadata and writes `scratchpad/prompts/compiled-prompts.json`. Files without `export const meta` are treated as helper files and skipped during compilation (but can be imported by prompt files).

The compiled JSON is git-tracked and can be imported via the app UI using the existing IMPORT_PROMPTS flow.
