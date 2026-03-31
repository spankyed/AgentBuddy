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
              @click="toggleMode(index)"
              class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg transition-all"
              :class="mode.disabled ? 'text-neutral-600 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-200'"
              :title="mode.disabled ? 'Enable mode' : 'Disable mode'"
            >
              <EyeOff v-if="mode.disabled" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
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
          class="px-3 py-1.5 text-sm text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-all flex items-center gap-1.5"
        >
          <Plus class="w-3.5 h-3.5" />
          Add Mode
        </button>
      </div>
    </CollapsibleSection>

    <!-- Mode Phases Section -->
    <CollapsibleSection label="Mode Phases" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Configure phases for modes that support multiple work phases
      </p>

      <!-- Mode selector -->
      <div class="mb-4">
        <label class="block text-sm text-neutral-400 mb-2">Select mode to configure phases:</label>
        <select
          v-model="selectedModeId"
          class="w-full px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        >
          <option
            v-for="mode in modes.filter(m => !m.hidden)"
            :key="mode.id"
            :value="mode.id"
          >
            {{ mode.name }}
          </option>
        </select>
      </div>

      <!-- Phases list for selected mode -->
      <div v-if="selectedMode">
        <div v-if="(selectedMode.phases || []).length > 0" class="space-y-3 mb-4">
        <div
          v-for="(phase, index) in (selectedMode.phases || [])"
          :key="phase.id"
          class="border rounded-md bg-neutral-800/50 border-neutral-700"
        >
          <div class="flex items-center gap-2 p-2">
            <input
              v-model="phase.name"
              type="text"
              placeholder="Phase name"
              class="w-32 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="debouncedSave"
            />
            <input
              v-model="phase.description"
              type="text"
              placeholder="Description of this phase"
              class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
              @input="debouncedSave"
            />
            <button
              @click="removePhase(index)"
              class="p-1 rounded-md hover:bg-neutral-700 hover:text-red-400 transition-all text-neutral-400"
              title="Remove phase"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        </div>

        <!-- Add phase button -->
        <button
          @click="addPhase"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-2 border-dashed rounded-md border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
        >
          <Plus class="w-3.5 h-3.5" />
          Add Phase
        </button>
      </div>
    </CollapsibleSection>

    <!-- Quick Prompts Section -->
    <CollapsibleSection label="Quick Prompts" :default-open="true" class="mb-8">
      <p class="text-sm text-neutral-500 mb-4">
        Short reusable prompts that can be quickly inserted into the chat input
      </p>
      <div class="space-y-3">
        <div
          v-for="(prompt, index) in quickPrompts"
          :key="prompt.id"
          class="flex items-center gap-3"
        >
          <input
            v-model="prompt.text"
            type="text"
            placeholder="Prompt text"
            class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
            @input="debouncedSaveQuickPrompts"
          />
          <button
            @click="removeQuickPrompt(index)"
            class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
            title="Remove prompt"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <button
          @click="addQuickPrompt"
          class="px-3 py-1.5 text-sm text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/50 transition-all flex items-center gap-1.5"
        >
          <Plus class="w-3.5 h-3.5" />
          Add Prompt
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
            Cycle through chat modes (Plan → Work → Chat → Note) - Works across all plugins
          </p>
        </div>

        <!-- Future hotkeys can be added here -->
      </div>
    </CollapsibleSection>
    </div>

    <!-- Save status will be managed by parent -->
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Plus, X, Eye, EyeOff } from 'lucide-vue-next'
import KeyboardShortcutInput from '@/core/components/design/KeyboardShortcutInput.vue'
import CollapsibleSection from '@/core/components/design/CollapsibleSection.vue'
import { useDebounce } from '@/core/composables/useDebounce'
import type { AgentSettings, AgentMode, AgentPhase, QuickPrompt } from '@app/api'

interface Props {
  settings?: AgentSettings
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
const modes = ref<AgentMode[]>(props.settings?.modes ? [...props.settings.modes] : [])

// Selected mode for phase configuration
const selectedModeId = ref<string>(modes.value.find(m => !m.hidden)?.id || '')

// Computed property to get the selected mode object
const selectedMode = computed(() =>
  modes.value.find(m => m.id === selectedModeId.value)
)

// Quick prompts state
const quickPrompts = ref<QuickPrompt[]>(props.settings?.quickPrompts ? [...props.settings.quickPrompts] : [])

const saveQuickPrompts = () => {
  emit('update-setting', {
    path: ['quickPrompts'],
    value: quickPrompts.value
  })
}

const { debounced: debouncedSaveQuickPrompts } = useDebounce(() => {
  saveQuickPrompts()
}, 500)

const addQuickPrompt = () => {
  quickPrompts.value.push({
    id: `qp_${Date.now()}`,
    text: ''
  })
  saveQuickPrompts()
}

const removeQuickPrompt = (index: number) => {
  quickPrompts.value.splice(index, 1)
  saveQuickPrompts()
}

const hotkeys = reactive<AgentSettings['hotkeys']>({
  textToSpeech: props.settings?.hotkeys?.textToSpeech || null,
  switchMode: props.settings?.hotkeys?.switchMode || null
})

// Save functions
const saveModes = () => {
  emit('update-setting', {
    path: ['modes'],
    value: modes.value
  })
}

const saveHotkeys = () => {
  // Simply send all hotkeys as-is
  emit('update-setting', {
    path: ['hotkeys'],
    value: hotkeys
  })
}

// Use the debounce composable for saving modes
const { debounced: debouncedSave } = useDebounce(() => {
  saveModes()
}, 500)

// Mode management
const addMode = () => {
  const newMode: AgentMode = {
    id: `mode_${Date.now()}`,
    name: '',
    description: ''
  }
  modes.value.push(newMode)
  saveModes()
}

const toggleMode = (index: number) => {
  modes.value[index].disabled = !modes.value[index].disabled
  debouncedSave()
}

const removeMode = (index: number) => {
  if (modes.value.length > 1) {
    const removedMode = modes.value[index]
    modes.value.splice(index, 1)
    // If we removed the selected mode, select the first available mode
    if (removedMode.id === selectedModeId.value) {
      selectedModeId.value = modes.value.find(m => !m.hidden)?.id || ''
    }
    saveModes()
  }
}

// Phase management
const addPhase = () => {
  if (!selectedMode.value) return

  const newPhase: AgentPhase = {
    id: `phase_${Date.now()}`,
    name: '',
    description: ''
  }

  if (!selectedMode.value.phases) {
    selectedMode.value.phases = []
  }
  selectedMode.value.phases.push(newPhase)
  saveModes()
}

const removePhase = (index: number) => {
  if (!selectedMode.value?.phases) return
  selectedMode.value.phases.splice(index, 1)
  saveModes()
}
</script>