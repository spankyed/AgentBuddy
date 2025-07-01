<template>
  <section class="w-full h-full p-4 bg-neutral-800">
    <h3>{{ node.label }}</h3>
    <!-- Common fields for all nodes -->
    <label class="block mt-2 mb-2 text-sm font-medium text-neutral-200">
      Name
      <input
        :value="node.label"
        @input="$emit('update-label', ($event.target as HTMLInputElement).value)"
        class="w-full px-3 py-2 mt-1 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <label class="block mb-2 text-sm font-medium text-neutral-200">
      Description
      <input
        :value="node.description || ''"
        @input="$emit('update-description', ($event.target as HTMLInputElement).value)"
        class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
      />
    </label>
    <!-- Slot for node-specific fields -->
    <slot></slot>
  </section>
</template>

<script setup lang="ts">
import type { NodeEntity } from '@abuddy/api';

defineProps<{
  node: NodeEntity;
}>();

defineEmits<{
  'update-label': [label: string]
  'update-description': [description: string]
  'update-config': [config: Record<string, any>]
}>();
</script>
