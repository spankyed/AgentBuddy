<template>
  <div>
    <form 
      @submit.prevent="handleSubmit"
      class="px-12 py-4"
    >
      <div class="relative flex items-center">
        <button
          type="button"
          class="absolute transition-colors left-3 text-neutral-500 hover:text-neutral-200"
          aria-label="Attach file"
        >
          <PaperclipIcon :size="20" />
        </button>
        
        <input
          type="text"
          v-model="message"
          placeholder="Message Agent"
          class="w-full px-10 py-3 transition-all border rounded-lg bg-neutral-800 border-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        
        <button
          type="button"
          class="absolute transition-colors right-14 text-neutral-500 hover:text-neutral-200"
          aria-label="Voice input"
        >
          <Mic :size="20" />
        </button>
        
        <button
          type="submit"
          :disabled="!message.trim()"
          :class="[
            'absolute right-3 transition-colors',
            message.trim() 
              ? 'text-primary-500 hover:text-primary-600' 
              : 'text-neutral-400'
          ]"
          aria-label="Send message"
        >
          <Send :size="20" />
        </button>
      </div>
    </form>

    <PastChats
      :chats="mockChats"
      @select-chat="handleSelectChat"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Send, Mic, PaperclipIcon } from 'lucide-vue-next'
import PastChats from './PastChats.vue'
import type { Chat } from './PastChats.vue'

const message = ref('')

// Mock data - replace with real data from your app
const mockChats: Chat[] = [
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

const emit = defineEmits<{
  (e: 'send-message', message: string): void
  (e: 'select-chat', id: string): void
}>()

const handleSubmit = () => {
  if (message.value.trim()) {
    emit('send-message', message.value)
    message.value = ''
  }
}

const handleSelectChat = (id: string) => {
  emit('select-chat', id)
}
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 