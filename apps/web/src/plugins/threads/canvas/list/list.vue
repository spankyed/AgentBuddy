<template>
  <div class="max-w-6xl px-5 py-4 mx-auto">
    <!-- Search & Create row -->
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
      <Button
        @click="actor.send({ type: 'SHOW_CREATE_FORM' })"
        type="button"
                  class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200 rounded-md bg-primary-600 hover:bg-primary-500 active:scale-[0.98] shadow-sm"
      >
      <Plus :size="16" class="" />
        New Thread
      </Button>
              <div class="flex justify-end flex-1 gap-2 text-sm">
          <Button
            type="button"
            variant="transparent"
            class="!text-sm !text-neutral-400 hover:!text-neutral-200 !transition-colors !duration-200"
          >
            Filter
          </Button>
          <Button
            type="button"
            variant="transparent"
            class="!text-sm !text-neutral-400 hover:!text-neutral-200 !transition-colors !duration-200"
        >
          Clear filters
          <span v-if="5 > 0" class="ml-1.5 text-neutral-500">
            ({{ 5 }} hidden)
          </span>
        </Button>
      </div>
      <div class="flex justify-end">
        <!-- Search input -->
        <div class="relative">
          <Search class="absolute w-4 h-4 -translate-y-1/2 left-3 top-1/2 text-neutral-500" />
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="Search threads..."
            class="w-[22rem] pl-10 pr-4 py-2 text-sm rounded-md bg-neutral-900 border border-neutral-800 placeholder-neutral-600 text-neutral-100 focus:outline-none focus:border-neutral-600 focus:bg-neutral-950 transition-all duration-200"
          />
        </div>
      </div>
    </div>

    <!-- Threads list section -->
    <div class="threads min-h-[16.5rem] py-4">
      <div
        v-for="thread in paginatedThreads"
        :key="thread.id"
      >
        <template v-if="!isPlaceholderThread(thread)">
          <Thread
            :thread="thread"
            @chat-click="actor.send({ type: 'OPEN_THREAD_CHAT', threadId: thread.id })"
            @select="actor.send({ type: 'SELECT_THREAD', id: thread.id })"
            @status-change="(id, status) => actor.send({ type: 'UPDATE_THREAD_STATUS', id, status })"
          />
        </template>
        <template v-else>
          <div
            class="flex h-[2.75rem] w-full items-center justify-between overflow-hidden rounded-md bg-neutral-900/10 border border-neutral-900/20"
          ></div>
        </template>
      </div>
    </div>
    <!-- Pagination -->
    <div class="mx-auto">
      <Pagination
        :total="threads.length"
        :items-per-page="threadsPerPage"
        @page-changed="page => currentPage = page"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, type Ref } from 'vue'
import { Search, Plus } from 'lucide-vue-next'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import Button from '@/core/design/button.vue'
import Pagination from '@/core/design/pagination.vue'
import Thread from './thread.vue'
import { id, type ThreadsState, type ThreadListItem } from '@/plugins/threads/state'

const actor: ThreadsState = applicationState.system.get(id)
const threads = useSelector(actor, s => s.context.threads)
const threadsPerPage = 6
const currentPage = ref(1)

const paginatedThreads = computed(() => {
  const start = (currentPage.value - 1) * threadsPerPage
  const slicedThreads = threads.value.slice(start, start + threadsPerPage)
  
  // Add placeholder threads if needed
  const placeholders = Array(threadsPerPage - slicedThreads.length).fill(null).map((_, i) => ({
    id: `placeholder-${i}`,
    isPlaceholder: true
  }))
  
  return [...slicedThreads, ...placeholders]
})

const searchKeyword = ref('');

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function isPlaceholderThread(thread: any): thread is { id: string; isPlaceholder: boolean } {
  return thread.isPlaceholder === true;
}
</script>

<style lang="scss">
@keyframes highlight {
  0% {
    background-color: rgba(99, 102, 241, 0.1);
    box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3);
  }
  100% {
    background-color: transparent;
    box-shadow: none;
  }
}

.animate-highlight {
  animation: highlight 1.5s ease-out forwards;
}
</style>
