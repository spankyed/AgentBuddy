<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
      <!-- Left section: Title and subtitle -->
      <div class="flex items-center gap-6">
        <div>
          <p class="text-sm text-neutral-400">Manage your conversation threads</p>
        </div>
      </div>
      
      <!-- Right section: Search and New Thread button -->
      <div class="flex items-center gap-3">
                <!-- Filter buttons -->
                <div class="flex gap-2">
          <Button
            type="button"
            variant="transparent"
            class="!text-sm !px-3 !py-1.5"
          >
            <Filter :size="14" />
            <span>Filter</span>
          </Button>
          <Button
            type="button"
            variant="transparent"
            class="!text-sm !px-3 !py-1.5"
          >
            <span>Clear filters</span>
            <span v-if="5 > 0" class="ml-1 text-neutral-500">
              ({{ 5 }})
            </span>
          </Button>
        </div>
        <!-- Search input -->
        <div class="relative">
          <Search class="absolute w-4 h-4 -translate-y-1/2 left-3 top-1/2 text-neutral-500" />
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="Search threads..."
            class="w-64 px-10 py-1.5 text-sm transition-all duration-200 border rounded-md bg-neutral-800 border-neutral-700 placeholder-neutral-600 text-neutral-100 focus:outline-none focus:border-neutral-600 focus:bg-neutral-800"
          />
        </div>
        
        <Button
          @click="actor.send({ type: 'SHOW_CREATE_FORM' })"
          type="button"
          variant="primary"
        >
          <Plus class="w-4 h-4" />
          <span>New Thread</span>
        </Button>
      </div>
    </div>

    <!-- Threads Table -->
    <div class="flex-1 overflow-hidden">
      <div v-if="threads.length > 0" class="h-full overflow-y-auto custom-scrollbar">
        <table class="w-full">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="text-xs font-medium tracking-wider text-left uppercase border-b text-neutral-400 border-neutral-800">
              <th class="px-6 py-3">ID</th>
              <th class="px-6 py-3">Topic</th>
              <th class="px-6 py-3">Status</th>
              <th class="px-6 py-3">Tags</th>
              <th class="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800">
            <tr
              v-for="thread in paginatedThreads"
              :key="thread.id"
              :class="[
                'transition-all duration-200 cursor-pointer group hover:bg-neutral-800',
                { 'animate-highlight': thread.isNew }
              ]"
              @click="actor.send({ type: 'SELECT_THREAD', id: thread.id })"
            >
              <td class="px-6 py-4">
                <span class="text-xs font-medium tracking-wider uppercase text-neutral-500">
                  {{ thread.shortCode }}
                </span>
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="flex items-center justify-center w-8 h-8 transition-colors rounded-lg bg-neutral-800 group-hover:bg-neutral-700">
                    <MessageCircleMore class="w-4 h-4 text-neutral-400" />
                  </div>
                  <span class="font-medium text-neutral-100 line-clamp-1" :title="thread.topic || 'Untitled thread'">
                    {{ thread.topic || 'Untitled thread' }}
                  </span>
                </div>
              </td>
              <td class="px-6 py-4">
                <select
                  @click.stop
                  :value="thread.status"
                  @change="(e) => actor.send({ type: 'UPDATE_THREAD_STATUS', id: thread.id, status: (e.target as HTMLSelectElement).value as ThreadEntity['status'] })"
                  class="px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 focus:outline-none focus:border-neutral-600 transition-all duration-200"
                >
                  <option value="draft">Draft</option>
                  <option value="queued">Queued</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </td>
              <td class="px-6 py-4">
                <div class="flex gap-2 overflow-hidden">
                  <span
                    v-for="tag in thread.tags"
                    :key="tag.id"
                    class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 truncate"
                  >
                    {{ tag.name }}
                  </span>
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center justify-end gap-2">
                  <button
                    @click.stop="actor.send({ type: 'OPEN_THREAD_CHAT', threadId: thread.id })"
                    type="button"
                    class="p-1.5 text-neutral-400 transition-all duration-200 rounded-md hover:text-blue-400 hover:bg-blue-400/10 active:scale-95"
                    aria-label="Open chat"
                    title="Open chat"
                  >
                    <MessageCircleMore class="w-4 h-4"/>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="flex flex-col items-center justify-center h-full"
      >
        <div class="flex flex-col items-center max-w-sm text-center">
          <div class="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-neutral-800">
            <MessageCircleMore class="w-8 h-8 text-neutral-500" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-neutral-100">No threads yet</h3>
          <p class="mb-6 text-sm text-neutral-400">
            Create your first thread to start a conversation
          </p>
          <Button @click="actor.send({ type: 'SHOW_CREATE_FORM' })" variant="primary">
            <Plus class="w-4 h-4" />
            <span>Create Your First Thread</span>
          </Button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="threads.length > threadsPerPage" class="px-6 py-4 border-t border-neutral-800">
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
import { Search, Plus, Filter, MessageCircleMore } from 'lucide-vue-next'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import Button from '@/core/design/button.vue'
import Pagination from '@/core/design/pagination.vue'
import { id, type ThreadsState, type ThreadListItem } from '@/plugins/threads/state'
import type { ThreadEntity } from '@abuddy/api'

const actor: ThreadsState = applicationState.system.get(id)
const threads = useSelector(actor, s => s.context.threads)
const threadsPerPage = 6
const currentPage = ref(1)

const paginatedThreads = computed(() => {
  const start = (currentPage.value - 1) * threadsPerPage
  return threads.value.slice(start, start + threadsPerPage)
})

const searchKeyword = ref('');
</script>

<style lang="scss">
@keyframes highlight {
  0% {
    background-color: rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.3);
  }
  100% {
    background-color: transparent;
    border-color: transparent;
  }
}

.animate-highlight {
  animation: highlight 2s ease-out forwards;
}
</style>
