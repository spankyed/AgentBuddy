<template>
  <div class="max-w-xl">
    <h2 class="text-xl font-semibold text-white mb-2">Keyboard Shortcuts</h2>
    <p class="text-sm text-neutral-400 mb-6">
      Configure keyboard shortcuts for common actions in the application.
    </p>

    <div class="p-4 bg-neutral-800 border border-neutral-700 rounded-lg mb-4">
      <div class="mb-3">
        <h3 class="text-base font-medium text-white">Switch Plugin</h3>
        <p class="text-sm text-neutral-400">Navigate between plugins using keyboard shortcuts</p>
      </div>
      <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <label class="flex items-center gap-2 px-2 py-1 rounded text-sm text-neutral-300 hover:bg-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              v-model="modifiers.cmd"
              @change="updateHotkey"
              class="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
            />
            <span>⌘ Cmd</span>
          </label>
          <label class="flex items-center gap-2 px-2 py-1 rounded text-sm text-neutral-300 hover:bg-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              v-model="modifiers.option"
              @change="updateHotkey"
              class="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
            />
            <span>⌥ Option</span>
          </label>
          <label class="flex items-center gap-2 px-2 py-1 rounded text-sm text-neutral-300 hover:bg-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              v-model="modifiers.shift"
              @change="updateHotkey"
              class="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
            />
            <span>⇧ Shift</span>
          </label>
          <label class="flex items-center gap-2 px-2 py-1 rounded text-sm text-neutral-300 hover:bg-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              v-model="modifiers.ctrl"
              @change="updateHotkey"
              class="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
            />
            <span>⌃ Ctrl</span>
          </label>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-neutral-500">+</span>
          <select v-model="selectedKey" @change="updateHotkey" class="px-3 py-1.5 bg-neutral-700 border border-neutral-600 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="arrows">← → Arrow Keys</option>
            <option value="tab">Tab</option>
            <option value="space">Space</option>
            <option value="enter">Enter</option>
            <option value="1-9">Number Keys (1-9)</option>
          </select>
        </div>
      </div>
      <div class="mt-3 text-sm text-neutral-400">
        Current: <code class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded font-mono">{{ currentShortcut }}</code>
      </div>
    </div>

    <div class="p-6 bg-neutral-800/50 border border-dashed border-neutral-700 rounded-lg text-center">
      <p class="text-sm text-neutral-500">More keyboard shortcuts coming soon...</p>
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
import { CheckCircle } from 'lucide-vue-next'

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

.hotkeys {
  max-width: 600px;
}

h2 {
  margin: 0 0 1rem 0;
  color: white;
  font-size: 20px;
  font-weight: 600;
}

h3 {
  margin: 0;
  font-size: 15px;
  color: white;
  font-weight: 500;
}

.description {
  margin-bottom: 2rem;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  line-height: 1.6;
}

.hotkey-item {
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.hotkey-info {
  margin-bottom: 1rem;
}

.hotkey-info p {
  margin: 0.25rem 0 0 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.hotkey-config {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.modifier-group {
  display: flex;
  gap: 0.75rem;
}

.modifier-group label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: all 0.15s;
}

.modifier-group label:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
}

.modifier-group input[type="checkbox"] {
  cursor: pointer;
  opacity: 0.7;
}

.modifier-group input[type="checkbox"]:checked {
  opacity: 1;
}

.key-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plus {
  color: rgba(255, 255, 255, 0.3);
  font-weight: 500;
}

select {
  padding: 0.375rem 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

select:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

select:focus {
  outline: none;
  border-color: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.current-shortcut {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.current-shortcut code {
  padding: 0.25rem 0.5rem;
  background: rgba(0, 122, 255, 0.1);
  border: 1px solid rgba(0, 122, 255, 0.2);
  border-radius: 4px;
  color: #007AFF;
  font-weight: 500;
  font-family: 'SF Mono', Monaco, monospace;
}

.more-shortcuts {
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  text-align: center;
  margin-bottom: 2rem;
}

.more-shortcuts p {
  margin: 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

