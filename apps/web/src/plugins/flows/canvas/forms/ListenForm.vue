<template>
  <BaseForm 
    :node="node"
    @update-label="$emit('update-label', $event)"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        MODE
      </label>
      <select
        :value="node.mode"
        @change="updateConfig({ mode: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="entry">Entry</option>
        <option value="internal">Internal</option>
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        EVENT TAG
      </label>
      <input
        :value="node.eventType || ''"
        @input="updateConfig({ eventType: ($event.target as HTMLInputElement).value })"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div v-if="node.mode === 'entry'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        DEBOUNCE (MS)
      </label>
      <input
        :value="node.debounceMs || ''"
        @input="updateConfig({ debounceMs: parseInt(($event.target as HTMLInputElement).value) || 0 })"
        type="number"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div v-if="node.mode === 'internal'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        SCOPE
      </label>
      <select
        :value="node.scope"
        @change="updateConfig({ scope: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="local">Local</option>
        <option value="global">Global</option>
      </select>
    </div>
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
