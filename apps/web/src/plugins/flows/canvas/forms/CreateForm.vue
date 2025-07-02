<template>
  <BaseForm 
    :node="node"
    @update-label="$emit('update-label', $event)"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ENTITY TYPE
      </label>
      <select
        :value="node.entityTypeTarget"
        @change="updateConfig({ entityTypeTarget: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="thread">Thread</option>
        <option value="message">Message</option>
        <option value="node">Node</option>
        <option value="flow">Flow</option>
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        ENTITY ID (OPTIONAL)
      </label>
      <input
        :value="node.entityId || ''"
        @input="updateConfig({ entityId: ($event.target as HTMLInputElement).value })"
        placeholder="Auto-generated if empty"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="flex items-center text-sm text-neutral-200">
        <input
          type="checkbox"
          :checked="node.inferLabel"
          @change="updateConfig({ inferLabel: ($event.target as HTMLInputElement).checked })"
          class="mr-2 rounded border-neutral-700 bg-neutral-800 text-blue-500 focus:ring-2 focus:ring-blue-500"
        />
        <span class="text-xs font-medium uppercase tracking-wider text-neutral-400">INFER LABEL</span>
      </label>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import type { CreateNode, EARS } from '@abuddy/api';
import BaseForm from './BaseForm.vue';
import { isNodeKind } from '../../helpers/is-node-kind';

const props = defineProps<{
  node: CreateNode;
}>();

const emit = defineEmits<{
  'update-label': [label: string]
  'update-config': [config: Record<string, any>]
}>();

// Type guard to ensure we have a CreateNode
if (!isNodeKind('create')(props.node)) {
  throw new Error('CreateForm requires a node of type "create"');
}

function updateConfig(config: Record<string, any>) {
  emit('update-config', config);
}
</script>
