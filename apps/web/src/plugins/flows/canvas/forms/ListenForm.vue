<template>
  <BaseForm 
    :node="node"
    @update-label="$emit('update-label', $event)"
    @update-description="$emit('update-description', $event)"
  >
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Mode
      <select
        :value="node.mode"
        @change="updateConfig({ mode: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      >
        <option value="entry">Entry</option>
        <option value="internal">Internal</option>
      </select>
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Event Tag
      <input
        :value="node.eventType || ''"
        @input="updateConfig({ eventType: ($event.target as HTMLInputElement).value })"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label v-if="node.mode === 'entry'" class="block mb-2 text-sm font-medium text-neutral-200">
      Debounce (ms)
      <input
        :value="node.debounceMs || ''"
        @input="updateConfig({ debounceMs: parseInt(($event.target as HTMLInputElement).value) || 0 })"
        type="number"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label v-if="node.mode === 'internal'" class="block mb-2 text-sm font-medium text-neutral-200">
      Scope
      <select
        :value="node.scope"
        @change="updateConfig({ scope: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      >
        <option value="local">Local</option>
        <option value="global">Global</option>
      </select>
    </label>
  </BaseForm>
</template>

<script setup lang="ts">
import type { ListenNode } from '@abuddy/api';
import BaseForm from './BaseForm.vue';
import { isNodeKind } from '../../helpers/is-node-kind';

const props = defineProps<{
  node: ListenNode;
}>();

const emit = defineEmits<{
  'update-label': [label: string]
  'update-description': [description: string]
  'update-config': [config: Record<string, any>]
}>();

// Type guard to ensure we have a ListenNode
if (!isNodeKind('listen')(props.node)) {
  throw new Error('ListenForm requires a node of type "listen"');
}

function updateConfig(config: Record<string, any>) {
  emit('update-config', config);
}
</script>
