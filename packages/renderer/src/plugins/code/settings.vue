<template>
  <div class="max-w-3xl">
    <!-- Directory Settings Section -->
    <CollapsibleSection label="Directory Settings" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Configure default directory preferences
      </p>
      <div class="space-y-4">
        <DirectorySelector
          v-model="defaultRootDirectory"
          label="Default Root Directory"
          placeholder="Use last opened directory"
          description="If set, the code editor will always open to this directory on startup instead of the last opened directory"
          @change="saveDirectorySettings"
          :show-reset-button="true"
          :truncate-start="true"
        />
      </div>
    </CollapsibleSection>

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
          <div class="flex gap-4">
            <KeyboardShortcutInput
              v-model="hotkeys.navigatePrevPanel"
              id="navigate-prev-panel"
              label="Previous Panel"
              @change="saveHotkeys"
              container-class="flex-1"
              :show-reset-button="false"
            />
            
            <KeyboardShortcutInput
              v-model="hotkeys.navigateNextPanel"
              id="navigate-next-panel"
              label="Next Panel"
              @change="saveHotkeys"
              container-class="flex-1"
              :show-reset-button="false"
            />
          </div>
          
          <p class="mt-2 text-xs text-neutral-600">
            Navigate between panels in the code view
          </p>
        </div>
      </div>
    </CollapsibleSection>

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import KeyboardShortcutInput from '@/core/components/design/KeyboardShortcutInput.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import DirectorySelector from '@/core/components/design/DirectorySelector.vue'
import type { CodeSettings } from '@app/api'

interface Props {
  settings?: CodeSettings
}

const props = withDefaults(defineProps<Props>(), {
  settings: undefined
})

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

// State - initialize directly from props with defaults
const hotkeys = reactive<CodeSettings['hotkeys']>({
  openTerminal: props.settings?.hotkeys?.openTerminal || null,
  navigatePrevPanel: props.settings?.hotkeys?.navigatePrevPanel || null,
  navigateNextPanel: props.settings?.hotkeys?.navigateNextPanel || null
})

const restoreTerminals = ref(props.settings?.restoreTerminals ?? true)
const defaultRootDirectory = ref(props.settings?.defaultRootDirectory || null)

// Save functions
const saveHotkeys = () => {
  // Simply send all hotkeys as-is
  emit('update-setting', {
    path: ['hotkeys'],
    value: hotkeys
  })
}

const saveTerminalSettings = () => {
  emit('update-setting', {
    path: ['restoreTerminals'],
    value: restoreTerminals.value
  })
}

const saveDirectorySettings = () => {
  emit('update-setting', {
    path: ['defaultRootDirectory'],
    value: defaultRootDirectory.value
  })
}
</script>