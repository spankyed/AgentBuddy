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
      <div v-if="totalPages > 1" class="flex justify-center mt-6">
        <PaginationRoot
          :page="currentPage"
          :itemsPerPage="threadsPerPage"
          :total="threads.length"
          @update:page="val => (currentPage = val)"
        >
          <PaginationList v-slot="{ items }" class="flex items-center gap-1 text-stone-700 dark:text-white">
            <PaginationFirst class="flex items-center justify-center transition bg-transparent rounded-lg w-9 h-9 hover:bg-white dark:hover:bg-stone-700/70 disabled:opacity-50 dark:disabled:opacity-30" :disabled="currentPage === 1">
              <ChevronsRight class="rotate-180" />
            </PaginationFirst>
            <PaginationPrev class="flex items-center justify-center mr-4 transition bg-transparent rounded-lg w-9 h-9 hover:bg-white dark:hover:bg-stone-700/70 disabled:opacity-50 dark:disabled:opacity-30" :disabled="currentPage === 1">
              <ChevronRight class="rotate-180" />
            </PaginationPrev>
            
            <template v-for="(page, index) in items">
              <PaginationListItem
                v-if="page.type === 'page'"
                :key="index"
                class="w-9 h-9 border dark:border-stone-800 rounded-lg data-[selected]:!bg-white dark:data-[selected]:!bg-stone-700 data-[selected]:shadow-sm data-[selected]:text-blackA11 dark:data-[selected]:text-white hover:bg-white dark:hover:bg-stone-700/70 transition"
                :value="page.value"
              >
                {{ page.value }}
              </PaginationListItem>
              <PaginationEllipsis
                v-else
                :key="page.type"
                :index="index"
                class="flex items-center justify-center w-9 h-9"
              >
                &#8230;
              </PaginationEllipsis>
            </template>
            
            <PaginationNext class="flex items-center justify-center ml-4 transition bg-transparent rounded-lg w-9 h-9 hover:bg-white dark:hover:bg-stone-700/70 disabled:opacity-50 dark:disabled:opacity-30" :disabled="currentPage === totalPages">
              <ChevronRight />
            </PaginationNext>
            <PaginationLast class="flex items-center justify-center transition bg-transparent rounded-lg w-9 h-9 hover:bg-white dark:hover:bg-stone-700/70 disabled:opacity-50 dark:disabled:opacity-30" :disabled="currentPage === totalPages">
              <ChevronsRight />
            </PaginationLast>
          </PaginationList>
        </PaginationRoot>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, type Ref } from 'vue'
import { Search, Plus, ChevronRight, ChevronsRight } from 'lucide-vue-next'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import Button   from '@/core/design/button.vue'
import Thread   from './thread.vue'
import { id, type ThreadsState } from '@/plugins/threads/state'
import {
  PaginationRoot, PaginationList, PaginationListItem,
  PaginationEllipsis, PaginationFirst, PaginationLast,
  PaginationNext, PaginationPrev
} from 'reka-ui'

/* ─────────────────────────────
   Composable: generic pagination
   ──────────────────────────── */
function usePagination (
  totalItems: Ref<number>,
  perPage = 6,
  maxButtons = 7,          // incl. ellipses & ends
) {
  const page = ref(1)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(totalItems.value / perPage)),
  )

  const slice = computed<[number, number]>(() => {
    const start = (page.value - 1) * perPage
    return [start, start + perPage]
  })

  const pages = computed<(number | '…')[]>(() => {
    const total = totalPages.value
    if (total <= maxButtons) return Array.from({ length: total }, (_, i) => i + 1)

    const window = maxButtons - 3          // first + last + 2×ellipsis
    const left   = Math.max(2, page.value - Math.floor(window / 2))
    const right  = Math.min(total - 1, left + window - 1)

    const range  = Array.from({ length: right - left + 1 }, (_, i) => left + i)

    return [
      1,
      left > 2 ? '…' : null,
      ...range,
      right < total - 1 ? '…' : null,
      total,
    ].filter(Boolean) as (number | '…')[]
  })

  return { page, totalPages, pages, slice }
}

/* ─────────────────────────────
   Component state
   ──────────────────────────── */
const actor: ThreadsState = applicationState.system.get(id)
const threads            = useSelector(actor, s => s.context.threads)

const threadsPerPage     = 3
const threadCount = computed(() => threads.value.length)
const { page: currentPage, totalPages, pages: visiblePages, slice } =
  usePagination(threadCount, threadsPerPage)

const paginatedThreads = computed(() =>
  threads.value.slice(...slice.value),
)

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