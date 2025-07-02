<template>
  <BaseForm 
    :node="node"
    @update-label="$emit('update-label', $event)"
    @update-description="$emit('update-description', $event)"
  >
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Entity Type
      <select
        :value="node.entityTypeTarget"
        @change="updateConfig({ entityTypeTarget: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      >
        <option value="thread">Thread</option>
        <option value="message">Message</option>
        <option value="node">Node</option>
        <option value="flow">Flow</option>
      </select>
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Entity ID (optional)
      <input
        :value="node.entityId || ''"
        @input="updateConfig({ entityId: ($event.target as HTMLInputElement).value })"
        placeholder="Auto-generated if empty"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      <input
        type="checkbox"
        :checked="node.inferLabel"
        @change="updateConfig({ inferLabel: ($event.target as HTMLInputElement).checked })"
        class="mr-2"
      />
      Infer Label
    </label>
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
  'update-description': [description: string]
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
