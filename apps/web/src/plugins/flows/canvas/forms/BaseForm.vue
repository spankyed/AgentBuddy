<template>
  <section class="w-full min-h-full border-l border-neutral-800 bg-neutral-900">
    <!-- Content -->
    <div class="p-6 space-y-4">
      <!-- Common fields for all nodes -->
      <div>
        <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
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
// Accept partial node data since forms now compute their own nodeData
defineProps<{
  node: {
    id: string
    nodeType: string
    label: string
  }
}>()

defineEmits<{
  'update-label': [label: string]
  'update-config': [config: Record<string, any>]
}>()
</script>
