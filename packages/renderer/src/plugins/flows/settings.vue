<template>
  <div class="max-w-3xl">
    <!-- Root Flow Selection Section -->
    <CollapsibleSection label="Root Flow" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Select which flow should be the root flow for dialog execution
      </p>
      
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-neutral-300 min-w-[120px]">
            Root Flow:
          </label>
          <select
            v-model="selectedRootFlowId"
            @change="handleRootFlowChange"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
          >
            <option value="">None</option>
            <option 
              v-for="flow in flows" 
              :key="flow.id"
              :value="flow.id"
            >
              {{ flow.label || flow.id }}
            </option>
          </select>
        </div>
        
        <div v-if="currentRootFlow" class="mt-4 p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-neutral-400">Current root flow:</span>
            <span class="text-white font-medium">{{ currentRootFlow.label || currentRootFlow.id }}</span>
          </div>
          <div v-if="currentRootFlow.description" class="mt-2 text-xs text-neutral-500">
            {{ currentRootFlow.description }}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import type { FlowEntity, FlowsSettings } from '@app/api'

interface Props {
  settings?: FlowsSettings
  flows?: Partial<FlowEntity>[]
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined,
  flows: () => []
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

// State
const selectedRootFlowId = ref<string>(props.settings?.rootFlowId || '')

// Computed
const currentRootFlow = computed(() => {
  if (!selectedRootFlowId.value) return null
  return props.flows.find(f => f.id === selectedRootFlowId.value)
})

// Watch for settings changes from backend
watch(() => props.settings?.rootFlowId, (newValue) => {
  if (newValue !== undefined) {
    selectedRootFlowId.value = newValue || ''
  }
})

// Methods
const handleRootFlowChange = () => {
  emit('update-setting', {
    path: ['rootFlowId'],
    value: selectedRootFlowId.value || undefined
  })
}
</script>