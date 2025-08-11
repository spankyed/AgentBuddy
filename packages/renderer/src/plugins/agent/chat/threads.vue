<template>
  <div class="relative max-w-[80%] mx-auto pb-2" ref="containerRef">
    <div 
      v-if="isOpen"
      class="absolute bottom-full mb-2 left-0 right-0 px-2 pt-1 border border-neutral-800 bg-neutral-900 rounded-lg shadow-2xl max-h-48 overflow-y-auto animate-slide-down z-50"
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

      <ContextMenuRoot>
        <ContextMenuTrigger as-child>
          <button
            type="button"
            class="flex items-center px-5 pb-2 text-sm transition-colors text-neutral-500 hover:text-neutral-200"
            @click.stop="$emit('new-thread')"
          >
            <Plus :size="16" class="mr-2" />
            New thread
          </button>
        </ContextMenuTrigger>
        
        <ContextMenuPortal>
          <ContextMenuContent
            class="min-w-[220px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
          >
            <ContextMenuItem
              @select="$emit('new-thread')"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <Plus class="w-4 h-4" />
              Create New Thread
            </ContextMenuItem>
            
            <ContextMenuSeparator class="h-[1px] bg-neutral-700 my-1" />
            
            <div class="px-3 py-1 text-xs font-medium text-neutral-500 uppercase">Create as child of</div>
            
            <ContextMenuItem
              v-for="projectThread in recentProjectThreads"
              :key="projectThread.id"
              @select="$emit('new-thread-as-child', projectThread.id)"
              class="flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="text-xs font-medium text-neutral-500">{{ projectThread.shortCode }}</span>
                <span class="truncate">{{ projectThread.topic || 'Untitled' }}</span>
              </div>
            </ContextMenuItem>
            
            <div v-if="recentProjectThreads.length === 0" class="px-3 py-2 text-sm text-neutral-500 italic">
              No project threads available
            </div>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenuRoot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { History, ChevronUp, Plus } from 'lucide-vue-next'
import type { ThreadEntity } from '@app/api';
import type { AgentThreadData } from '@app/api'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
} from 'reka-ui'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id as threadsId, type ThreadsState } from '@/plugins/threads/state'

export interface ThreadsProps {
  currentThread: AgentThreadData | null;
  threads: ThreadEntity[]
}

const props = defineProps<ThreadsProps>()
const isOpen = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)

// Get threads from the threads plugin state
const threadsActor: ThreadsState = applicationState.system.get(threadsId)
const allThreads = useSelector(threadsActor, (state) => state.context.threads)

const recentProjectThreads = computed(() => {
  return allThreads.value
    .filter(thread => thread.threadType === 'project')
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10) // Show up to 10 most recent project threads
})

const handleClickOutside = (event: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const emit = defineEmits<{
  (e: 'view-thread', threadId: string): void
  (e: 'open-thread-chat', threadId: string): void
  (e: 'new-thread'): void
  (e: 'new-thread-as-child', parentThreadId: string): void
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