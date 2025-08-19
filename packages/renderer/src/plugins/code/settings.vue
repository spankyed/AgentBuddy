<template>
  <div class="max-w-3xl">
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

// Save function
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
</script>