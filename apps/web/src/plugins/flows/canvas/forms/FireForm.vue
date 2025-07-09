<template>
  <BaseForm 
    v-if="node"
    :node="nodeData"
    @update-label="updateLabel"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        EVENT TAG
      </label>
      <input
        :value="eventType"
        @input="updateEventType(($event.target as HTMLInputElement).value)"
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
        :value="scope"
        @change="updateScope(($event.target as HTMLSelectElement).value)"
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
import type { EARS } from '@abuddy/api'
import BaseForm from './BaseForm.vue'
import { useNodeForm } from '../../composables/use-node-viewmodel'
import type { FireNodeView } from '../../types/view-models'

const props = defineProps<{
  nodeId: EARS.EntityId
}>()

// Single source of truth - no dual updates
const { node, extension, updateNode, updateLabel } = useNodeForm(props.nodeId)

// Type-safe extension access
const fireExtension = computed(() => 
  extension.value?.type === 'fire' ? extension.value as FireNodeView : null
)

// Compatible node data for BaseForm
const nodeData = computed(() => ({
  id: props.nodeId,
  nodeType: node.value?.nodeType || 'fire',
  label: node.value?.label || ''
}))

// Computed properties for form fields
const eventType = computed(() => fireExtension.value?.eventType || '')
const scope = computed(() => fireExtension.value?.scope || 'local')

// Computed payload string with proper JSON formatting
const payloadStr = computed(() => {
  const payload = fireExtension.value?.payload
  if (!payload) return ''
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return ''
  }
})

// Update handlers - no emits needed
const updateEventType = (value: string) => {
  updateNode({ eventType: value })
}

const updatePayload = (value: string) => {
  try {
    const payload = value.trim() ? JSON.parse(value) : undefined
    updateNode({ payload })
  } catch {
    // Invalid JSON - don't update
    // Could show error state here if needed
  }
}

const updateScope = (value: string) => {
  updateNode({ scope: value as 'local' | 'global' })
}
</script>
