# Node Configuration System

This directory contains the centralized configuration for all flow node types. This system makes it easy to add new node types by updating configuration in a single place.

## Adding a New Node Type

To add a new node type (e.g., an LLM node), follow these steps:

### 1. Backend - Define the Node Type

First, add the node interface in `apps/api/src/systems/flows/types.ts`:

```typescript
export interface YourNewNode extends NodeBase {
  nodeType: 'your_new_type';
  // Add your specific fields here
  someField: string;
  anotherField?: number;
}
```

Then add it to the `NodeEntity` union type in the same file.

### 2. Backend - Add Node Metadata

Update `apps/api/src/systems/flows/config/node-config.ts`:

```typescript
your_new_type: {
  nodeType: 'your_new_type',
  label: 'Your Node',
  description: 'Description of what this node does',
  category: 'action', // or 'trigger', 'logic', 'data', 'ai'
  validation: {
    requiredFields: ['someField'],
  },
  defaults: {
    someField: 'default value',
  },
},
```

### 3. Frontend - Add Node Configuration

Update `apps/web/src/plugins/flows/config/node-config.ts`:

```typescript
your_new_type: {
  type: 'your_new_type',
  label: 'Your Node',
  icon: YourIcon, // Import from lucide-vue-next
  color: 'text-blue-400',
  bgColor: 'bg-blue-500/10',
  hoverBgColor: 'group-hover:bg-blue-500/15',
  connectionRules: { 
    inputs: 1,    // Number of allowed inputs
    outputs: 1    // Number of allowed outputs (-1 for unlimited)
  },
  component: 'YourNodeComponent' // Optional: custom Vue component
}
```

### 4. Frontend - Create Node Component (Optional)

If your node needs a custom component, create it in `apps/web/src/plugins/flows/canvas/nodes/`:

```vue
<!-- YourNodeComponent.vue -->
<template>
  <div class="node-container">
    <!-- Your node UI -->
  </div>
</template>

<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
// Your component logic
</script>
```

Then import and register it in `apps/web/src/plugins/flows/canvas/nodes/index.ts`.

## That's It!

With these changes:
- ✅ The node will appear in the node palette
- ✅ It will have the correct styling in all views (tree, graph, canvas)
- ✅ Connection rules will be enforced
- ✅ Backend validation will work automatically
- ✅ Default values will be applied when creating new nodes

## Example: LLM Node

The LLM node has already been added as an example. You can find its configuration in:
- Backend types: `apps/api/src/systems/flows/types.ts` (LLMNode interface)
- Backend config: `apps/api/src/systems/flows/config/node-config.ts`
- Frontend config: `apps/web/src/plugins/flows/config/node-config.ts`

The LLM node uses the generic `VariableNode` component but has its own styling and connection rules. 