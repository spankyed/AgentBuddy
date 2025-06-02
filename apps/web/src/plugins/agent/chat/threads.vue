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

      <div class="flex-grow px-12 pb-2 text-sm text-center text-neutral-500 hover:cursor-pointer">
        <span
          @click.stop="handleViewThread(currentThread.id)"
          class="text-center hover:text-neutral-200">
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
        <div
          v-for="thread in threads"
          :key="thread.id"
          class="flex items-center w-full p-3 px-4 text-left transition-colors rounded-lg group hover:bg-neutral-800 hover:cursor-pointer"
          @click="handleSelectThread(thread.id)"
        >
          <div
            class="flex items-center justify-start flex-grow"
          >
          <span class="mr-2 text-xs text-neutral-500">{{ formatTime(thread.timestamp) }}</span>
            <span class="text-sm text-neutral-200">{{ thread.topic }}</span>
          </div>
          <button
            type="button"
            class="h-full ml-2 text-sm text-neutral-500 hover:text-neutral-200"
            @click.stop="handleViewThread(thread.id)"
          >
            View Details
          </button>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { History, ChevronUp, Plus } from 'lucide-vue-next'
import type { ThreadEntity } from '@abuddy/api';
import type { AgentThreadData } from '@abuddy/api'
import Button from '@/core/design/button.vue'

export interface ThreadsProps {
  currentThread: AgentThreadData
  threads: ThreadEntity[]
}

const props = defineProps<ThreadsProps>()
const isOpen = ref(false)

const emit = defineEmits<{
  (e: 'view-thread', threadId: string): void
  (e: 'open-thread-chat', threadId: string): void
  (e: 'new-thread'): void
}>()

const handleViewThread = (id: string) => {
  emit('view-thread', id)
  isOpen.value = false
}

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