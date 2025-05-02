<template>
  <div class="relative max-w-[80%] mx-auto pb-2">
    <div class="flex items-center content-between">
      <div class="flex-grow">
        <button
          type="button"
          class="flex items-center px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
          @click="isOpen = !isOpen"
        >
          <History :size="16" class="mr-2" />
          Threads
          <ChevronDown :size="16" class="ml-2" :class="{ 'rotate-180': isOpen }" />
        </button>
      </div>

      <button
        type="button"
        class="flex items-center px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
        @click="$emit('new-thread')"
      >
        <Plus :size="16" class="mr-2" />
        New thread
      </button>
    </div>

    <div 
      v-if="isOpen"
      class="px-2 pt-1 border-t border-neutral-800 bg-neutral-900 animate-slide-down"
    >
        <button
          v-for="thread in threads"
          :key="thread.id"
          class="w-full p-3 px-4 text-left transition-colors rounded-lg hover:bg-neutral-800 group"
          @click="handleSelectThread(thread.id)"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm text-neutral-200">{{ thread.title }}</span>
            <span class="text-xs text-neutral-500">{{ formatTime(thread.timestamp) }}</span>
          </div>
        </button>
      </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { History, ChevronDown, Plus } from 'lucide-vue-next'

export interface Thread {
  id: string
  title: string
  timestamp: Date
}

export interface ThreadsProps {
  threads: Thread[]
}

const props = defineProps<ThreadsProps>()
const isOpen = ref(false)

const emit = defineEmits<{
  (e: 'select-thread', id: string): void
  (e: 'new-thread'): void
}>()

const handleSelectThread = (id: string) => {
  emit('select-thread', id)
  isOpen.value = false
}

const formatTime = (timestamp: Date) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script> 