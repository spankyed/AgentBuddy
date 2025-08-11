<template>
  <div class="flex flex-col w-full">
    <form 
      @submit.prevent="handleSubmit"
      class="pb-4 pt-3 max-w-[80%] mx-auto w-full flex-shrink-0 overflow-visible"
    >
      <div class="relative flex flex-col border rounded-lg bg-neutral-800 overflow-visible" :class="$style.input">
        <StatusIndicator/>

        <!-- Editor container -->
        <div class="relative w-full min-h-12">
          <!-- Contenteditable div -->
          <div
            ref="editorRef"
            contenteditable="true"
            translate="no"
            class="w-full px-4 py-3 overflow-y-auto rounded-lg min-h-12 max-h-40 focus:outline-none"
            @input="handleInput"
            @keydown="handleKeydown"
            data-placeholder="Message Agent"
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
              class="p-2 transition-colors text-neutral-500 hover:text-neutral-200"
              :aria-label="btn.label"
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
              :disabled="!messageContent"
              variant="secondary"
            >
              Stop Agent
              <Square :size="22" />
            </Button>
            <Button
              type="submit"
              :disabled="!messageContent"
            >
              Send
              <CornerDownLeft class="-rotate-45" :size="16" />
            </Button>

          </div>

          <!-- Mode select -->
          <select
            :value="currentMode"
            @change="handleModeChange"
            class="absolute bottom-0 px-2 py-1 mb-2 text-center transform -translate-x-1/2 rounded-lg cursor-pointer text-neutral-500 focus:outline-none left-1/2 bg-neutral-800"
          >
            <option value="plan">Plan mode</option>
            <option value="work">Work mode</option>
            <option value="chat">Chat mode</option>
            <option value="note">Take notes</option>
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
import { ref, onMounted } from 'vue'
import { Mic, PaperclipIcon, Sparkle, AtSign, CornerDownLeft } from 'lucide-vue-next'
import Square from './square-svg.vue'
import Threads from './threads.vue'
import type { Component } from 'vue'
import Button from '@/core/design/button.vue'
import StatusIndicator from './status-indicator.vue'
import type { AgentThreadData, ThreadEntity } from '@app/api'

defineProps<{
  currentThread: AgentThreadData
  threads: ThreadEntity[]
  currentMode: 'plan' | 'work' | 'chat' | 'note'
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
  const target = e.target as HTMLDivElement
  messageContent.value = target.textContent || ''
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}


const handleButtonClick = (action: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  emit(action as any)
}

const handleModeChange = (e: Event) => {
  const target = e.target as HTMLSelectElement
  emit('mode-change', target.value)
}

const handleSubmit = () => {
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