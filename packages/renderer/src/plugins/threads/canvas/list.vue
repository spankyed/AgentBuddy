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
        <!-- View toggle buttons -->
        <div class="flex gap-1 pr-3 border-r border-neutral-700">
          <Button
            @click="actor.send({ type: 'VIEW_LIST' })"
            type="button"
            :variant="isListView ? 'secondary' : 'transparent'"
            class="!text-sm !px-2.5 !py-1.5"
            title="List View"
          >
            <LayoutList :size="16" />
          </Button>
          <Button
            @click="actor.send({ type: 'VIEW_KANBAN' })"
            type="button"
            :variant="isKanbanView ? 'secondary' : 'transparent'"
            class="!text-sm !px-2.5 !py-1.5"
            title="Kanban Board"
          >
            <LayoutGrid :size="16" />
          </Button>
        </div>
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
          data-onboarding-id="thread-create-button"
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
              <th class="px-6 py-3">Label</th>
              <th class="px-6 py-3">Tags</th>
              <th class="px-6 py-3">Status</th>
              <th class="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="p-6">
            <ThreadRow
              v-for="thread in paginatedThreads"
              :key="thread.id"
              :thread="thread"
              :available-tags="availableTags"
              :settings="settings"
              @select="actor.send({ type: 'SELECT_THREAD', id: $event })"
              @status-change="(id, status) => actor.send({ type: 'UPDATE_THREAD_STATUS', id, status })"
              @chat-click="(threadId) => actor.send({ type: 'OPEN_THREAD_CHAT', threadId })"
              @delete-click="handleDeleteThread"
            />
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
        @page-changed="(page: number) => currentPage = page"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Plus, Filter, MessageCircleMore, LayoutList, LayoutGrid } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import Button from '@/core/components/design/button.vue'
import Pagination from '@/core/components/design/pagination.vue'
import ThreadRow from './list/thread-row.vue'
import { id, type ThreadsState } from '@/plugins/threads/state'

const actor: ThreadsState = applicationState.system.get(id)
const threads = useSelector(actor, s => s.context.threads)
const settings = useSelector(actor, s => s.context.settings)
const availableTags = useSelector(actor, s => s.context.availableTags)
const currentState = useSelector(actor, s => s.value)
const isListView = computed(() => currentState.value === 'list')
const isKanbanView = computed(() => currentState.value === 'kanban')
const threadsPerPage = 6
const currentPage = ref(1)

const paginatedThreads = computed(() => {
  const start = (currentPage.value - 1) * threadsPerPage
  return threads.value.slice(start, start + threadsPerPage)
})

const searchKeyword = ref('');

const handleDeleteThread = (threadId: string) => {
  const thread = threads.value.find(t => t.id === threadId);
  if (!thread) return;

  const confirmed = confirm(`Are you sure you want to delete thread "${thread.topic || 'Untitled'}"? This will permanently delete all messages and other data associated .`);

  if (confirmed) {
    actor.send({ type: 'DELETE_THREAD', threadId });
  }
};
</script>
