<template>
  <div class="hotkeys">
    <h2>Keyboard Shortcuts</h2>
    <p class="description">
      Configure keyboard shortcuts for common actions in the application.
    </p>

    <div class="hotkey-item">
      <div class="hotkey-info">
        <h3>Switch Plugin</h3>
        <p>Navigate between plugins using keyboard shortcuts</p>
      </div>
      <div class="hotkey-config">
        <div class="modifier-group">
          <label>
            <input
              type="checkbox"
              v-model="modifiers.cmd"
              @change="updateHotkey"
            />
            <span>⌘ Cmd</span>
          </label>
          <label>
            <input
              type="checkbox"
              v-model="modifiers.option"
              @change="updateHotkey"
            />
            <span>⌥ Option</span>
          </label>
          <label>
            <input
              type="checkbox"
              v-model="modifiers.shift"
              @change="updateHotkey"
            />
            <span>⇧ Shift</span>
          </label>
          <label>
            <input
              type="checkbox"
              v-model="modifiers.ctrl"
              @change="updateHotkey"
            />
            <span>⌃ Ctrl</span>
          </label>
        </div>
        <div class="key-input">
          <span class="plus">+</span>
          <select v-model="selectedKey" @change="updateHotkey">
            <option value="arrows">← → Arrow Keys</option>
            <option value="tab">Tab</option>
            <option value="space">Space</option>
            <option value="enter">Enter</option>
            <option value="1-9">Number Keys (1-9)</option>
          </select>
        </div>
      </div>
      <div class="current-shortcut">
        Current: <code>{{ currentShortcut }}</code>
      </div>
    </div>

    <div class="more-shortcuts">
      <p>More keyboard shortcuts coming soon...</p>
    </div>

    <button @click="save" class="save-button">Save Shortcuts</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'

const actor = applicationState.system.get('settings')

const settings = useSelector(actor, (state: any) => state.context.settings)

const modifiers = ref({
  cmd: true,
  option: true,
  shift: false,
  ctrl: false,
})

const selectedKey = ref('arrows')

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
  // This will be called when user changes the hotkey configuration
}

const save = () => {
  const activeModifiers = Object.entries(modifiers.value)
    .filter(([_, active]) => active)
    .map(([mod]) => mod)
  
  actor.send({ 
    type: 'HOTKEYS.UPDATE', 
    data: {
      switchPlugin: {
        key: selectedKey.value,
        modifiers: activeModifiers
      }
    }
  })
}
</script>

<style scoped>
.hotkeys {
  max-width: 700px;
}

h2 {
  margin-bottom: 1rem;
  color: var(--color-heading);
}

h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text);
}

.description {
  margin-bottom: 2rem;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.hotkey-item {
  padding: 1.5rem;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.hotkey-info {
  margin-bottom: 1rem;
}

.hotkey-info p {
  margin: 0.25rem 0 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.hotkey-config {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.modifier-group {
  display: flex;
  gap: 1rem;
}

.modifier-group label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  font-size: 14px;
}

.modifier-group input[type="checkbox"] {
  cursor: pointer;
}

.key-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plus {
  color: var(--color-text-secondary);
  font-weight: 500;
}

select {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
}

.current-shortcut {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.current-shortcut code {
  padding: 0.25rem 0.5rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-primary);
  font-weight: 500;
}

.more-shortcuts {
  padding: 1rem;
  background: var(--color-background-soft);
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  text-align: center;
  margin-bottom: 2rem;
}

.more-shortcuts p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.save-button {
  padding: 0.75rem 1.5rem;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.save-button:hover {
  background: var(--color-primary-dark);
}
</style>