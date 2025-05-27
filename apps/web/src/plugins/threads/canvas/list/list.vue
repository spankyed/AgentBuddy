<template>
  <div class="max-w-5xl px-6 py-4 mx-auto space-y-6">
    <!-- Search & Create row -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
      <button
        @click="actor.send({ type: 'SHOW_CREATE_FORM' })"
        type="button"
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded h-7 bg-primary-600 hover:bg-primary-500"
      >
        <Plus :size="16" class="" />
        New Thread
      </button>
      <div class="flex justify-end flex-1 gap-1 text-sm">
        <!-- <button type="button" class="text-primary-400 hover:underline">Advanced Search</button> -->
        <Button
          type="button"
          variant="transparent"
        >
          Clear filters
        </Button>
        <Button
          type="button"
          variant="transparent"
        >
          Filter
        </Button>
      </div>
      <div class="flex justify-end">
        <!-- Search input -->
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="Search"
          class="px-4 py-2 text-sm rounded-tl rounded-bl w-96 bg-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium text-white rounded-tr rounded-br bg-neutral-700 hover:bg-neutral-600"
        >
          <Search :size="16" class="text-neutral-500" />
        </button>
      </div>


    </div>

    <!-- Threads list section -->
    <div class="threads">
      <div
        v-for="thread in paginatedThreads"
        :key="thread.id"
        :class="[
          'flex items-center justify-between overflow-hidden border rounded-md cursor-pointer bg-neutral-900/80 border-neutral-800',
          { 'animate-highlight': thread.isNew }
        ]"
      >
        <Thread
          :thread="thread"
          @select="actor.send({ type: 'SELECT_THREAD', id: thread.id })"
          @status-change="(id, status) => actor.send({ type: 'UPDATE_THREAD_STATUS', id, status })"
        />
      </div>
      
      <!-- Pagination -->
      <div class="mt-6">
        <Pagination
          :total="threads.length"
          :items-per-page="threadsPerPage"
          @page-changed="page => currentPage = page"
        />
      </div>
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
import { id, type ThreadsState } from '@/plugins/threads/state'



/* ─────────────────────────────
   Component state
   ──────────────────────────── */
const actor: ThreadsState = applicationState.system.get(id)
const threads            = useSelector(actor, s => s.context.threads)

const threadsPerPage = 3
const currentPage = ref(1)

const paginatedThreads = computed(() => {
  const start = (currentPage.value - 1) * threadsPerPage
  return threads.value.slice(start, start + threadsPerPage)
})

const searchKeyword = ref('');


const addDetail = () => {
  // Since we're now using state machine, we should send an event to create a new thread
  actor.send({ type: 'SHOW_CREATE_FORM' });
}
</script>

<style lang="scss">
@keyframes highlight {
  0% {
    background-color: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
  }
  100% {
    background-color: rgba(23, 23, 23, 0.8);
    border-color: rgb(38, 38, 38);
  }
}

.animate-highlight {
  animation: highlight 1s ease-out forwards;
}
</style>