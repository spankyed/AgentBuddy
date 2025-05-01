<template>
  <div class="relative px-12 pb-2">
    <button
      type="button"
      class="flex items-center w-full px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
      @click="isOpen = !isOpen"
    >
      <History :size="16" class="mr-2" />
      Past chats
      <ChevronDown :size="16" class="ml-2" :class="{ 'rotate-180': isOpen }" />
    </button>

    <div 
      v-if="isOpen"
      class="px-2 pt-1 border-t border-neutral-800 bg-neutral-900 animate-slide-down"
    >
        <button
          v-for="chat in chats"
          :key="chat.id"
          class="w-full px-4 p-3 text-left transition-colors rounded-lg hover:bg-neutral-800 group"
          @click="handleSelectChat(chat.id)"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm text-neutral-200">{{ chat.title }}</span>
            <span class="text-xs text-neutral-500">{{ formatTime(chat.timestamp) }}</span>
          </div>
        </button>
      </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { History, ChevronDown } from 'lucide-vue-next'

export interface Chat {
  id: string
  title: string
  timestamp: Date
}

export interface PastChatsProps {
  chats: Chat[]
}

const props = defineProps<PastChatsProps>()
const isOpen = ref(false)

const emit = defineEmits<(e: 'select-chat', id: string) => void>()

const handleSelectChat = (id: string) => {
  emit('select-chat', id)
  isOpen.value = false
}

const formatTime = (timestamp: Date) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script> 