<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">Keyboard Shortcuts</h2>
      <p class="text-sm text-neutral-500">
        Configure keyboard shortcuts for common actions in the application.
      </p>
    </div>

    <!-- Form Fields -->
    <div class="space-y-6">
      <!-- Switch Plugin Shortcut -->
      <div class="group">
        <label for="switch-plugin-shortcut" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Switch Plugin
        </label>
        <KeyboardShortcutInput
          v-model="shortcutData"
          id="switch-plugin-shortcut"
          @change="updateHotkey"
          container-class="max-w-md"
        />
        <p class="mt-1.5 text-xs text-neutral-600">
          Navigate between plugins using keyboard shortcuts
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- Coming Soon -->
      <div class="group">
        <div class="py-8 text-center bg-neutral-900/30 border border-dashed border-neutral-700/50 rounded-lg">
          <Keyboard class="w-10 h-10 mx-auto mb-3 text-neutral-600" />
          <p class="text-sm text-neutral-500">More keyboard shortcuts coming soon</p>
        </div>
      </div>
    </div>

    <!-- Autosave indicator -->
    <div class="mt-6 flex items-center gap-2">
      <div v-if="saveStatus === 'saving'" class="flex items-center gap-2 text-xs text-neutral-500">
        <div class="w-1 h-1 bg-neutral-500 rounded-full animate-pulse"></div>
        Saving...
      </div>
      <div v-else-if="saveStatus === 'saved'" class="flex items-center gap-2 text-xs text-green-600">
        <CheckCircle class="w-3 h-3" />
        Shortcuts updated
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { CheckCircle, Keyboard } from 'lucide-vue-next'
import KeyboardShortcutInput, { type KeyboardShortcut } from '@/core/components/design/KeyboardShortcutInput.vue'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let statusTimeout: NodeJS.Timeout | null = null

// Store the current shortcut
const shortcutData = ref<KeyboardShortcut | null>(null)

// Initialize from settings
watch(settings, (newSettings) => {
  if (newSettings?.general?.hotkeys?.switchPlugin) {
    const hotkey = newSettings.general.hotkeys.switchPlugin
    shortcutData.value = {
      key: hotkey.key || '',
      modifiers: hotkey.modifiers || []
    }
  } else {
    shortcutData.value = null
  }
}, { immediate: true })

// Update hotkey in backend
const updateHotkey = () => {
  // Clear existing timeout
  if (statusTimeout) {
    clearTimeout(statusTimeout)
  }
  
  // Show saving status
  saveStatus.value = 'saving'
  
  // Send update
  actor.send({ 
    type: 'HOTKEYS.UPDATE', 
    data: {
      switchPlugin: shortcutData.value ? {
        key: shortcutData.value.key,
        modifiers: shortcutData.value.modifiers
      } : null
    }
  })
  
  // Show saved status
  saveStatus.value = 'saved'
  
  // Hide status after 2 seconds
  statusTimeout = setTimeout(() => {
    saveStatus.value = 'idle'
  }, 2000)
}
</script>


