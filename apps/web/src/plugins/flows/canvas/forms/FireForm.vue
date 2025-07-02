<template>
  <BaseForm 
    :node="node"
    @update-label="$emit('update-label', $event)"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        EVENT TAG
      </label>
      <input
        :value="node.eventType || ''"
        @input="updateConfig({ eventType: ($event.target as HTMLInputElement).value })"
        placeholder="#THREAD.CREATE"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        PAYLOAD (JSON)
      </label>
      <textarea
        v-model="payloadStr"
        rows="4"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        @input="updatePayload"
      />
    </div>
    <div>
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
import { ref, onMounted, watch } from 'vue';
import { isNodeKind } from '../../helpers/is-node-kind';
import type { FireNode } from '@abuddy/api';
import BaseForm from './BaseForm.vue';

const props = defineProps<{
  node: FireNode;
}>();

const emit = defineEmits<{
  'update-label': [label: string]
  'update-description': [description: string]
  'update-config': [config: Record<string, any>]
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

// Watch for external changes to the node's payload
watch(() => props.node.payload, (newPayload) => {
  if (newPayload) {
    payloadStr.value = JSON.stringify(newPayload, null, 2);
  } else {
    payloadStr.value = '';
  }
});

function updatePayload() {
  try {
    const payload = JSON.parse(payloadStr.value);
    updateConfig({ payload });
  } catch (e) {
    // Invalid JSON - don't update
  }
}

function updateConfig(config: Record<string, any>) {
  emit('update-config', config);
}
</script>
