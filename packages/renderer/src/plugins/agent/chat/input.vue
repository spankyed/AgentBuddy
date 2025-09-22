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

          <!-- Mode select (slightly left of center) -->
          <select
            v-if="!currentThread?.forcedMode"
            :value="currentMode"
            @change="handleModeChange"
            class="absolute bottom-0 px-2 py-1 mb-2 text-center rounded-lg text-neutral-500 focus:outline-none bg-neutral-800"
            :class="disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
            :style="{ left: currentModePhases.length > 0 ? '40%' : '50%', transform: 'translateX(-50%)' }"
            :disabled="disabled"
            :title="modes.find(m => m.id === currentMode)?.description"
          >
            <option
              v-for="mode in visibleModes"
              :key="mode.id"
              :value="mode.id"
              :title="mode.description"
            >
              {{ mode.name }}
            </option>
          </select>

          <!-- Forced mode indicator -->
          <div
            v-if="currentThread?.forcedMode"
            class="absolute bottom-0 px-3 py-1 mb-2 text-center transform -translate-x-1/2 rounded-lg text-neutral-400 bg-neutral-800 left-1/2"
          >
            {{ modes.find(m => m.id === currentThread.forcedMode)?.name || 'Birth' }}
          </div>

          <!-- Phase select (centered, only if current mode has phases) -->
          <select
            v-if="currentModePhases.length > 0 && !currentThread?.forcedMode"
            :value="currentPhase"
            @change="handlePhaseChange"
            class="absolute bottom-0 px-2 py-1 mb-2 text-center transform -translate-x-1/2 rounded-lg text-neutral-500 focus:outline-none left-1/2 bg-neutral-800"
            :class="disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
            :disabled="disabled"
          >
            <option
              v-for="phase in currentModePhases"
              :key="phase.id"
              :value="phase.id"
              :title="phase.description"
            >
              {{ phase.name }}
            </option>
          </select>
        </div>
      </div>
    </form>

    <div class="flex-shrink-0">
      <Threads
        :current-thread="currentThread"
        :threads="threads"
        @view-thread="(threadId: string) => emit('view-thread', threadId)"
        @open-thread-chat="(threadId: string) => emit('open-thread-chat', threadId)"
        @new-thread="emit('new-thread')"
        @new-thread-as-child="(parentThreadId: string) => emit('new-thread-as-child', parentThreadId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { Mic, PaperclipIcon, Sparkle, AtSign, CornerDownLeft } from 'lucide-vue-next'
import Square from './square-svg.vue'
import Threads from './threads.vue'
import type { Component } from 'vue'
import Button from '@/core/components/design/button.vue'
import StatusIndicator from './status-indicator.vue'
import type { AgentThreadData, ThreadEntity, AgentMode } from '@app/api'

const props = defineProps<{
  currentThread: AgentThreadData
  threads: ThreadEntity[]
  currentMode: string
  currentPhase: string
  modes: AgentMode[]
  disabled?: boolean
}>()

// Define emits including new button actions
const emit = defineEmits<{
  (e: 'open-thread-chat', threadId: string): void
  (e: 'view-thread', threadId: string): void
  (e: 'send-message', message: string): void
  (e: 'quick-message'): void
  (e: 'attach-file'): void
  (e: 'voice-input'): void
  (e: 'new-thread'): void
  (e: 'new-thread-as-child', parentThreadId: string): void
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

const handleModeChange = (e: Event) => {
  if (props.disabled) return
  const newMode = (e.target as HTMLSelectElement).value
  emit('mode-change', newMode)
  // If the new mode has phases, also set mode to first phase
  const mode = props.modes.find(m => m.id === newMode)
  if (mode?.phases?.length) {
    emit('phase-change', mode.phases[0].id)
  }
}

const handlePhaseChange = (e: Event) => {
  if (props.disabled) return
  emit('phase-change', (e.target as HTMLSelectElement).value)
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