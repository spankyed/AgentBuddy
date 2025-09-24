<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        MODE
      </label>
      <select
        :value="nodeData.mode || 'entry'"
        @change="$emit('update-node', { mode: ($event.target as HTMLSelectElement).value })"
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
        :value="nodeData.eventType || ''"
        @input="$emit('update-node', { eventType: ($event.target as HTMLInputElement).value })"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div v-if="nodeData.mode === 'entry'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        DEBOUNCE (MS)
      </label>
      <input
        :value="nodeData.debounceMs || ''"
        @input="$emit('update-node', { debounceMs: parseInt(($event.target as HTMLInputElement).value) || 0 })"
        type="number"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div v-if="nodeData.mode === 'internal'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        SCOPE
      </label>
      <select
        :value="nodeData.scope || 'local'"
        @change="$emit('update-node', { scope: ($event.target as HTMLSelectElement).value })"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="local">Local</option>
        <option value="global">Global</option>
      </select>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeEntity } from '@app/api'
import BaseForm from './BaseForm.vue'

const props = defineProps<{
  node: NodeEntity
}>()

defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

// Type assertion for listen node properties
const nodeData = computed(() => props.node as any)
</script>
