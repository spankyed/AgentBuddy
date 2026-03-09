<template>
  <div class="flex flex-col w-full">
    <form
      @submit.prevent="handleSubmit"
      class="pb-4 pt-3 max-w-[80%] mx-auto w-full flex-shrink-0 overflow-visible"
    >
      <div
        class="relative flex flex-col border rounded-lg bg-neutral-800 overflow-visible"
        :class="[$style.input, { 'opacity-50': disabled }]"
        data-onboarding-id="agent-chat-input">
        <StatusIndicator/>

        <!-- Editor container -->
        <div class="relative w-full min-h-12">
          <!-- Contenteditable div -->
          <div
            ref="editorRef"
            :contenteditable="!disabled"
            translate="no"
            class="w-full px-4 py-3 overflow-y-auto rounded-lg min-h-12 max-h-40 focus:outline-none"
            :class="{ 'cursor-not-allowed': disabled }"
            @input="handleInput"
            @keydown="handleKeydown"
            :data-placeholder="disabled ? 'API keys required to use chat' : 'Message Agent'"
          ></div>
        </div>

        <!-- Buttons row -->
        <div class="relative flex items-center justify-between px-3 py-3 text-neutral-500">
          <!-- Left side buttons -->
          <div class="flex items-center">
            <button
              v-for="btn in leftButtons"
              :key="btn.action"
              type="button"
              class="p-2 transition-colors text-neutral-500"
              :class="disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-neutral-200'"
              :aria-label="btn.label"
              :disabled="disabled"
              @click="handleButtonClick(btn.action)"
            >
              <component :is="btn.icon" :size="20" />
            </button>
          </div>

          <!-- Right side buttons -->
          <div class="flex items-center gap-2">
            <!-- Stop button -->
            <Button
              title="Stop agent work"
              type="submit"
              :disabled="!messageContent || disabled"
              variant="secondary"
            >
              Stop Agent
              <Square :size="22" />
            </Button>
            <Button
              type="submit"
              :disabled="!messageContent || disabled"
            >
              Send
              <CornerDownLeft class="-rotate-45" :size="16" />
            </Button>

          </div>

          <!-- Mode/Phase Selector -->
          <div class="absolute bottom-0 mb-2 transform -translate-x-1/2 left-1/2">
            <ModePhaseSelector
              :modes="modes"
              :current-mode="currentMode"
              :current-phase="currentPhase"
              :forced-mode="currentThread?.forcedMode"
              :disabled="disabled"
              @mode-change="handleModeChange"
              @phase-change="handlePhaseChange"
            />
          </div>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { Mic, PaperclipIcon, Sparkle, AtSign, CornerDownLeft } from 'lucide-vue-next'
import Square from './square-svg.vue'
import ModePhaseSelector from './ModePhaseSelector.vue'
import type { Component } from 'vue'
import Button from '@/core/components/design/button.vue'
import StatusIndicator from './status-indicator.vue'
import type { AgentThreadData, AgentMode } from '@app/api'

const props = defineProps<{
  currentThread: AgentThreadData
  currentMode: string
  currentPhase?: string
  modes: AgentMode[]
  disabled?: boolean
}>()

// Define emits including new button actions
const emit = defineEmits<{
  (e: 'send-message', message: string): void
  (e: 'quick-message'): void
  (e: 'attach-file'): void
  (e: 'voice-input'): void
  (e: 'stop'): void
  (e: 'mode-change', mode: string): void
  (e: 'phase-change', phase: string): void
}>()


interface ActionButton {
  icon: Component
  label: string
  action: string
  class?: string
}

const leftButtons: ActionButton[] = [
  {
    icon: AtSign,
    label: 'Add context',
    action: 'add-context'
  },
  {
    icon: PaperclipIcon,
    label: 'Attach file',
    action: 'attach-file'
  },
  {
    icon: Sparkle,
    label: 'Quick message',
    action: 'quick-message'
  },
  {
    icon: Mic,
    label: 'Voice input',
    action: 'voice-input'
  },
]


const editorRef = ref<HTMLDivElement | null>(null)
const messageContent = ref('')

// Computed properties for cleaner template
const visibleModes = computed(() => props.modes.filter(m => !m.hidden))
const currentModePhases = computed(() => {
  const mode = props.modes.find(m => m.id === props.currentMode)
  return mode?.phases || []
})

// Reset to first visible mode when switching from forced-mode thread
watch(() => props.currentThread?.id, () => {
  if (props.currentMode && !props.currentThread?.forcedMode && !visibleModes.value.some(m => m.id === props.currentMode)) {
    emit('mode-change', visibleModes.value[0].id)
  }
})

onMounted(() => {
  // Set up placeholder behavior
  const editor = editorRef.value
  if (editor) {
    editor.addEventListener('focus', () => {
      if (editor.textContent === '') {
        editor.classList.remove('empty')
      }
    })

    editor.addEventListener('blur', () => {
      if (editor.textContent === '') {
        editor.classList.add('empty')
      }
    })

    // Initialize as empty
    editor.classList.add('empty')
  }
})

const handleInput = (e: Event) => {
  if (props.disabled) return
  const target = e.target as HTMLDivElement
  messageContent.value = target.textContent || ''
}

const handleKeydown = (e: KeyboardEvent) => {
  if (props.disabled) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}


const handleButtonClick = (action: string) => {
  if (props.disabled) return
  // @ts-expect-error - dynamic event emission
  emit(action)
}

const handleModeChange = (newMode: string) => {
  if (props.disabled) return
  emit('mode-change', newMode)
}

const handlePhaseChange = (newPhase: string) => {
  if (props.disabled) return
  emit('phase-change', newPhase)
}

const handleSubmit = () => {
  if (props.disabled) return
  if (messageContent.value.trim()) {
    emit('send-message', messageContent.value)
    if (editorRef.value) {
      editorRef.value.textContent = ''
      editorRef.value.classList.add('empty')
    }
    messageContent.value = ''
  }
}
</script>

<style lang="scss" module>
.input {
  border-color: rgb(60 60 60);;
}

[contenteditable].empty:before {
  content: attr(data-placeholder);
  color: #666;
  cursor: text;
  pointer-events: none;
}

/* Hide the placeholder when focused and empty */
[contenteditable]:focus.empty:before {
  content: '';
}
</style>
