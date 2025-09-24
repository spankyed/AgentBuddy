<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        EVENT TAG
      </label>
      <input
        :value="nodeData.eventType || ''"
        @input="$emit('update-node', { eventType: ($event.target as HTMLInputElement).value })"
        placeholder="#THREAD.CREATE"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        PAYLOAD (JSON)
      </label>
      <textarea
        :value="payloadStr"
        @input="updatePayload(($event.target as HTMLTextAreaElement).value)"
        rows="4"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
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

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

// Computed payload string with proper JSON formatting
const payloadStr = computed(() => {
  const payload = (props.node as any).payload
  if (!payload) return ''
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return ''
  }
})

// Type assertion for fire node properties
const nodeData = computed(() => props.node as any)

const updatePayload = (value: string) => {
  try {
    const payload = value.trim() ? JSON.parse(value) : undefined
    emit('update-node', { payload })
  } catch {
    // Invalid JSON - don't update
  }
}
</script>
