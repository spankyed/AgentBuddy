<template>
  <BaseForm :node="node">
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Event Tag
      <input
        v-model="node.eventTag"
        placeholder="#THREAD.CREATE"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Payload (JSON)
      <textarea
        v-model="payloadStr"
        rows="4"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
        @input="updatePayload"
      />
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
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
import { ref, onMounted } from 'vue';
import { isNodeKind } from '../../helpers/is-node-kind';
import type { FireNode } from '@abuddy/api';
import BaseForm from './BaseForm.vue';

const props = defineProps<{
  node: FireNode;
}>();

// Type guard to ensure we have a FireNode
if (!isNodeKind('fire')(props.node)) {
  throw new Error('FireForm requires a node of type "fire"');
}

const payloadStr = ref('');

onMounted(() => {
  // Initialize payload string from node
  if (props.node.payload) {
    payloadStr.value = JSON.stringify(props.node.payload, null, 2);
  }
});

function updatePayload() {
  try {
    props.node.payload = JSON.parse(payloadStr.value);
  } catch (e) {
    // Invalid JSON - leave the payload as is
  }
}
</script>
