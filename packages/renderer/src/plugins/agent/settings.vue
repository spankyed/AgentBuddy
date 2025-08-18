<template>
  <div class="max-w-3xl">
    <!-- Chat Modes Section -->
    <CollapsibleSection label="Chat Modes" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Configure different conversation modes for the AI agent
      </p>
      <div class="space-y-4">
        <div 
          v-for="(mode, index) in modes" 
          :key="mode.id"
          class="group"
        >
          <div class="flex items-center gap-3">
            <input
              v-model="mode.name"
              type="text"
              placeholder="Mode name"
              class="w-32 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="debouncedSave"
            />
            <input
              v-model="mode.description"
              type="text"
              placeholder="Description of this mode"
              class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="debouncedSave"
            />
            <button
              @click="removeMode(index)"
              class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
              :disabled="modes.length <= 1"
              title="Remove mode"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <button
          @click="addMode"
          class="w-full px-4 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-300 hover:text-white hover:border-neutral-600 transition-all flex items-center justify-center gap-2"
        >
          <Plus class="w-4 h-4" />
          Add Mode
        </button>
      </div>
    </CollapsibleSection>

    <!-- Agent Hotkeys Section -->
    <div class="border-t border-neutral-800 pt-8">
      <CollapsibleSection label="Agent Hotkeys" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Keyboard shortcuts available when the agent plugin is active
      </p>
      <div class="space-y-6">
        <div class="group">
          <KeyboardShortcutInput
            v-model="hotkeys.textToSpeech"
            id="text-to-speech"
            label="Text to Speech"
            @change="saveHotkeys"
            container-class="flex-1"
            :show-reset-button="true"
          />
          <p class="mt-1.5 text-xs text-neutral-600">
            Convert agent responses to speech (currently a stub feature)
          </p>
        </div>

        <div class="group">
          <KeyboardShortcutInput
            v-model="hotkeys.switchMode"
            id="switch-mode"
            label="Switch Mode"
            @change="saveHotkeys"
            container-class="flex-1"
            :show-reset-button="true"
          />
          <p class="mt-1.5 text-xs text-neutral-600">
            Cycle through chat modes (Plan → Work → Chat → Note)
          </p>
        </div>

        <!-- Future hotkeys can be added here -->
      </div>
    </CollapsibleSection>
    </div>

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
import { ref, reactive, onMounted } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { Plus, X, CheckCircle } from 'lucide-vue-next'
import KeyboardShortcutInput, { type KeyboardShortcut } from '@/core/components/design/KeyboardShortcutInput.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'

const settingsActor = applicationState.system.get('settings')
const settings = useSelector(settingsActor, (state: any) => state.context.settings)

interface ChatMode {
  id: string
  name: string
  description: string
}

interface AgentHotkeys {
  textToSpeech: KeyboardShortcut | null
  switchMode: KeyboardShortcut | null
}

// State
const modes = ref<ChatMode[]>([])
const hotkeys = reactive<AgentHotkeys>({
  textToSpeech: null,
  switchMode: null
})
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimeout: NodeJS.Timeout | null = null

// Initialize from settings
onMounted(() => {
  if (settings.value?.plugins?.agent) {
    const agentSettings = settings.value.plugins.agent
    
    // Load modes
    if (agentSettings.modes) {
      modes.value = agentSettings.modes.map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description
      }))
    }
    
    // Load hotkeys
    if (agentSettings.hotkeys?.textToSpeech) {
      const tts = agentSettings.hotkeys.textToSpeech
      hotkeys.textToSpeech = {
        key: tts.key,
        modifiers: tts.modifiers || []
      }
    }
    if (agentSettings.hotkeys?.switchMode) {
      const sm = agentSettings.hotkeys.switchMode
      hotkeys.switchMode = {
        key: sm.key,
        modifiers: sm.modifiers || []
      }
    }
  }
  
  // If no modes exist, use defaults
  if (modes.value.length === 0) {
    modes.value = [
      { id: 'plan', name: 'Plan', description: 'Strategic planning and task breakdown mode' },
      { id: 'work', name: 'Work', description: 'Implementation and coding mode' },
      { id: 'chat', name: 'Chat', description: 'General conversation mode' },
      { id: 'note', name: 'Note', description: 'Note-taking and documentation mode' }
    ]
  }
  
  // If no hotkey exists, use default
  if (!hotkeys.textToSpeech) {
    hotkeys.textToSpeech = {
      key: ' ',
      modifiers: ['ctrl']
    }
  }
  if (!hotkeys.switchMode) {
    hotkeys.switchMode = {
      key: 'Tab',
      modifiers: ['shift']
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
const saveModes = () => {
  setSaveStatus('saving')
  
  settingsActor.send({
    type: 'SETTINGS.UPDATE',
    entityType: 'plugin',
    label: 'agent',
    path: ['modes'],
    value: modes.value
  })
  
  setSaveStatus('saved')
}

const saveHotkeys = () => {
  setSaveStatus('saving')
  
  const hotkeyData = {
    textToSpeech: hotkeys.textToSpeech ? {
      key: hotkeys.textToSpeech.key,
      modifiers: hotkeys.textToSpeech.modifiers
    } : null,
    switchMode: hotkeys.switchMode ? {
      key: hotkeys.switchMode.key,
      modifiers: hotkeys.switchMode.modifiers
    } : null
  }
  
  settingsActor.send({
    type: 'SETTINGS.UPDATE',
    entityType: 'plugin',
    label: 'agent',
    path: ['hotkeys'],
    value: hotkeyData
  })
  
  setSaveStatus('saved')
}

// Debounced save for text inputs
const debouncedSave = () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(() => {
    saveModes()
  }, 500)
}

// Mode management
const addMode = () => {
  const newMode: ChatMode = {
    id: `mode_${Date.now()}`,
    name: '',
    description: ''
  }
  modes.value.push(newMode)
  saveModes()
}

const removeMode = (index: number) => {
  if (modes.value.length > 1) {
    modes.value.splice(index, 1)
    saveModes()
  }
}
</script>