<template>
  <BaseForm :node="node">
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Mode
      <select
        v-model="node.mode"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      >
        <option value="entry">Entry</option>
        <option value="internal">Internal</option>
      </select>
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Event Tag
      <input
        v-model="node.eventType"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label v-if="node.mode === 'entry'" class="block mb-2 text-sm font-medium text-neutral-200">
      Debounce (ms)
      <input
        v-model="node.debounceMs"
        type="number"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label v-if="node.mode === 'internal'" class="block mb-2 text-sm font-medium text-neutral-200">
      Scope
      <select
        v-model="node.scope"
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

// Type guard to ensure we have a ListenNode
if (!isNodeKind('listen')(props.node)) {
  throw new Error('ListenForm requires a node of type "listen"');
}
</script>
