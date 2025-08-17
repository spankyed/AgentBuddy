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
        <div class="flex items-center gap-3 max-w-md">
          <div class="relative flex-1">
            <input
              id="switch-plugin-shortcut"
              type="text"
              :value="isRecording ? 'Press shortcut keys...' : currentShortcut"
              @focus="startRecording"
              @blur="stopRecording"
              @keydown.prevent="recordKeyPress"
              readonly
              :class="[
                'w-full px-3 py-2 bg-neutral-800 border rounded-lg text-sm font-mono cursor-pointer transition-all',
                isRecording 
                  ? 'border-blue-500/50 ring-2 ring-blue-500/20 text-blue-400 placeholder-blue-400' 
                  : 'border-neutral-700/50 text-white hover:border-neutral-600'
              ]"
              :placeholder="isRecording ? 'Press shortcut keys...' : 'Click to set shortcut'"
            />
            <Keyboard v-if="!isRecording" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
          </div>
          <button
            v-if="currentShortcut && currentShortcut !== 'Not set'"
            @click="clearShortcut"
            class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
            title="Clear shortcut"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
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
import { ref, computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { CheckCircle, Keyboard, X } from 'lucide-vue-next'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const isRecording = ref(false)
const recordedKeys = ref<Set<string>>(new Set())
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let statusTimeout: NodeJS.Timeout | null = null

// Store the current shortcut
const shortcutData = ref({
  modifiers: [] as string[],
  key: ''
})

// Initialize from settings
watch(settings, (newSettings) => {
  if (newSettings?.general?.hotkeys?.switchPlugin) {
    const hotkey = newSettings.general.hotkeys.switchPlugin
    shortcutData.value = {
      key: hotkey.key || '',
      modifiers: hotkey.modifiers || []
    }
  }
}, { immediate: true })

// Format shortcut for display
const currentShortcut = computed(() => {
  if (!shortcutData.value.key) return 'Not set'
  
  const parts = []
  if (shortcutData.value.modifiers.includes('cmd')) parts.push('⌘')
  if (shortcutData.value.modifiers.includes('ctrl')) parts.push('⌃')
  if (shortcutData.value.modifiers.includes('option')) parts.push('⌥')
  if (shortcutData.value.modifiers.includes('shift')) parts.push('⇧')
  
  // Format the key
  const keyDisplay = formatKey(shortcutData.value.key)
  if (keyDisplay) parts.push(keyDisplay)
  
  return parts.length > 0 ? parts.join(' ') : 'Not set'
})

// Format key for display
const formatKey = (key: string): string => {
  const keyMap: Record<string, string> = {
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'Enter': '⏎',
    'Tab': '⇥',
    ' ': 'Space',
    'Escape': 'Esc',
    'Backspace': '⌫',
    'Delete': '⌦',
  }
  return keyMap[key] || key.toUpperCase()
}

// Start recording when input is focused
const startRecording = () => {
  isRecording.value = true
  recordedKeys.value.clear()
}

// Stop recording when input loses focus
const stopRecording = () => {
  setTimeout(() => {
    isRecording.value = false
    recordedKeys.value.clear()
  }, 100)
}

// Record key press
const recordKeyPress = (event: KeyboardEvent) => {
  if (!isRecording.value) return
  
  const modifiers: string[] = []
  if (event.metaKey) modifiers.push('cmd')
  if (event.ctrlKey && !event.metaKey) modifiers.push('ctrl')
  if (event.altKey) modifiers.push('option')
  if (event.shiftKey) modifiers.push('shift')
  
  // Don't record modifier keys alone
  const isModifierKey = ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)
  if (isModifierKey) return
  
  // Update shortcut data
  shortcutData.value = {
    modifiers,
    key: event.key
  }
  
  // Save the shortcut
  updateHotkey()
  
  // Stop recording
  isRecording.value = false
  ;(event.target as HTMLElement).blur()
}

// Clear shortcut
const clearShortcut = () => {
  shortcutData.value = {
    modifiers: [],
    key: ''
  }
  updateHotkey()
}

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
      switchPlugin: {
        key: shortcutData.value.key,
        modifiers: shortcutData.value.modifiers
      }
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


