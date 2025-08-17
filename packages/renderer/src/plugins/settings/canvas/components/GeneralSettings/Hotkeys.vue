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
        <label class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
          Switch Plugin
        </label>
        <div class="space-y-3">
          <div class="flex flex-wrap gap-2 max-w-md">
            <label class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 bg-neutral-900/50 border border-neutral-700/50 hover:border-neutral-600 cursor-pointer transition-all">
              <input
                type="checkbox"
                v-model="modifiers.cmd"
                @change="updateHotkey"
                class="rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
              <span>⌘ Cmd</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 bg-neutral-900/50 border border-neutral-700/50 hover:border-neutral-600 cursor-pointer transition-all">
              <input
                type="checkbox"
                v-model="modifiers.option"
                @change="updateHotkey"
                class="rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
              <span>⌥ Option</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 bg-neutral-900/50 border border-neutral-700/50 hover:border-neutral-600 cursor-pointer transition-all">
              <input
                type="checkbox"
                v-model="modifiers.shift"
                @change="updateHotkey"
                class="rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
              <span>⇧ Shift</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 bg-neutral-900/50 border border-neutral-700/50 hover:border-neutral-600 cursor-pointer transition-all">
              <input
                type="checkbox"
                v-model="modifiers.ctrl"
                @change="updateHotkey"
                class="rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
              <span>⌃ Ctrl</span>
            </label>
          </div>
          <div class="flex items-center gap-2 max-w-md">
            <span class="text-neutral-500">+</span>
            <select v-model="selectedKey" @change="updateHotkey" class="px-4 py-2.5 bg-neutral-900/50 border border-neutral-700/50 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all">
              <option value="arrows">← → Arrow Keys</option>
              <option value="tab">Tab</option>
              <option value="space">Space</option>
              <option value="enter">Enter</option>
              <option value="1-9">Number Keys (1-9)</option>
            </select>
          </div>
          <div class="mt-3">
            <p class="text-xs text-neutral-600">
              Current shortcut: <code class="px-2 py-1 bg-blue-500/10 text-blue-400 rounded font-mono text-xs">{{ currentShortcut }}</code>
            </p>
            <p class="mt-1.5 text-xs text-neutral-600">
              Navigate between plugins using keyboard shortcuts
            </p>
          </div>
        </div>
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
import { CheckCircle, Keyboard } from 'lucide-vue-next'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const modifiers = ref({
  cmd: true,
  option: true,
  shift: false,
  ctrl: false,
})

const selectedKey = ref('arrows')
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let statusTimeout: NodeJS.Timeout | null = null

// Initialize from settings
watch(settings, (newSettings) => {
  if (newSettings?.general?.hotkeys?.switchPlugin) {
    const hotkey = newSettings.general.hotkeys.switchPlugin
    selectedKey.value = hotkey.key || 'arrows'
    
    // Parse modifiers
    const mods = hotkey.modifiers || []
    modifiers.value = {
      cmd: mods.includes('cmd'),
      option: mods.includes('option'),
      shift: mods.includes('shift'),
      ctrl: mods.includes('ctrl'),
    }
  }
}, { immediate: true })

const currentShortcut = computed(() => {
  const parts = []
  if (modifiers.value.cmd) parts.push('⌘')
  if (modifiers.value.option) parts.push('⌥')
  if (modifiers.value.shift) parts.push('⇧')
  if (modifiers.value.ctrl) parts.push('⌃')
  
  const keyDisplay = {
    'arrows': '← →',
    'tab': 'Tab',
    'space': 'Space',
    'enter': 'Enter',
    '1-9': '1-9',
  }[selectedKey.value] || selectedKey.value
  
  parts.push(keyDisplay)
  return parts.join(' + ')
})

const updateHotkey = () => {
  // Clear existing timeout
  if (statusTimeout) {
    clearTimeout(statusTimeout)
  }
  
  // Show saving status
  saveStatus.value = 'saving'
  
  // Get active modifiers
  const activeModifiers = Object.entries(modifiers.value)
    .filter(([_, active]) => active)
    .map(([mod]) => mod)
  
  // Send update immediately for hotkeys (no debounce needed)
  actor.send({ 
    type: 'HOTKEYS.UPDATE', 
    data: {
      switchPlugin: {
        key: selectedKey.value,
        modifiers: activeModifiers
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


