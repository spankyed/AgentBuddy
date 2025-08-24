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

        <!-- Brain Restart Notice -->
        <div v-if="needsRestart && currentRootFlow" class="mt-6 p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
          <div class="flex items-start gap-3">
            <AlertTriangle class="w-5 h-5 text-amber-500 mt-0.5" />
            <div class="flex-1">
              <h4 class="text-sm font-medium text-amber-400 mb-1">
                Root flow changed - Brain restart required
              </h4>
              <p class="text-sm text-neutral-400 mb-3">
                The root flow has been updated. Please restart the application from Brain settings to apply the changes.
              </p>
              <button 
                @click="goToBrainSettings"
                class="px-3 py-1.5 bg-amber-600/20 text-amber-400 border border-amber-600/30 rounded-lg hover:bg-amber-600/30 hover:border-amber-600/50 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Brain class="w-4 h-4" />
                Go to Brain Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { AlertTriangle, Brain } from 'lucide-vue-next'
import type { FlowsSettings } from '@app/api'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type FlowsState } from './state'

interface Props {
  settings?: FlowsSettings
  allSettings?: any
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined,
  allSettings: undefined
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

// State
const selectedRootFlowId = ref<string>(props.settings?.rootFlowId || '')

// Get flows list from flows plugin state for flows settings
const flowsActor: FlowsState = applicationState.system.get(id)
const flows = useSelector(flowsActor, (state) => state.context.flows || [])

// Get settings actor for navigation only
const settingsActor = applicationState.system.get('settings')

// Check if restart is needed by comparing root flow IDs
const needsRestart = computed(() => {
  const flowsRootId = props.allSettings?.plugins?.flows?.rootFlowId
  const brainRunningId = props.allSettings?.plugins?.brain?.runningRootFlowId
  
  // Need restart if:
  // 1. Brain is running (not dead/undefined) AND
  // 2. Flows has a root ID AND
  // 3. It's different from what's running
  return brainRunningId !== undefined && flowsRootId && flowsRootId !== brainRunningId
})

const currentRootFlow = computed(() => {
  if (!selectedRootFlowId.value) return null
  return flows.value.find(f => f.id === selectedRootFlowId.value)
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

const goToBrainSettings = () => {
  // Navigate to brain settings
  settingsActor.send({ type: 'PLUGIN.SELECT', pluginId: 'brain' })
}
</script>