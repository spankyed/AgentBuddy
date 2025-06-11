<template>
  <BaseForm :node="node">
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Entity Type
      <select
        v-model="node.entityTypeTarget"
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
        v-model="node.entityId"
        placeholder="Auto-generated if empty"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Attributes (JSON)
      <textarea
        v-model="attributesStr"
        rows="4"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
        @input="()=>{}"
      />
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      <input
        type="checkbox"
        v-model="node.inferLabel"
        class="mr-2"
      />
      Infer Label
    </label>
  </BaseForm>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { CreateNode, EARS } from '@abuddy/api';
import BaseForm from './BaseForm.vue';
import { isNodeKind } from '../../helpers/is-node-kind';

const props = defineProps<{
  node: CreateNode;
}>();

// Type guard to ensure we have a CreateNode
if (!isNodeKind('create')(props.node)) {
  throw new Error('CreateForm requires a node of type "create"');
}

const attributesStr = ref('');
</script>
