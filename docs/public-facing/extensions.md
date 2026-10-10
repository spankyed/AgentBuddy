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
  build.ts      # myStepStepBuild: its StepBuildFacet (no FE or runtime imports)
  fe.ts         # myStepStepFE: its StepFEFacet — node config, form component
  types.ts      # DSL and compiled node types
  form.vue      # Step configuration form
```

It writes the manifest entry under `extensions.steps` naming those two facets, and regenerates `__generated__/`. Add a
`runtime.ts` and name it in the entry to give the step something to run. A type the manifest already
declares is refused.

### Build facet (build.ts)

```typescript
import type { StepBuildFacet, StepCompileResult, StepValidationError } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import type { DSLMyStepNode } from './types.ts';

export const myStepStepBuild: StepBuildFacet = {
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
// runtime.ts
import type { ExecutionContext, TNodeEntity } from '@abuddy/sdk/steps';

export async function handler(tNode: TNodeEntity, node: unknown, ctx: ExecutionContext, actor: unknown) {
  const a = actor as { send(event: unknown): void };
  a.send({ type: 'COMPLETE', result: { ok: true } });
}
```

```json
{ "runtime": { "handler": "src/extensions/steps/my-step/runtime.ts#handler", "isAsync": true } }
```

The handler is named rather than imported, so its module — and whatever it reaches, models, the filesystem,
a terminal — loads on the step's first run and not at pack load. The flags beside it are data, because the
brain reads them before it decides how to run the step; `sync` is the one that changes the loading.

| Member | Description |
|---|---|
| `handler(tNode, node, executionContext, actor)` | Runs the step. `tNode` is its trace node, `node` the compiled entity, `executionContext` has `flowTNodeId`, `event`, `steps` (earlier runs), `lastStep` and `runtime` (`getFlowActor`, `getAppServices`). Finish with `actor.send({ type: 'COMPLETE', result })`, or `actor.send({ type: 'ERROR', error })` with the error `reportError({ error, source, step: { phase, tNodeId, … } })` (`@abuddy/sdk/logger`) returns. A type without a handler completes with `{ executed: true }` |
| `isAsync` | The handler returns a promise; a rejection is reported and sent as `ERROR` |
| `sync` | The handler's module is imported with the pack entry rather than on the step's first run, so its sends land in the brain's own dispatch. For a handler whose sends have to be ordered with the transition that called it — `kill` ends the flow *and* completes itself, and a tick's delay leaves the step reading as still running. Exclusive with `isAsync` |
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
| `register?(node, ctx)` | Runtime hooks per trigger node when the flow actor registers (cron jobs). `ctx` has `flowTNodeId` and `sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', eventType, payload?, targetFlowId? })` |
| `queryFields?` | Extra entity fields loaded with the trigger's nodes (`['cronExpression']`) |
| `validateTrack?(track)` | `{ valid, errors }` before compiling |
| `validate?(node)` | `{ valid, errors }` for a compiled node on persist |

`register` is declared beside the facet rather than inside it, for the same reason a step's handler is:
`trigger.facet` names the eager half, which `build.ts` exports, and `trigger.register` names the function
whose module is loaded when the trigger is first registered.

### Frontend facet (fe.ts)

```typescript
import type { StepFEFacet } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Box } from 'lucide-vue-next';

export const myStepStepFE: StepFEFacet = {
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

### Manifest

A step is declared in `abuddy.json` under `extensions.steps`, keyed by its type, with each facet named where its code is:

```json
{
  "extensions": {
    "steps": {
      "my-step": {
        "build": "src/extensions/steps/my-step/build.ts#myStepStepBuild",
        "fe": "src/extensions/steps/my-step/fe.ts#myStepStepFE",
        "runtime": { "handler": "src/extensions/steps/my-step/runtime.ts#handler", "isAsync": true },
        "dsl": { "primaryField": "action" }
      },
      "my-trigger": {
        "kind": "trigger",
        "trigger": {
          "facet": "src/extensions/steps/my-trigger/build.ts#myTriggerBuild",
          "register": "src/extensions/steps/my-trigger/runtime.ts#register"
        },
        "fe": "src/extensions/steps/my-trigger/fe.ts#myTriggerFE"
      }
    }
  }
}
```

| Field | What it is |
|---|---|
| `kind` | `step` (the default) or `trigger` |
| `build` | `"path#exportName"` of its `StepBuildFacet`. A trigger declares `trigger` instead |
| `trigger` | For a trigger: `{ facet, register? }` — its `TriggerFacet`, and the function that starts it |
| `fe` | `"path#exportName"` of its `StepFEFacet` |
| `runtime` | `{ handler?, isAsync?, waits?, spawnsSubflow? }` |
| `dsl` | DSL configuration for flow-helper generation (below) |

Codegen sends each facet where it is used, so no barrel keeps them in step with each other: `build` and
`runtime` to the pack's backend registration, `fe` to its frontend one, and `build` (or `trigger`) alone to
`src/__generated__/steps-build.ts`, which `abuddy build` bundles to `dist/build/steps.build.mjs` — the
module a *dependent* pack's build loads to validate its flows with your step code. A dependency's step types
are loaded that way too, and a type this pack and a dependency both define fails the build.

A step's directory is the dirname of the first facet it names: `types.ts` and, for `dsl.custom`,
`helpers.ts` are read from there.

### Flow helpers

`generate-entries` writes `#generated/flow-helpers`: `entry` and `on`, a helper for each definition that has `dsl`, trigger track builders, and the flow helpers of dependencies (re-exported from the modules their builds ship, skipping names already exported).

| `dsl` | Helper |
|---|---|
| none | No helper |
| `{}` | `ping(label?)` (type `ping`) |
| `{ defaultLabel: 'Kill Flow' }` | `kill(label = 'Kill Flow')` |
| `{ primaryField: 'action' }` | `action(action, opts?)`: `opts` takes the other fields of the first `export interface DSL…Node` in the step's `types.ts`; `generate-entries` fails when there is none |
| `{ custom: true }` | Re-exports everything from `<path>/helpers.ts` |

A `kind: 'trigger'` entry whose declared facet module contains `trackField: '<name>'` (other than `event`) gets `<name>(value, exits, label?)`, returning a track.

The helper is named after `type` in camelCase, with `-` and `_` separating words (`keep_alive` → `keepAlive`, `my-step` → `myStep`). The scaffolded `types.ts` names its DSL interface `DSL<Type>Node` (`DSLMyStepNode`), which `primaryField` reads.

---

## Artifacts

An artifact is a typed content item (code, image, markdown, …) shown in a thread's artifact panel. An `ArtifactDefinition` (`@abuddy/sdk/artifacts`) is `{ type, fe? }`:

| `fe` field | Required | Description |
|---|---|---|
| `icon` | yes | The icon shown in the artifact list |
| `component` | no | The viewer. Without one, the host shows the text viewer |

### Scaffolding

```bash
abuddy add artifact chart --icon BarChart3
```

Writes the manifest entry under `extensions.artifacts` and creates `src/extensions/artifacts/viewers/chart-artifact.vue`. A type the manifest already declares is refused.

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

### Manifest

An artifact is declared in `abuddy.json` under `extensions.artifacts`, keyed by its type:

```json
{
  "extensions": {
    "artifacts": {
      "chart": { "icon": "BarChart3", "fe": "src/extensions/artifacts/viewers/chart-artifact.vue" }
    }
  }
}
```

| Field | Required | What it is |
|---|---|---|
| `icon` | yes | The name of a `lucide-vue-next` export. That is the icon set the host provides every pack's frontend, so a pack names one rather than shipping a component; a name lucide doesn't export fails the pack's typecheck |
| `fe` | no | The viewer that opens it — a `.vue` file, taken by its default export |

Both of an artifact's facets are frontend ones, so the backend registration carries the type alone and the
icon set never reaches a pack's backend bundle.

### Creating artifacts from the backend

default-setup's threads feature provides `services.artifact` (declare `default-setup` in `dependencies` for its types):

| Call | Does |
|---|---|
| `createAndNotify({ artifactType, title, content, threadId?, color? })` | Creates the `Artifact` row, links it to the thread and sends `ARTIFACT_ADDED` to the threads plugin when `threadId` is given. Returns `{ artifactId }` |
| `updateAndNotify(artifactId, { title?, content?, threadId? })` | Patches it; sends `ARTIFACT_UPDATED` when `threadId` is given |
| `findOrCreateByType(threadId, artifactType, { title, content, color? })` | At most one artifact of the type per thread. Returns `{ artifactId, created }` |

`color` is one of `blue`, `purple`, `emerald`, `amber`, `red`, `cyan` (the list pill's color).

### default-setup's artifact types

`text`, `code`, `review`, `image`, `slack`, `todo`, `project`, `json`, `graph`, `table`, `markdown`,
`claude-session`, `codex-session`, `diff`, `plan`, `note` — each with its own viewer under
`src/extensions/artifacts/viewers/`.

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

Writes the manifest entry under `extensions.blocks` and creates `src/extensions/blocks/display/RatingBlock.vue` or `src/extensions/blocks/input/ColorPickerInput.vue`. The scaffolded display block declares an example `text` prop; the input block declares `label`, `disabled` and `response` and emits `submit` and `cancel`. A type the manifest already declares is refused.

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

### Manifest

A block is declared in `abuddy.json` under `extensions.blocks`, keyed by its type. Each entry names where its code lives, and codegen
splits the two facets between the entries: the component goes into the pack's frontend bundle, the backend
facet into its runtime, so a backend process never loads a Vue component to know a block exists.

```json
{
  "extensions": {
    "blocks": {
      "rating": { "fe": "src/extensions/blocks/display/RatingBlock.vue" },
      "color-picker": { "kind": "input", "fe": "src/extensions/blocks/input/ColorPickerInput.vue" }
    }
  }
}
```

| Field | Required | What it is |
|---|---|---|
| `kind` | no | `display` (the default) or `input` |
| `fe` | no | The component that draws it — a `.vue` file, taken by its default export. The host renders it |
| `be` | no | `"path#exportName"` of its `BlockBEFacet` |

The key is the type, so a pack cannot declare one twice, and a path naming no file fails the build naming
the block and the path.

### Backend facet

`be.generateAsideText(block, response, context)` returns the one-line summary shown when an auto-hidden (`autoHide`) message collapses after its response, or `null` for the default. `context` is `' — <label>'` or `''`. The threads service consults it only when the message's primary interactive block is one of `approval`, `choice`, `text`, `question`, `file-picker`, `project-select` or `button-group`.

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

`extensions.fe.appExtensions` maps a slot name to a Vue component file: `{ "welcome": "src/extensions/app/Welcome.vue" }`. The app renders one slot, `welcome`: an overlay shown to first-time users during onboarding. A pack registering a slot another pack registered replaces it.

### PackFERegistration

The generated FE entry (`__generated__/pack-entry-fe.ts`) default-exports a `PackFERegistration` built from the manifest:

| Field | Source |
|---|---|
| `features` | Each feature with a `plugin`: its `plugin.entry`, its `designation`, and `default: true` on the one whose `plugin` sets `default` (else the first). The first pack registered with a default opens by default; a role another pack's plugin plays refuses the pack |
| `steps` / `artifacts` / `blocks` | each entry's `fe` facet, imported into the generated frontend entry (an artifact's `icon` with it) |
| `tiptapPlugins` | `extensions.fe.tiptapPlugins` |
| `appExtensions` | `extensions.fe.appExtensions` |
| `dslTypes` | `extensions.dsl` entries with a `monaco` target (`__generated__/dsl-types-fe.ts`) |

The renderer registers it for your pack; nothing in your frontend registers anything itself.

`features.<id>.references` (`ReferenceTypeConfig`s from `@abuddy/sdk/fe/references`: how an entity type appears and navigates when referenced in the UI) is read only for built-in packs.
