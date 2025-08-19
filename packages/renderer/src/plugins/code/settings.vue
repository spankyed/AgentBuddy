<template>
  <div class="max-w-3xl">
    <!-- Terminal Settings Section -->
    <CollapsibleSection label="Terminal Settings" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Configure terminal behavior and preferences
      </p>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <label for="restore-terminals" class="text-sm font-medium text-neutral-200">
              Restore terminals on startup
            </label>
            <p class="mt-1 text-xs text-neutral-600">
              Automatically restore previously opened terminals when the application starts
            </p>
          </div>
          <input
            id="restore-terminals"
            v-model="restoreTerminals"
            type="checkbox"
            @change="saveTerminalSettings"
            class="w-4 h-4 text-blue-600 bg-neutral-800 border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
          />
        </div>
      </div>
    </CollapsibleSection>

    <!-- Code Hotkeys Section -->
    <CollapsibleSection label="Code Hotkeys" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Keyboard shortcuts available when the code plugin is active
      </p>
      <div class="space-y-6">
        <div class="group">
          <KeyboardShortcutInput
            v-model="hotkeys.openTerminal"
            id="open-terminal"
            label="Open Terminal"
            @change="saveHotkeys"
            container-class="flex-1"
            :show-reset-button="true"
          />
          <p class="mt-1.5 text-xs text-neutral-600">
            Open a new terminal in the current working directory
          </p>
        </div>

        <div class="group">
          <KeyboardShortcutInput
            v-model="hotkeys.navigatePrevPanel"
            id="navigate-prev-panel"
            label="Previous Panel"
            @change="saveHotkeys"
            container-class="flex-1"
            :show-reset-button="true"
          />
          <p class="mt-1.5 text-xs text-neutral-600">
            Navigate to the previous panel in the code view
          </p>
        </div>

        <div class="group">
          <KeyboardShortcutInput
            v-model="hotkeys.navigateNextPanel"
            id="navigate-next-panel"
            label="Next Panel"
            @change="saveHotkeys"
            container-class="flex-1"
            :show-reset-button="true"
          />
          <p class="mt-1.5 text-xs text-neutral-600">
            Navigate to the next panel in the code view
          </p>
        </div>
      </div>
    </CollapsibleSection>

    <!-- Save Status Indicator -->
    <div class="mt-6 flex items-center gap-2">
      <div v-if="saveStatus === 'saving'" class="flex items-center gap-2 text-xs text-neutral-500">
        <div class="w-1 h-1 bg-neutral-500 rounded-full animate-pulse"></div>
        Saving...
      </div>
      <div v-else-if="saveStatus === 'saved'" class="flex items-center gap-2 text-xs text-green-600">
        <CheckCircle class="w-3 h-3" />
        Settings saved
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { CheckCircle } from 'lucide-vue-next'
import KeyboardShortcutInput from '@/core/components/design/KeyboardShortcutInput.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import type { CodeSettings } from '@app/api'

const settingsActor = applicationState.system.get('settings')
const settings = useSelector(settingsActor, (state: any) => state.context.settings)

// State
const hotkeys = reactive<CodeSettings['hotkeys']>({
  openTerminal: null,
  navigatePrevPanel: null,
  navigateNextPanel: null
})
const restoreTerminals = ref(true)
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimeout: NodeJS.Timeout | null = null

// Initialize from settings
onMounted(() => {
  if (settings.value?.plugins?.code) {
    const codeSettings = settings.value.plugins.code
    
    // Load all hotkeys generically
    if (codeSettings.hotkeys) {
      Object.assign(hotkeys, codeSettings.hotkeys)
    }
    
    // Load terminal settings
    if (codeSettings.restoreTerminals !== undefined) {
      restoreTerminals.value = codeSettings.restoreTerminals
    }
  }
})

// Helper to show save status
const setSaveStatus = (status: 'saving' | 'saved') => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  saveStatus.value = status
  
  if (status === 'saved') {
    saveTimeout = setTimeout(() => {
      saveStatus.value = 'idle'
    }, 2000)
  }
}

// Save functions
const saveHotkeys = () => {
  setSaveStatus('saving')
  
  // Simply send all hotkeys as-is
  settingsActor.send({
    type: 'SETTINGS.UPDATE',
    entityType: 'plugin',
    label: 'code',
    path: ['hotkeys'],
    value: hotkeys
  })
  
  setSaveStatus('saved')
}

const saveTerminalSettings = () => {
  setSaveStatus('saving')
  
  settingsActor.send({
    type: 'SETTINGS.UPDATE',
    entityType: 'plugin',
    label: 'code',
    path: ['restoreTerminals'],
    value: restoreTerminals.value
  })
  
  setSaveStatus('saved')
}
</script>