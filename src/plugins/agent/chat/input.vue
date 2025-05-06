<template>
  <div>
    <form 
      @submit.prevent="handleSubmit"
      class="pb-4 max-w-[80%] mx-auto"
    >
      <div class="flex flex-col border rounded-lg bg-neutral-800" :class="$style.input">
        <!-- Editor container -->
        <div class="relative w-full min-h-12">
          <!-- Contenteditable div -->
          <div
            ref="editorRef"
            contenteditable="true"
            translate="no"
            class="w-full px-4 py-3 overflow-y-auto rounded-lg min-h-12 max-h-80 focus:outline-none"
            @input="handleInput"
            @keydown="handleKeydown"
            data-placeholder="Message Agent"
          ></div>
        </div>

        <!-- Buttons row -->
        <div class="flex items-center justify-between px-3 py-3">
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
            <button
              title="Stop agent work"
              type="submit"
              :disabled="!messageContent"
              :class="[
                'px-4 py-2 h-7 rounded text-sm font-medium text-neutral-800 transition-colors flex items-center gap-2',
                messageContent
                  ? 'bg-gray-300 text-white hover:bg-gray-200 active:bg-primary-400' 
                  : 'bg-gray-500 text-neutral-300'
              ]"
            >
              Stop Agent
              <Square :size="22" />
            </button>
            <button
              type="submit"
              :disabled="!messageContent"
              :class="[
                'px-4 py-2 h-7 rounded text-sm font-medium transition-colors flex items-center gap-2',
                messageContent
                  ? 'bg-primary-500 text-white hover:bg-primary-400 active:bg-primary-600' 
                  : 'bg-primary-700 text-neutral-400'
              ]"
            >
              Send
              <CornerDownLeft class="-rotate-45" :size="16" />
            </button>
          </div>
        </div>
      </div>
    </form>

    <Threads
      :threads="mockThreads"
      @select-thread="handleSelectThread"
      @new-thread="handleNewThread"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Mic, PaperclipIcon, Sparkle, AtSign, CornerDownLeft } from 'lucide-vue-next'
import Square from './square-svg.vue'
import Threads from './threads.vue'
import type { Thread } from './threads.vue'
import type { Component } from 'vue'

// Define emits including new button actions
const emit = defineEmits<{
  (e: 'send-message', message: string): void
  (e: 'select-thread', id: string): void
  (e: 'quick-message'): void
  (e: 'attach-file'): void
  (e: 'voice-input'): void
  (e: 'new-thread'): void
  (e: 'stop'): void
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

// Mock data - replace with real data from your app
const mockThreads: Thread[] = [
  {
    id: '1',
    title: 'UI Layout Reorganization Instructions',
    timestamp: new Date(Date.now() - 1000 * 60 * 9) // 9 minutes ago
  },
  {
    id: '2',
    title: 'Adding Padding to Scrollbar in CSS',
    timestamp: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
  },
  {
    id: '3',
    title: 'Enhancing Chat Interface Design',
    timestamp: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
  }
]


const handleButtonClick = (action: string) => {
  emit(action)
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

const handleNewThread = () => {
  emit('new-thread')
}

const handleSelectThread = (id: string) => {
  emit('select-thread', id)
}

const handleStop = () => {
  emit('stop')
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