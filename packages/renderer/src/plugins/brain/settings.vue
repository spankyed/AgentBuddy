<template>
  <div class="max-w-3xl">
    <!-- Brain Status Section -->
    <CollapsibleSection label="Brain Status" :default-open="true" class="mb-8">
      <div class="space-y-4">
        <!-- Combined Status and Restart Section -->
        <div v-if="needsRestart" class="p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
          <div class="flex items-start gap-3 mb-4">
            <AlertTriangle class="w-5 h-5 text-amber-500 mt-0.5" />
            <div class="flex-1">
              <h4 class="text-sm font-medium text-amber-400 mb-1">
                Root Flow Changed
              </h4>
              <p class="text-sm text-neutral-400">
                Restart the brain to apply the changes and ensure the brain system utilizes the latest flow configuration.
              </p>
            </div>
          </div>
          
          <div class="mt-4 pt-4 border-t border-amber-700/30">
            <div class="flex gap-2">
              <button 
                @click="handleRestart"
                class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <RefreshCw class="w-4 h-4" />
                Restart Brain
              </button>
              <button 
                @click="handleKill"
                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <Power class="w-4 h-4" />
                Kill Brain
              </button>
            </div>
          </div>
        </div>

        <div v-else class="p-4 bg-neutral-900/50 rounded-lg border border-neutral-700/50">
          <p class="text-sm text-neutral-400 mb-3 pb-3 border-b border-neutral-700/30">
            Restart ends everything and starts fresh. Kill just stops what's currently running.
          </p>
          <div class="flex gap-2">
            <button 
              @click="handleRestart"
              class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <RefreshCw class="w-4 h-4" />
              Restart Brain
            </button>
            <button 
              @click="handleKill"
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Power class="w-4 h-4" />
              Kill Brain
            </button>
          </div>
        </div>
      </div>
    </CollapsibleSection>

    <!-- Debug Mode Section -->
    <CollapsibleSection label="Debug Mode" :default-open="false" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Enable debug mode to see detailed brain execution information
      </p>
      
      <div class="flex items-center gap-3">
        <label class="text-sm font-medium text-neutral-300 min-w-[120px]">
          Debug Mode:
        </label>
        <button
          @click="toggleDebug"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            debugEnabled 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 border border-neutral-700/50'
          ]"
        >
          {{ debugEnabled ? 'Enabled' : 'Disabled' }}
        </button>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { RefreshCw, AlertTriangle, Power } from 'lucide-vue-next'
import type { BrainSettings } from '@app/api'
import { trpc } from '@/core/trpc'

interface Props {
  settings?: BrainSettings
  allSettings?: any
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined,
  allSettings: undefined
})

// Compute if restart is needed by comparing root flow IDs
const needsRestart = computed(() => {
  const flowsRootId = props.allSettings?.plugins?.flows?.rootFlowId
  const brainRunningId = props.allSettings?.plugins?.brain?.runningRootFlowId
  
  // Need restart if flows has a root ID and it's different from what's running
  return flowsRootId && flowsRootId !== brainRunningId
})

// State
const debugEnabled = ref<boolean>(false)

// Methods
const handleRestart = () => {
  // Send restart event to backend brain system
  trpc.bus.send.mutate({
    systemId: 'brain',
    type: 'RESTART_BRAIN'
  })
}

const handleKill = () => {
  // Send kill event to backend brain system
  trpc.bus.send.mutate({
    systemId: 'brain',
    type: 'KILL_BRAIN'
  })
}

const toggleDebug = () => {
  debugEnabled.value = !debugEnabled.value
  // Send toggle debug event to backend
  trpc.bus.send.mutate({
    systemId: 'brain',
    type: 'TOGGLE_DEBUG'
  })
}

// Check debug status on mount
onMounted(async () => {
  // You could query the backend for current debug status here if needed
})
</script>