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
        
        <ContextMenuRoot>
          <ContextMenuTrigger as-child>
            <div class="inline-block">
              <Button
                @click="actor.send({ type: 'SHOW_CREATE_FORM' })"
                type="button"
                variant="primary"
              >
                <Plus class="w-4 h-4" />
                <span>New Thread</span>
              </Button>
            </div>
          </ContextMenuTrigger>
          
          <ContextMenuPortal>
            <ContextMenuContent
              class="min-w-[220px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
            >
              <ContextMenuItem
                @select="actor.send({ type: 'SHOW_CREATE_FORM' })"
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
                @select="actor.send({ type: 'SHOW_CREATE_FORM_AS_CHILD', parentThreadId: projectThread.id })"
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

    <!-- Threads Table -->
    <div class="flex-1 overflow-hidden">
      <div v-if="threads.length > 0" class="h-full overflow-y-auto custom-scrollbar">
        <table class="w-full">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="text-xs font-medium tracking-wider text-left uppercase border-b text-neutral-400 border-neutral-800">
              <th class="px-6 py-3">Code</th>
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
                  class="px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 focus:outline-none focus:border-neutral-600 transition-all duration-200 appearance-none"
                >
                  <option value="backlog" class="bg-neutral-800 text-neutral-300">Backlog</option>
                  <option value="open" class="bg-neutral-800 text-neutral-300">Open</option>
                  <option value="in-progress" class="bg-neutral-800 text-neutral-300">In Progress</option>
                  <option value="in-review" class="bg-neutral-800 text-neutral-300">In Review</option>
                  <option value="done" class="bg-neutral-800 text-neutral-300">Done</option>
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
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import Button from '@/core/design/button.vue'
import Pagination from '@/core/design/pagination.vue'
import { id, type ThreadsState, type ThreadListItem } from '@/plugins/threads/state'
import type { ThreadEntity } from '@app/api'
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
} from 'reka-ui'

const actor: ThreadsState = applicationState.system.get(id)
const threads = useSelector(actor, s => s.context.threads)
const threadsPerPage = 6
const currentPage = ref(1)

const paginatedThreads = computed(() => {
  const start = (currentPage.value - 1) * threadsPerPage
  return threads.value.slice(start, start + threadsPerPage)
})

const recentProjectThreads = computed(() => {
  return threads.value
    .filter(thread => thread.threadType === 'project')
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 10) // Show up to 10 most recent project threads
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
