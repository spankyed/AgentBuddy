<template>
  <section class="w-full min-h-full bg-neutral-900">
    <!-- Content -->
    <div class="p-6 space-y-4">
      <!-- Common fields for all nodes -->
      <div>
        <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
          LABEL
        </label>
        <input
          :value="node.label"
          @input="$emit('update-label', ($event.target as HTMLInputElement).value)"
          class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Enter node label..."
        />
      </div>
      
      <!-- Slot for node-specific fields -->
      <slot></slot>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { NodeEntity } from '@abuddy/api';

defineProps<{
  node: NodeEntity;
}>();

defineEmits<{
  'update-label': [label: string]
  'update-config': [config: Record<string, any>]
}>();
</script>
