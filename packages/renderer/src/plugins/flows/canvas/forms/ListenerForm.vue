<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="handleUpdate"
    @close="$emit('close')"
  >
    <div>
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        SCOPE
      </label>
      <div class="flex rounded-lg border border-neutral-700 overflow-hidden">
        <button
          v-for="option in scopeOptions"
          :key="option.value"
          @click="handleScopeChange(option.value)"
          :class="[
            'flex-1 px-3 py-2 text-xs font-medium transition-all duration-200',
            nodeData.scope === option.value
              ? 'bg-neutral-300/20 text-neutral-300 border-neutral-500/30'
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'
          ]"
          type="button"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
    <div v-if="nodeData.scope !== 'entry'">
      <label class="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
        EVENT TAG
      </label>
      <input
        :value="nodeData.eventType || ''"
        @input="$emit('update-node', { eventType: ($event.target as HTMLInputElement).value })"
        @keydown.enter="$emit('close')"
        class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div v-if="nodeData.scope !== 'entry'">
      <div class="flex items-center gap-2 mb-2">
        <input
          :id="`debounce-checkbox-${node.id}`"
          type="checkbox"
          :checked="hasDebounce"
          @change="handleDebounceToggle"
          class="w-4 h-4 text-blue-500 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2 focus:ring-offset-0 focus:ring-offset-neutral-900"
        />
        <label
          :for="`debounce-checkbox-${node.id}`"
          class="text-xs font-medium uppercase tracking-wider text-neutral-400 cursor-pointer"
        >
          Enable Debounce
        </label>
      </div>
      <div v-if="hasDebounce" class="ml-6">
        <input
          :value="nodeData.debounceMs || ''"
          @input="$emit('update-node', { debounceMs: parseInt(($event.target as HTMLInputElement).value) || 0 })"
          type="number"
          placeholder="Milliseconds"
          class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
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

// Type assertion for listen node properties
const nodeData = computed(() => props.node as any)

const scopeOptions = [
  { value: 'global', label: 'Global' },
  { value: 'local', label: 'Local' },
  { value: 'entry', label: 'Entry' }
]

const hasDebounce = computed(() =>
  nodeData.value.debounceMs !== undefined && nodeData.value.debounceMs !== null && nodeData.value.debounceMs !== 0
)

const handleScopeChange = (scope: string) => {
  const updates: Record<string, any> = { scope }

  // Automatically set eventType to 'flow.entry' when scope is 'entry'
  if (scope === 'entry') {
    updates.eventType = 'flow.entry'
  }

  emit('update-node', updates)
}

const handleDebounceToggle = (event: Event) => {
  const isChecked = (event.target as HTMLInputElement).checked
  if (isChecked) {
    // Set a default debounce value when enabling
    emit('update-node', { debounceMs: 500 })
  } else {
    // Clear debounce when disabling
    emit('update-node', { debounceMs: undefined })
  }
}

const handleUpdate = (updates: Record<string, any>) => {
  // Ensure eventType stays as 'flow.entry' when scope is 'entry'
  if (nodeData.value.scope === 'entry' && updates.eventType !== undefined) {
    updates.eventType = 'flow.entry'
  }
  emit('update-node', updates)
}
</script>