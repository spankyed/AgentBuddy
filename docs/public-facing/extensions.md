# Extensions — Steps, Artifacts & Blocks

Packs can extend the host's flow editor, artifact system, and message UI through three extension point types.

## Steps

A step definition adds a new node type to the visual flow editor. Steps have three facets: **build** (compile/validate DSL nodes), **runtime** (execute the step), and **fe** (render in the editor).

### Scaffolding

```bash
abuddy add step my-step
abuddy add step my-trigger --trigger   # trigger-type step
```

Creates:

```
src/extensions/steps/my-step/
  index.ts      # StepDefinition with build + fe facets
  fe.ts         # Frontend definition (node config, form component)
  types.ts      # DSL and compiled node types
  form.vue      # Step configuration form
```

Also updates `register.ts`, `register-fe.ts`, and `abuddy.json`.

### Backend definition (index.ts)

```typescript
import type { StepDefinition } from '@abuddy/sdk/steps';
import type { MyStepDSLNode, MyStepCompiledNode } from './types';
import { myStepStepFE } from './fe';

export const myStepStep: StepDefinition = {
  type: 'my-step',
  build: {
    compile(node: MyStepDSLNode) {
      return { type: 'my-step' } as MyStepCompiledNode;
    },
    validate(node: MyStepDSLNode) {
      return [];  // Return StepValidationError[] for issues
    },
    getLabel(node: MyStepDSLNode) {
      return 'My Step';
    },
  },
  runtime: {
    handler: async (tNode, node, ctx, actor) => {
      // Step execution logic
    },
    isAsync: true,
  },
  fe: myStepStepFE.fe,
};
```

### Frontend definition (fe.ts)

```typescript
import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Box } from 'lucide-vue-next';

export const myStepStepFE: StepDefinition = {
  type: 'my-step',
  fe: {
    loadComponents: () => ({
      form: defineAsyncComponent(() => import('./form.vue')),
    }),
    nodeConfig: {
      label: 'My Step',
      icon: Box,                                    // Lucide component
      color: 'text-indigo-400',                     // Tailwind text class
      bgColor: 'bg-indigo-700/20',                  // Node background
      hoverBgColor: 'group-hover:bg-indigo-700/30', // Hover state
      connectionRules: { inputs: -1, outputs: -1 }, // -1 = unlimited
      category: 'logic',
      isImplemented: true,
    },
  },
};
```

### Node config fields

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Display name in the node palette |
| `defaultLabel` | `string` | Default label for new instances |
| `icon` | `Component` | Lucide Vue component |
| `color` | `string` | Tailwind text color class |
| `bgColor` | `string` | Tailwind background class |
| `hoverBgColor` | `string` | Tailwind hover background class |
| `connectionRules` | `{ inputs, outputs }` | Max connections (-1 = unlimited) |
| `component` | `string` | Custom node component name |
| `category` | `string` | Palette category |
| `isImplemented` | `boolean` | Whether the step is fully implemented |

### Types (types.ts)

```typescript
export interface MyStepDSLNode {
  type: 'my-step';
  // DSL-specific fields
}

export interface MyStepCompiledNode {
  type: 'my-step';
  // Compiled representation
}
```

### Registration

Steps are registered via hand-maintained barrel files that must be updated when adding a step:

```typescript
// src/extensions/steps/register.ts
import type { StepDefinition } from '@abuddy/sdk/steps';
import { myStepStep } from './my-step';

export const steps: StepDefinition[] = [
  myStepStep,
];
```

```typescript
// src/extensions/steps/register-fe.ts
import type { StepDefinition } from '@abuddy/sdk/steps';
import { myStepStepFE } from './my-step/fe';

export const stepsFE: StepDefinition[] = [
  myStepStepFE,
];
```

The `abuddy add step` command handles this automatically.

### Manifest

```json
{
  "steps": {
    "register": "src/extensions/steps/register.ts",
    "definitions": [
      { "type": "my-step", "path": "src/extensions/steps/my-step", "kind": "step" }
    ]
  }
}
```

The `definitions` array drives flow-helper codegen — `generate-entries` creates typed DSL helpers (e.g. `myStep()`) in `#generated/flow-helpers`.

---

## Artifacts

An artifact viewer renders a typed content item (code, image, markdown, etc.) within threads.

### Scaffolding

```bash
abuddy add artifact chart --icon "BarChart3"
```

Creates `src/extensions/artifacts/viewers/chart-artifact.vue`.

### Viewer component

```vue
<script setup lang="ts">
import { BarChart3 } from 'lucide-vue-next';

defineProps<{ data: Record<string, unknown> }>();
</script>

<template>
  <div class="p-4">
    <div class="flex items-center gap-2 mb-2">
      <BarChart3 class="w-4 h-4" />
      <span class="text-sm font-medium">Chart</span>
    </div>
    <pre class="text-xs text-neutral-400">{{ data }}</pre>
  </div>
</template>
```

### Registration

```typescript
// src/extensions/artifacts/register.ts
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';

export const artifacts: ArtifactDefinition[] = [
  { type: 'chart' },
];
```

```typescript
// src/extensions/artifacts/register-fe.ts
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import ChartArtifact from './viewers/chart-artifact.vue';

export const artifactsFE: ArtifactDefinition[] = [
  { type: 'chart', fe: { component: ChartArtifact } },
];
```

### Manifest

```json
{
  "artifacts": "src/extensions/artifacts/register.ts"
}
```

The build system looks for a matching `-fe.ts` file automatically (e.g. `register-fe.ts`).

---

## Blocks

A block is an inline UI widget inside a chat message. There are two kinds:

- **Display blocks** — render data (markdown, code, tool activity)
- **Input blocks** — collect user responses (text, choices, approvals)

### Scaffolding

```bash
abuddy add block rating                # display block
abuddy add block color-picker --input  # input block
```

### Display block

```vue
<!-- src/extensions/blocks/display/RatingBlock.vue -->
<script setup lang="ts">
defineProps<{ data: Record<string, unknown> }>();
</script>

<template>
  <div class="p-2">
    <span v-for="i in (data.stars as number)" :key="i">*</span>
  </div>
</template>
```

### Input block

```vue
<!-- src/extensions/blocks/input/ColorPickerInput.vue -->
<script setup lang="ts">
defineProps<{ modelValue: Record<string, unknown> }>();
defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>();
</script>

<template>
  <div class="p-2">
    <input type="color" @input="$emit('update:modelValue', { color: ($event.target as HTMLInputElement).value })" />
  </div>
</template>
```

### Registration

```typescript
// src/extensions/blocks/register.ts
import type { BlockDefinition } from '@abuddy/sdk/blocks';

export const blocks: BlockDefinition[] = [
  { type: 'rating', kind: 'display' },
  { type: 'color-picker', kind: 'input' },
];
```

```typescript
// src/extensions/blocks/register-fe.ts
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import RatingBlock from './display/RatingBlock.vue';
import ColorPickerInput from './input/ColorPickerInput.vue';

export const blocksFE: BlockDefinition[] = [
  { type: 'rating', kind: 'display', fe: { component: RatingBlock } },
  { type: 'color-picker', kind: 'input', fe: { component: ColorPickerInput } },
];
```

### Manifest

```json
{
  "blocks": "src/extensions/blocks/register.ts"
}
```
