<template>
  <BaseForm
    v-if="node"
    :node="node"
    @update-node="$emit('update-node', $event)"
    @close="$emit('close')"
  >
    <div class="space-y-6">
      <!-- Event Type -->
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          EVENT TYPE
        </label>
        <input
          :value="nodeData.eventType || ''"
          @input="$emit('update-node', { eventType: ($event.target as HTMLInputElement).value })"
          placeholder="user.message"
          class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
        />
      </div>

      <!-- Scope -->
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          SCOPE
        </label>
        <div class="flex rounded-lg border border-neutral-700 overflow-hidden">
          <button
            v-for="option in scopeOptions"
            :key="option.value"
            @click="handleScopeChange(option.value)"
            :class="[
              'flex-1 px-3 py-2 text-xs font-medium transition-all duration-200',
              (nodeData.scope || 'local') === option.value
                ? 'bg-neutral-300/20 text-neutral-300 border-neutral-500/30'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300'
            ]"
            type="button"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="mt-3 text-xs text-neutral-600">
          <span v-if="(nodeData.scope || 'local') === 'local'">
            Local events target the current flow instance only
          </span>
          <span v-else>
            Global events broadcast to all active flow instances
          </span>
        </p>
      </div>

      <!-- Available Context Info -->
      <AvailableContext />

      <!-- Payload Field Mapping -->
      <div class="pt-6 border-t border-neutral-800">
        <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
          Payload Mapping
        </label>
        <div class="border rounded-md bg-neutral-800/30 border-neutral-700">
          <div class="p-4">
            <label class="flex items-baseline gap-1 mb-2 text-sm font-medium text-neutral-400">
              payload
              <span class="text-xs text-neutral-600">(any)</span>
            </label>
            <input
              :value="getPayloadMapping()"
              type="text"
              placeholder="e.g. $.event.data.message or $.lastStep.result"
              class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              @input="updatePayloadMapping(($event.target as HTMLInputElement).value)"
            />
            <p class="mt-1.5 text-xs text-neutral-600">
              Map data from execution context to send as event payload
            </p>
          </div>
          <TipSection :example-categories="tipExamples" />
        </div>
      </div>
    </div>
  </BaseForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NodeEntity } from '@app/api'
import BaseForm from './BaseForm.vue'
import AvailableContext from '../components/AvailableContext.vue'
import TipSection from '../components/TipSection.vue'

const props = defineProps<{
  node: NodeEntity
}>()

const emit = defineEmits<{
  'update-node': [updates: Record<string, any>]
  'close': []
}>()

// Type assertion for fire node properties
const nodeData = computed(() => props.node as any)

// Scope options
const scopeOptions = [
  { value: 'local', label: 'Local' },
  { value: 'global', label: 'Global' }
]

// Tip examples configuration
const tipExamples = [
  {
    label: 'JSONPath Expressions',
    examples: [
      '$.event.data.payload', '$.lastStep.result', '$.steps[1].result',
      '$.steps[label=First Step].result',
      '$.context.*', '$.variables.myVar'
    ]
  },
  {
    label: 'Literal Values',
    examples: ['"hello"', '123', 'true', '{"key": "value"}']
  }
]

// Field mappings
const fieldMappings = computed(() => {
  const mappings = (props.node as any).fieldMappings
  if (!mappings) return []
  return Array.isArray(mappings) ? mappings : [mappings]
})

// Payload mapping helpers
const getPayloadMapping = (): string => {
  const mapping = fieldMappings.value.find((m: any) => m.target === 'payload')
  return mapping?.source || ''
}

const updatePayloadMapping = (source: string) => {
  const currentMappings = fieldMappings.value.filter((m: any) => m.target !== 'payload')

  if (source.trim()) {
    currentMappings.push({ target: 'payload', source, default: undefined })
  }

  emit('update-node', { fieldMappings: currentMappings })
}

// Scope change handler
const handleScopeChange = (scope: string) => {
  emit('update-node', { scope })
}
</script>
