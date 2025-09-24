<template>
  <section class="w-full min-h-full border-l border-neutral-800 bg-neutral-900">
    <!-- Header with node type and close button -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
      <h2 class="text-sm font-semibold text-neutral-100 uppercase">
        {{ node.nodeType }}
      </h2>
      <button
        @click="$emit('close')"
        class="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        aria-label="Close form"
      >
        <X :size="18" />
      </button>
    </div>
    
    <!-- Content -->
    <div class="p-6 space-y-4">
      <!-- Common fields for all nodes -->
      <div>
        <label class="block mb-2 text-xs font-medium tracking-wider uppercase text-neutral-400">
          LABEL
        </label>
        <input
          :value="node.label"
          @input="$emit('update-node', { label: ($event.target as HTMLInputElement).value })"
          data-onboarding-id="flow-node-label-input"
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
import { X } from 'lucide-vue-next'

// Accept partial node data since forms now compute their own nodeData
defineProps<{
  node: {
    id: string
    nodeType: string
    label: string
  }
}>()

defineEmits<{
  'update-node': [updates: Record<string, any>]
  'update-config': [config: Record<string, any>]
  'close': []
}>()
</script>
