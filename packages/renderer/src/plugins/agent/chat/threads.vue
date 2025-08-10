<template>
  <div class="relative max-w-[80%] mx-auto pb-2" ref="containerRef">
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
          @click.stop="handleViewThread(currentThread?.id)"
          class="text-center hover:text-neutral-200">
          {{ currentThread?.topic }}
          <span class="w-24 px-2 py-1 text-xs font-semibold text-neutral-200/30">
            {{ currentThread?.shortCode }}
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

    <Teleport to="body">
      <div 
        v-if="isOpen && dropdownPosition"
        :style="{
          position: 'fixed',
          bottom: dropdownPosition.bottom + 'px',
          left: dropdownPosition.left + 'px',
          width: dropdownPosition.width + 'px',
        }"
        class="threads-dropdown px-2 pt-1 border border-neutral-800 bg-neutral-900 rounded-lg shadow-2xl z-[9999] animate-slide-up max-h-48 overflow-y-auto"
      >


      <div v-if="threads.length === 0" class="py-2 text-center">
        <div class="flex flex-col items-center space-y-2">
          <!-- <History :size="32" class="text-neutral-600" /> -->
          <p class="text-sm text-neutral-500">No threads yet</p>
          <p class="text-xs text-neutral-600">Recent threads will appear here</p>
        </div>
      </div>
      <div v-else>
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
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { History, ChevronUp, Plus } from 'lucide-vue-next'
import type { ThreadEntity } from '@app/api';
import type { AgentThreadData } from '@app/api'
import Button from '@/core/design/button.vue'

export interface ThreadsProps {
  currentThread: AgentThreadData | null;
  threads: ThreadEntity[]
}

const props = defineProps<ThreadsProps>()
const isOpen = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)
const dropdownPosition = ref<{ bottom: number; left: number; width: number } | null>(null)

const updateDropdownPosition = () => {
  if (containerRef.value && isOpen.value) {
    const rect = containerRef.value.getBoundingClientRect()
    dropdownPosition.value = {
      bottom: window.innerHeight - rect.top + 5, // 5px gap above the trigger
      left: rect.left,
      width: rect.width
    }
  }
}

const handleClickOutside = (event: MouseEvent) => {
  if (isOpen.value && containerRef.value && !containerRef.value.contains(event.target as Node)) {
    // Check if click is on the teleported dropdown
    const dropdown = document.querySelector('.threads-dropdown')
    if (dropdown && !dropdown.contains(event.target as Node)) {
      isOpen.value = false
    }
  }
}

watch(isOpen, (newVal) => {
  if (newVal) {
    updateDropdownPosition()
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
  } else {
    dropdownPosition.value = null
    document.removeEventListener('click', handleClickOutside)
  }
})

onMounted(() => {
  window.addEventListener('resize', updateDropdownPosition)
  window.addEventListener('scroll', updateDropdownPosition, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateDropdownPosition)
  window.removeEventListener('scroll', updateDropdownPosition, true)
  document.removeEventListener('click', handleClickOutside)
})

const emit = defineEmits<{
  (e: 'view-thread', threadId: string): void
  (e: 'open-thread-chat', threadId: string): void
  (e: 'new-thread'): void
}>()

const handleViewThread = (id: string | undefined) => {
  if (!id) return
  emit('view-thread', id)
  isOpen.value = false
}

const handleSelectThread = (id: string | undefined) => {
  if (!id) return
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