<template>
  <div class="relative max-w-[80%] mx-auto pb-2">
    <div class="flex items-center content-between" @click="isOpen = !isOpen">
      <button
        type="button"
        class="flex items-center px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
      >
        Recent Threads

        <History v-if="!isOpen" :size="16" class="ml-2" />
        <ChevronUp v-else :size="16" class="ml-2" />
      </button>

      <div class="flex-grow px-12 pb-2 text-sm text-center text-neutral-500 hover:text-neutral-200 hover:cursor-pointer">
        <span
          @click.stop="$emit('view-current-thread')"
          class="text-center">
          {{ currentThread.topic }}
          <span class="w-24 px-2 py-1 text-xs font-semibold text-neutral-200/30">
            {{ currentThread.shortCode }}
          </span>
        </span>
      </div>

      <button
        type="button"
        class="flex items-center px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
        @click.stop="$emit('new-thread')"
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
            <span class="text-sm text-neutral-200">{{ thread.topic }}</span>
            <span class="text-xs text-neutral-500">{{ formatTime(thread.timestamp) }}</span>
          </div>
        </button>
      </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { History, ChevronUp, Plus } from 'lucide-vue-next'
import type { ThreadEntity } from '@abuddy/api';
import type { AgentThreadData } from '@abuddy/api'

export interface ThreadsProps {
  currentThread: AgentThreadData
  threads: ThreadEntity[]
}

const props = defineProps<ThreadsProps>()
const isOpen = ref(false)

const emit = defineEmits<{
  (e: 'view-thread'): void
  (e: 'view-current-thread'): void
  (e: 'open-thread-chat', threadId: string): void
  (e: 'new-thread'): void
}>()

const handleSelectThread = (id: string) => {
  emit('open-thread-chat', id)
  isOpen.value = false
}

const handleNewThread = () => {
  emit('new-thread')
  isOpen.value = false
}

const formatTime = (timestamp: Date | number | string) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style lang="scss" module>
</style>