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
      <!-- Switch Plugin Hotkeys -->
      <div class="group">
        <div class="flex gap-4 max-w-3xl">
          <KeyboardShortcutInput
            v-model="builtInHotkeys.switchPluginUp"
            id="switch-plugin-up"
            label="Previous Plugin"
            @change="updateHotkeys"
            container-class="flex-1"
            :show-reset-button="false"
          />
          
          <KeyboardShortcutInput
            v-model="builtInHotkeys.switchPluginDown"
            id="switch-plugin-down"
            label="Next Plugin"
            @change="updateHotkeys"
            container-class="flex-1"
            :show-reset-button="false"
          />
        </div>
        
        <p class="mt-2 text-xs text-neutral-600">
          Navigate between plugins using keyboard shortcuts
        </p>
      </div>

      <!-- Toggle Inspection Panel -->
      <div class="group">
        <div class="flex gap-4 max-w-3xl">
          <KeyboardShortcutInput
            v-model="builtInHotkeys.toggleInspectionPanel"
            id="toggle-inspection"
            label="Toggle Inspection Panel"
            @change="updateHotkeys"
            container-class="flex-1"
            :show-reset-button="false"
          />
          <div class="flex-1"></div> <!-- Empty spacer to maintain consistent width -->
        </div>
        <p class="mt-2 text-xs text-neutral-600">
          Show or hide the inspection panel
        </p>
      </div>

      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>

      <!-- Custom Keyboard Shortcuts -->
      <div class="group">
        <h3 class="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-4">Custom Keyboard Shortcuts</h3>
        
        <!-- Custom hotkeys list -->
        <div v-if="customHotkeys.length > 0" class="space-y-3 mb-4">
          <div v-for="(hotkey, index) in customHotkeys" :key="hotkey.id" class="flex items-center gap-3">
            <!-- Event Name Input -->
            <input
              v-model="hotkey.eventName"
              type="text"
              placeholder="EVENT_NAME"
              class="flex-1 max-w-xs px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="() => debouncedSave(saveCustomHotkeys)"
            />
            
            <!-- Keyboard Shortcut Input -->
            <KeyboardShortcutInput
              v-model="hotkey.shortcut"
              @change="updateCustomHotkey(index)"
              container-class="flex-1"
              placeholder="Click to set shortcut"
              :show-reset-button="false"
            />
            
            <!-- Remove Button -->
            <button
              @click="removeCustomHotkey(index)"
              class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
              title="Remove shortcut"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <!-- Empty state -->
        <div v-else class="py-6 text-center bg-neutral-900/30 border border-dashed border-neutral-700/50 rounded-lg mb-4">
          <Keyboard class="w-8 h-8 mx-auto mb-2 text-neutral-600" />
          <p class="text-sm text-neutral-500">No custom shortcuts defined</p>
        </div>
        
        <!-- Add button -->
        <button
          @click="addCustomHotkey"
          class="w-full px-4 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 hover:text-white hover:border-neutral-600 transition-all flex items-center justify-center gap-2"
        >
          <Plus class="w-4 h-4" />
          Add Custom Shortcut
        </button>
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
import { ref, reactive } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { CheckCircle, Keyboard, X, Plus } from 'lucide-vue-next'
import KeyboardShortcutInput, { type KeyboardShortcut } from '@/core/components/design/KeyboardShortcutInput.vue'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let statusTimeout: NodeJS.Timeout | null = null

// Default hotkey values
const defaultHotkeys: Record<string, KeyboardShortcut> = {
  switchPluginUp: {
    key: 'ArrowUp',
    modifiers: ['cmd', 'option']
  },
  switchPluginDown: {
    key: 'ArrowDown',
    modifiers: ['cmd', 'option']
  },
  toggleInspectionPanel: {
    key: 'b',
    modifiers: ['cmd']
  }
}

// Store all built-in hotkeys in a reactive object
const builtInHotkeys = reactive<Record<string, KeyboardShortcut | null>>({
  switchPluginUp: { ...defaultHotkeys.switchPluginUp },
  switchPluginDown: { ...defaultHotkeys.switchPluginDown },
  toggleInspectionPanel: { ...defaultHotkeys.toggleInspectionPanel }
})

// Custom hotkeys state
interface CustomHotkeyItem {
  id: string
  eventName: string
  shortcut: KeyboardShortcut | null
}

const customHotkeys = ref<CustomHotkeyItem[]>([])

// Helper function to convert hotkey format
const convertToShortcut = (hotkey: any): KeyboardShortcut | null => {
  if (!hotkey) return null
  return {
    key: hotkey.key || '',
    modifiers: hotkey.modifiers || []
  }
}

// Helper function to convert shortcut back to backend format
const convertToBackend = (shortcut: KeyboardShortcut | null) => {
  if (!shortcut) return undefined
  return {
    key: shortcut.key,
    modifiers: shortcut.modifiers
  }
}

// Helper function to manage save status
const setSaveStatus = (status: 'saving' | 'saved') => {
  if (statusTimeout) {
    clearTimeout(statusTimeout)
  }
  
  saveStatus.value = status
  
  if (status === 'saved') {
    statusTimeout = setTimeout(() => {
      saveStatus.value = 'idle'
    }, 2000)
  }
}

// Debounce helper
const debouncedSave = (callback: Function, delay: number = 500) => {
  if (statusTimeout) clearTimeout(statusTimeout)
  statusTimeout = setTimeout(() => callback(), delay)
}

// Initialize from settings only once on mount
if (settings.value?.general?.hotkeys) {
  const hotkeys = settings.value.general.hotkeys
  
  // Update built-in hotkeys, preserving defaults when settings don't exist
  Object.keys(defaultHotkeys).forEach((key) => {
    builtInHotkeys[key] = convertToShortcut(hotkeys[key]) || { ...defaultHotkeys[key] }
  })
  
  // Initialize custom hotkeys
  if (hotkeys.custom) {
    customHotkeys.value = hotkeys.custom.map((h: any) => ({
      id: h.id,
      eventName: h.eventName || '',
      shortcut: convertToShortcut(h)
    }))
  }
}

// Update hotkeys in backend
const updateHotkeys = () => {
  setSaveStatus('saving')
  
  // Get current custom hotkeys
  const customData = customHotkeys.value.map(h => ({
    id: h.id,
    eventName: h.eventName,
    ...(h.shortcut ? convertToBackend(h.shortcut) : {})
  }))
  
  actor.send({ 
    type: 'SETTINGS.UPDATE',
    entityType: 'general',
    label: 'hotkeys',
    path: [],
    value: {
      switchPluginUp: convertToBackend(builtInHotkeys.switchPluginUp),
      switchPluginDown: convertToBackend(builtInHotkeys.switchPluginDown),
      toggleInspectionPanel: convertToBackend(builtInHotkeys.toggleInspectionPanel),
      custom: customData
    }
  })
  
  setSaveStatus('saved')
}

// Generate unique ID for new hotkeys
const generateId = () => {
  return `hotkey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Add new custom hotkey
const addCustomHotkey = () => {
  customHotkeys.value.push({
    id: generateId(),
    eventName: '',
    shortcut: null
  })
}

// Remove custom hotkey
const removeCustomHotkey = (index: number) => {
  customHotkeys.value.splice(index, 1)
  saveCustomHotkeys()
}

// Update custom hotkey shortcut
const updateCustomHotkey = (index: number) => {
  saveCustomHotkeys()
}

// Save custom hotkeys to backend
const saveCustomHotkeys = () => {
  setSaveStatus('saving')
  
  // Convert to backend format - save all entries, even incomplete ones
  const customData = customHotkeys.value.map(h => ({
    id: h.id,
    eventName: h.eventName,
    ...(h.shortcut ? convertToBackend(h.shortcut) : {})
  }))
  
  // Save all hotkeys together
  actor.send({ 
    type: 'SETTINGS.UPDATE',
    entityType: 'general',
    label: 'hotkeys',
    path: [],
    value: {
      switchPluginUp: convertToBackend(builtInHotkeys.switchPluginUp),
      switchPluginDown: convertToBackend(builtInHotkeys.switchPluginDown),
      toggleInspectionPanel: convertToBackend(builtInHotkeys.toggleInspectionPanel),
      custom: customData
    }
  })
  
  setSaveStatus('saved')
}
</script>


