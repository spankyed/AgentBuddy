# Extensions — Steps, Artifacts, Blocks & FE Extension Points

Packs can extend the host's flow editor, artifact system, message UI, rich-text editor and app shell.

## Steps

A step definition adds a new node type to the visual flow editor. A `StepDefinition` (`@abuddy/sdk/steps`) has these fields:

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Node type id (`node.nodeType`) and DSL `type` |
| `kind` | `'step' \| 'trigger'` | Omitted means `'step'`. Trigger nodes start tracks and never run as steps |
| `build` | `StepBuildFacet` | Compile/validate/decompile DSL nodes |
| `runtime` | `StepRuntimeFacet` | Execute the step |
| `fe` | `StepFEFacet` | Palette, canvas node and form |
| `trigger` | `TriggerFacet` | For `kind: 'trigger'` |
| `dsl` | `StepDSLMeta` | Same shape as the manifest entry's `dsl`; codegen reads the manifest's (see [Flow helpers](#flow-helpers)) |

### Scaffolding

```bash
abuddy add step my-step
abuddy add step my-trigger --trigger   # sets kind: 'trigger' in the manifest; no trigger facet is scaffolded
```

Creates:

```
src/extensions/steps/my-step/
  build.ts      # myStepStepBuild: type + build facet only (no FE or runtime imports)
  index.ts      # myStepStep: spreads build.ts, adds fe (add runtime here)
  fe.ts         # myStepStepFE: node config, form component
  types.ts      # DSL and compiled node types
  form.vue      # Step configuration form
```

It adds `myStepStep` to the `steps.register` barrel, `myStepStepFE` to its `-fe.ts` sibling (`register-fe.ts`), and `myStepStepBuild` to the `steps.build` barrel when the manifest has one; appends the definition to `steps.definitions` (without `dsl`); and regenerates `__generated__/`.

### Build facet (build.ts)

```typescript
import type { StepDefinition, StepCompileResult, StepValidationError } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import type { DSLMyStepNode } from './types';

export const myStepStepBuild: StepDefinition = {
  type: 'my-step',
  build: {
    compile(node, nodeId, ts, ctx): StepCompileResult {
      const step = node as unknown as DSLMyStepNode;
      return {
        entity: { id: nodeId, entityType: EARS.Entity.Node, createdAt: ts, nodeType: 'my-step', label: step.label ?? 'My Step' },
        relations: [],
      };
    },
    validate(step, path, ctx): StepValidationError[] {
      return [];
    },
    getLabel(step, index) {
      return typeof step.label === 'string' ? step.label : `My Step ${index}`;
    },
  },
};
```

| Member | Signature | Description |
|---|---|---|
| `compile` | `(node, nodeId, ts, ctx) => { entity, relations }` | DSL node → `Node` entity. `ctx` (`StepCompileContext`) maps `actions`, `prompts` and `flows` names to ids. `relations` are `{ source, kind, target, info? }` |
| `validate` | `(step, path, ctx) => StepValidationError[]` | Each error is `{ path, message }`. `ctx` has `actions`, `prompts`, `flowNames`, `nodeLabels` (sets), `path`, `skipReferenceCheck?` |
| `getLabel` | `(step, index) => string` | Label for a DSL step at `index` |
| `decompile?` | `(node, ctx) => dslNode` | Entity → DSL (reverse of `compile`). `ctx` has `actionMap`, `promptMap`, `flowMap` and `resolveBranch?(sourceNodeId, sourceHandle)`. Omitted → `{ type, label }` |
| `relation?` | `{ field, targetEntity }` | The node field holding an id linked by an `instance_of` relation to a `targetEntity` row (the `action` step: `{ field: 'actionId', targetEntity: 'Action' }`); flow editing and export fill the field from the link |
| `branches?` | `(dslNode) => { key, steps }[]` | Inline step lists nested in the node. The compiler compiles each and wires branch `i` from this node with `sourceHandle: 'branch-<i>'`, continuing to the next step afterwards |

### Runtime facet

```typescript
// index.ts
export const myStepStep: StepDefinition = {
  ...myStepStepBuild,
  runtime: {
    isAsync: true,
    handler: async (tNode, node, ctx, actor) => {
      const a = actor as { send(event: unknown): void };
      a.send({ type: 'COMPLETE', result: { ok: true } });
    },
  },
  fe: myStepStepFE.fe,
};
```

| Member | Description |
|---|---|
| `handler(tNode, node, executionContext, actor)` | Runs the step. `tNode` is its trace node, `node` the compiled entity, `executionContext` has `flowTNodeId`, `event`, `steps` (earlier runs), `lastStep` and `runtime` (`getFlowActor`, `getAppServices`). Finish with `actor.send({ type: 'COMPLETE', result })`, or `actor.send({ type: 'ERROR', error })` with the error `reportError({ error, source, step: { phase, tNodeId, … } })` (`@abuddy/sdk/logger`) returns. A type without a handler completes with `{ executed: true }` |
| `isAsync` | The handler returns a promise; a rejection is reported and sent as `ERROR` |
| `spawnsSubflow` | The brain spawns a sub-flow machine for the node instead of a step machine (the `subflow` step) |
| `waits` | The step never completes on its own (keep-alive). `runFlow` in `@abuddy/testing` treats such a step as settled |

Conventions the brain reads from a `COMPLETE` result and the node:

| Convention | Effect |
|---|---|
| `result.sourceHandle: 'branch-N'` | Continues along the outgoing edge with that handle (what `switch` does) |
| `result.noMatch: true` | Ends the current chain |
| `final: true` on the compiled node | The flow completes when this step completes |
| Never sending `COMPLETE` | The step stays executing (set `waits: true`) |
| `KILL_FLOW` sent to `ctx.runtime.getFlowActor(flowTNodeId)` | Kills the flow |

### Trigger facet

A trigger (`kind: 'trigger'`) compiles a DSL track, not a step:

| Member | Description |
|---|---|
| `trackField` | The DSL track field this trigger owns (`'schedule'`); the compiler detects the trigger from it |
| `compile(track, trackId, ts, trackKey)` | Track → trigger node entity |
| `decompile(node)` | Node → track fields (`{ schedule: '0 * * * *' }`) |
| `persistent?` | Keeps the flow alive after all tracks drain |
| `register?(node, ctx)` | Runtime hooks per trigger node when the flow actor registers (cron jobs). `ctx` has `flowTNodeId` and `sendToBrainSystem({ eventType, payload?, targetFlowId? })` |
| `queryFields?` | Extra entity fields loaded with the trigger's nodes (`['cronExpression']`) |
| `validateTrack?(track)` | `{ valid, errors }` before compiling |
| `validate?(node)` | `{ valid, errors }` for a compiled node on persist |

Keep `register` (and its runtime imports) out of `build.ts`: default-setup's `schedule` step spreads the build facet in `index.ts` and adds `register` there with a dynamic import.

### Frontend facet (fe.ts)

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
      icon: Box,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-700/20',
      hoverBgColor: 'group-hover:bg-indigo-700/30',
      connectionRules: { inputs: -1, outputs: -1 },
      category: 'logic',
      isImplemented: true,
    },
  },
};
```

| Field | Description |
|---|---|
| `nodeConfig` | Palette and node appearance (below) |
| `loadComponents?` | `() => ({ node?, form? })`, called once on the frontend to fill `components` |
| `components?` | `{ node?, form? }`. `node` replaces the default canvas node (trigger nodes always use the trigger node); `form` replaces the default form |
| `defaults?` | Fields copied into a new node of this type |
| `colorKey?` | Node style color: `purple`, `blue`, `amber`, `cyan`, `orange`, `emerald`, `indigo`, `neutral`, `red` or `yellow` |
| `handlePrefix?` | Multi-output steps: new outgoing handles are `<prefix>-0`, `<prefix>-1`, … (`'branch'` pairs with `sourceHandle: 'branch-N'`) |
| `layout?` | ELK layout: `getHeight(node, { exitCount })`, `getPorts(node, { exitCount })`, `hasInput`, `usesExitCount`. Omitted → one input, one output |

The form component receives `node` and `resources` (`{ actions, flows, models, prompts }`) and emits `update-node` (the changed fields), `reindex-branches` (`{ type: 'inserted' \| 'removed', index }`) and `close`. The scaffolded `form.vue` declares `node` and `resources` and wraps `BaseForm` (`@abuddy/ui/components/BaseForm`), re-emitting its `update-node` and `close`.

#### Node config fields

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Display name in the node palette |
| `defaultLabel` | `string` | Label for new instances (falls back to `label`) |
| `icon` | `Component` | Lucide Vue component |
| `color` | `string` | Tailwind text color class |
| `bgColor` | `string` | Tailwind background class |
| `hoverBgColor` | `string` | Tailwind hover background class |
| `connectionRules` | `{ inputs, outputs }` | Max connections (-1 = unlimited) |
| `category` | `'trigger' \| 'action' \| 'logic' \| 'data' \| 'ai'` | Palette category |
| `isImplemented` | `boolean` | Palette items not implemented are disabled |
| `isDisabled` | `boolean` | Disables the palette item |

### Types (types.ts)

```typescript
import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';

export interface DSLMyStepNode extends DSLNodeBase {
  type: 'my-step';
  label?: string;
}

export interface MyStepNode extends NodeBase {
  nodeType: 'my-step';
}
```

`generate-entries` re-exports every definition's `types.ts` from `#generated/step-types`, and each `export interface … extends NodeBase` joins the pack's `Node` row union.

### Registration

Three barrels, each exporting an array:

| Barrel | Export | Contents | Loaded by |
|---|---|---|---|
| `steps.register` (`register.ts`) | `steps` | Full definitions (`index.ts`) | The pack's backend runtime |
| `register-fe.ts` next to it | `stepsFE` | FE definitions (`fe.ts`) | The generated FE entry, when the file exists |
| `steps.build` (`build.ts`) | `steps` | Build-only definitions (`build.ts`) | `abuddy build`; bundled to `dist/build/steps.build.mjs` |

```typescript
// src/extensions/steps/register.ts
import type { StepDefinition } from '@abuddy/sdk/steps';
import { myStepStep } from './my-step';

export const steps: StepDefinition[] = [
  myStepStep,
];
```

`abuddy add step` updates all three.

### Manifest

```json
{
  "steps": {
    "register": "src/extensions/steps/register.ts",
    "build": "src/extensions/steps/build.ts",
    "definitions": [
      { "type": "my-step", "path": "src/extensions/steps/my-step", "kind": "step" }
    ]
  }
}
```

`abuddy build` validates this pack's flows with the `build` barrel (or `register` without one), with each dependency's `build/steps.build.mjs` loaded as the definitions it compiles with (the build's own, not the app's); a step type this pack and a dependency both define fails the build. Without `build`, dependents get no step code for your steps.

### Flow helpers

`generate-entries` writes `#generated/flow-helpers`: `entry` and `on`, a helper for each definition that has `dsl`, trigger track builders, and the flow helpers of dependencies (re-exported from the modules their builds ship, skipping names already exported).

| `dsl` | Helper |
|---|---|
| none | No helper |
| `{}` | `ping(label?)` (type `ping`) |
| `{ defaultLabel: 'Kill Flow' }` | `kill(label = 'Kill Flow')` |
| `{ primaryField: 'action' }` | `action(action, opts?)`: `opts` takes the other fields of the first `export interface DSL…Node` in the step's `types.ts`; `generate-entries` fails when there is none |
| `{ custom: true }` | Re-exports everything from `<path>/helpers.ts` |

A `kind: 'trigger'` definition whose `build.ts` (or `index.ts`) contains `trackField: '<name>'` (other than `event`) gets `<name>(value, exits, label?)`, returning a track.

The helper is named after `type` in camelCase, with `-` and `_` separating words (`keep_alive` → `keepAlive`, `my-step` → `myStep`). The scaffolded `types.ts` names its DSL interface `DSL<Type>Node` (`DSLMyStepNode`), which `primaryField` reads.

---

## Artifacts

An artifact is a typed content item (code, image, markdown, …) shown in a thread's artifact panel. An `ArtifactDefinition` (`@abuddy/sdk/artifacts`) is `{ type, fe? }`:

| `fe` field | Required | Description |
|---|---|---|
| `icon` | yes | Lucide component for the artifact list |
| `component` | no | The viewer, set in `register-fe.ts`. Without one, the host shows the text viewer |

### Scaffolding

```bash
abuddy add artifact chart --icon BarChart3
```

Creates `src/extensions/artifacts/viewers/chart-artifact.vue`. When the manifest has `artifacts`, it adds `{ type: 'chart', fe: { icon: BarChart3 } }` to that array (importing the icon from `lucide-vue-next` unless the file already does) and `'chart': ChartArtifact` to a `componentMap` object in `register-fe.ts` (both files must exist; neither is created).

### Viewer component

The viewer receives `artifact: ArtifactItem`:

```vue
<script setup lang="ts">
import type { ArtifactItem } from '@abuddy/sdk/artifacts';

defineProps<{ artifact: ArtifactItem<{ points: number[] }> }>();
</script>

<template>
  <div class="p-4">
    <h3 class="text-sm font-medium">{{ artifact.title }}</h3>
    <pre class="text-xs text-neutral-400">{{ artifact.content }}</pre>
  </div>
</template>
```

`ArtifactItem<TContent>` is `{ id, type, title, content: TContent, color?, metadata?: { createdAt, updatedAt?, … } }`. The scaffolded viewer declares `artifact` and shows its title and content.

### Registration

default-setup's layout: `register.ts` holds the definitions with icons, `register-fe.ts` adds components.

```typescript
// src/extensions/artifacts/register.ts
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import { BarChart3 } from 'lucide-vue-next';

export const artifacts: ArtifactDefinition[] = [
  { type: 'chart', fe: { icon: BarChart3 } },
];
```

```typescript
// src/extensions/artifacts/register-fe.ts
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import { artifacts } from './register';
import ChartArtifact from './viewers/chart-artifact.vue';

const componentMap: Record<string, unknown> = {
  'chart': ChartArtifact,
};

export const artifactsFE: ArtifactDefinition[] = artifacts.map(def => ({
  ...def,
  fe: def.fe ? { ...def.fe, component: componentMap[def.type] } : undefined,
}));
```

### Manifest

```json
{
  "artifacts": "src/extensions/artifacts/register.ts"
}
```

The backend runtime imports `artifacts` from that path; the generated FE entry imports `artifactsFE` from the `-fe.ts` sibling when it exists.

### Creating artifacts from the backend

default-setup's threads feature provides `services.artifact` (declare `default-setup` in `dependencies` for its types):

| Call | Does |
|---|---|
| `createAndNotify({ artifactType, title, content, threadId?, color? })` | Creates the `Artifact` row, links it to the thread and sends `ARTIFACT_ADDED` to the threads plugin when `threadId` is given. Returns `{ artifactId }` |
| `updateAndNotify(artifactId, { title?, content?, threadId? })` | Patches it; sends `ARTIFACT_UPDATED` when `threadId` is given |
| `findOrCreateByType(threadId, artifactType, { title, content, color? })` | At most one artifact of the type per thread. Returns `{ artifactId, created }` |

`color` is one of `blue`, `purple`, `emerald`, `amber`, `red`, `cyan` (the list pill's color).

### default-setup's artifact types

| Type | Viewer |
|---|---|
| `text`, `code`, `review`, `image`, `slack`, `todo`, `project`, `json`, `markdown`, `claude-session`, `codex-session`, `diff`, `plan`, `note` | Own viewer |
| `graph`, `table` | Icon only (text viewer) |

---

## Blocks

A block is an inline UI widget inside a chat message. A `BlockDefinition` (`@abuddy/sdk/blocks`) is `{ type, kind?, fe?, be? }`:

- **Display blocks** (`kind` omitted or `'display'`) render data (markdown, code, tool activity).
- **Input blocks** (`kind: 'input'`) collect a response (text, choices, approvals).

### Scaffolding

```bash
abuddy add block rating                # display block
abuddy add block color-picker --input  # input block
```

Creates `src/extensions/blocks/display/RatingBlock.vue` or `src/extensions/blocks/input/ColorPickerInput.vue`. When the manifest has `blocks`, it adds `{ type }` (with `kind: 'input'`) to that array and the component to the `componentMap` in `register-fe.ts` (both files must exist). The scaffolded display block declares an example `text` prop; the input block declares `label`, `disabled` and `response` and emits `submit` and `cancel`.

### Block components

A message's blocks are `{ type, props }[]`. The host renders each block's component with:

| Receives | Display | Input |
|---|---|---|
| `props` spread as component props | yes | yes |
| `disabled` (the message has been answered) | | yes |
| `response` (the stored response) | | yes |

Components answer by emitting `submit` (the response value) or `cancel` (sent as `{ cancelled: true }`). The response is stored on the message and fires the flow event `interactive.message.response` with `{ messageId, threadId, response }`.

```vue
<!-- src/extensions/blocks/input/ColorPickerInput.vue -->
<script setup lang="ts">
defineProps<{ label: string; disabled?: boolean; response?: { color: string } | null }>();
defineEmits<{ submit: [value: { color: string }]; cancel: [] }>();
</script>

<template>
  <div class="p-2">
    <input type="color" :disabled="disabled" @change="$emit('submit', { color: ($event.target as HTMLInputElement).value })" />
    <button :disabled="disabled" @click="$emit('cancel')">Cancel</button>
  </div>
</template>
```

### Registration

```typescript
// src/extensions/blocks/register.ts
import type { BlockDefinition } from '@abuddy/sdk/blocks';

export const blocks: BlockDefinition[] = [
  { type: 'rating' },
  { type: 'color-picker', kind: 'input' },
];
```

```typescript
// src/extensions/blocks/register-fe.ts
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { blocks } from './register';
import RatingBlock from './display/RatingBlock.vue';
import ColorPickerInput from './input/ColorPickerInput.vue';

const componentMap: Record<string, unknown> = {
  'rating': RatingBlock,
  'color-picker': ColorPickerInput,
};

export const blocksFE: BlockDefinition[] = blocks.map(def => ({
  ...def,
  fe: componentMap[def.type] ? { component: componentMap[def.type] } : undefined,
}));
```

The host renders `fe.component`.

### Backend facet

`be.generateAsideText(block, response, context)` returns the one-line summary shown when an auto-hidden (`autoHide`) message collapses after its response, or `null` for the default. `context` is `' — <label>'` or `''`. The threads service consults it only when the message's primary interactive block is one of `approval`, `choice`, `text`, `question`, `file-picker`, `project-select` or `button-group`.

### Manifest

```json
{
  "blocks": "src/extensions/blocks/register.ts"
}
```

### Sending blocks from the backend

default-setup's threads feature provides `services.chat.sendBlockMessage({ threadId, text, blocks, forkable?, autoHide?, asUser?, asideContext? })`: it adds an assistant message with the blocks and sends `MESSAGE_ADDED` to the threads plugin, returning `{ messageId }`. `autoHide: true` requires `asUser` (boolean); `asideContext` overrides the label used in the aside text.

```typescript
services.chat.sendBlockMessage({
  threadId,
  text: 'Pick a color',
  blocks: [{ type: 'color-picker', props: { label: 'Accent' } }],
});
```

#### Pairing a prompt with an input

A message's `blocks` array is rendered in order, so the convention for asking a question is two blocks: a `prompt` display block carrying the question text, followed by the input block that collects the answer. The message's own `text` is what shows in thread summaries; the `prompt` block is what the user reads above the control.

```typescript
services.chat.sendBlockMessage({
  threadId,
  text: 'Choose a project directory',
  blocks: [
    { type: 'prompt', props: { content: 'Which directory should I work in?' } },
    { type: 'file-picker', props: { fileType: 'directory', allowMultiple: false, displayText: 'Selected project:' } },
  ],
});
```

The same shape covers the other input types. Each row below is one `blocks` array:

| Asking for | Blocks |
|---|---|
| A file or directory | `prompt`, then `file-picker` with `{ fileType: 'file' \| 'directory' \| 'both', allowMultiple, displayText }` |
| Free text | `prompt`, then `text` with `{ placeholder, multiline, required, displayText, suggestions }` |
| One of several options | `prompt`, then `choice` |
| Confirmation | `prompt`, then `approval` |
| An action to run | `prompt` (optional), then `button-group` with `{ buttons, keepInteractive, displayText }` |

A `link` block needs no input block — it is a display block listing navigation targets, and the leading `prompt` is optional:

```typescript
services.chat.sendBlockMessage({
  threadId,
  text: 'Opening settings',
  blocks: [{ type: 'link', props: { links } }],
});
```

#### Button groups

`button-group` is the one input block the backend drives after the first response, so it has two modes. Both follow the same path: frontend → backend → database → `UPDATE_MESSAGE_STATE` → frontend.

- **`toggleStates`** — an on/off pair. The backend flips `state` between the two itself.
- **`states`** — a map of named states, where a flow decides which one comes next.

Each `ButtonConfig` (`@abuddy/sdk/blocks`) is `{ id, label, state }` plus one of those two maps; every state entry carries its own `label`, optional `variant` and optional `disabled`. Pass `keepInteractive: true` to leave the buttons live after a response instead of disabling them.

```typescript
services.chat.sendBlockMessage({
  threadId,
  text: 'Quick toggles:',
  blocks: [{
    type: 'button-group',
    props: {
      buttons: [
        // Auto-cycling: the backend flips between on and off
        {
          id: 'watch',
          label: 'Watch',
          state: 'off',
          toggleStates: {
            on: { label: 'Watching', variant: 'primary' },
            off: { label: 'Watch' },
          },
        },
        // Manual control: a flow sets the next state
        {
          id: 'deploy',
          label: 'Deploy',
          state: 'idle',
          states: {
            idle: { label: 'Deploy' },
            deploying: { label: 'Deploying…', disabled: true },
            deployed: { label: 'Deployed' },
          },
        },
      ],
      keepInteractive: true,
    },
  }],
});
```

The block answers with a `ButtonGroupResponse` — `{ buttonId, state }`. Responses reach flows as `interactive.message.response` with `{ messageId, threadId, response }`.

### default-setup's block types

| Kind | Types |
|---|---|
| Display | `prompt`, `note`, `markdown`, `link`, `tool-activity`, `thinking`, `tool-input`, `context-usage`, `session-list` |
| Input | `actions`, `toggles`, `file-picker`, `choice`, `text`, `approval`, `button-group`, `question`, `project-select` |

---

## Other frontend extension points

### Tiptap plugins

`fe.tiptapPlugins` in the manifest names a module exporting `tiptapPlugins: TiptapPlugin[]` (`@abuddy/sdk/fe`). Every `TiptapEditor` created afterwards uses them:

| Field | Description |
|---|---|
| `extensions?` | Tiptap extensions added to the editor |
| `popups?` | Components rendered with the editor (suggestion popups) |
| `isSuggestionActive?(state)` | Return `true` while a popup is open, so Escape goes to the popup |

### App extensions

`fe.appExtensions` maps a slot name to a Vue component file: `{ "welcome": "src/extensions/app/Welcome.vue" }`. The app renders one slot, `welcome`: an overlay shown to first-time users during onboarding. A pack registering a slot another pack registered replaces it.

### PackFERegistration

The generated FE entry (`__generated__/pack-entry-fe.ts`) default-exports a `PackFERegistration` built from the manifest:

| Field | Source |
|---|---|
| `plugins` | Each `features[].plugin.entry` (with `designation` from the manifest) |
| `defaultPlugin` | The `defaultPlugin` feature, or the first with a plugin |
| `steps` | `stepsFE` from `register-fe.ts` next to `steps.register` |
| `artifacts` / `blocks` | `artifactsFE` / `blocksFE` from the `-fe.ts` siblings |
| `tiptapPlugins` | `fe.tiptapPlugins` |
| `appExtensions` | `fe.appExtensions` |
| `dslTypes` | `dsl` entries with a `monaco` target (`__generated__/dsl-types-fe.ts`) |

The renderer registers it for your pack; nothing in your frontend registers anything itself.

`features[].references` (`ReferenceTypeConfig`s from `@abuddy/sdk/fe/references`: how an entity type appears and navigates when referenced in the UI) is read only for built-in packs.
