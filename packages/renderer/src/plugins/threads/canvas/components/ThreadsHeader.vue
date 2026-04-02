<template>
  <div class="@container flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
    <!-- Left section: Title and subtitle -->
    <div class="hidden @4xl:flex items-center gap-6">
      <div class="flex items-center gap-2">
        <History class="w-4 h-4 text-neutral-500" />
        <p class="text-sm text-neutral-400">Manage agent threads</p>
      </div>
    </div>

    <!-- Right section: Search and New Thread button -->
    <div class="flex items-center gap-3 flex-1 min-w-0 justify-end">
      <!-- View toggle buttons -->
      <div class="flex gap-1 pr-3 border-r border-neutral-700 flex-shrink-0">
        <button
          @click="actor.send({ type: 'VIEW_LIST' })"
          class="p-1.5 rounded-md transition-colors"
          :class="isListView
            ? 'bg-neutral-700 text-neutral-100'
            : 'text-neutral-400 hover:text-neutral-200'"
          title="List View"
        >
          <LayoutList :size="16" />
        </button>
        <button
          @click="actor.send({ type: 'VIEW_KANBAN' })"
          class="p-1.5 rounded-md transition-colors"
          :class="isKanbanView
            ? 'bg-neutral-700 text-neutral-100'
            : 'text-neutral-400 hover:text-neutral-200'"
          title="Kanban Board"
        >
          <LayoutGrid :size="16" />
        </button>
      </div>
      <!-- Filter buttons -->
      <div class="flex gap-2 flex-shrink-0 whitespace-nowrap">
        <FilterPopover
          :statuses="statuses"
          :tags="availableTags"
          :selected-statuses="filters.statuses"
          :selected-tags="filters.tags"
          @toggle-status="(s) => actor.send({ type: 'TOGGLE_FILTER_STATUS', status: s })"
          @toggle-tag="(t) => actor.send({ type: 'TOGGLE_FILTER_TAG', tag: t })"
        >
          <Button
            type="button"
            variant="transparent"
            class="!text-sm !px-3 !py-1.5"
          >
            <Filter :size="14" />
            <span>Filter</span>
          </Button>
        </FilterPopover>
        <Button
          v-if="activeFilterCount > 0"
          type="button"
          variant="transparent"
          class="!text-sm !px-3 !py-1.5"
          @click="actor.send({ type: 'CLEAR_FILTERS' })"
        >
          <span>Clear filters</span>
          <span class="ml-1 text-neutral-500">
            ({{ activeFilterCount }})
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
          class="w-32 @3xl:w-64 px-10 py-1.5 text-sm transition-all duration-200 border rounded-md bg-neutral-800 border-neutral-700 placeholder-neutral-600 text-neutral-100 focus:outline-none focus:border-neutral-600 focus:bg-neutral-800"
        />
      </div>

      <Button
        @click="actor.send({ type: 'SHOW_CREATE_FORM' })"
        type="button"
        variant="primary"
        class="whitespace-nowrap flex-shrink-0"
        data-onboarding-id="thread-create-button"
      >
        <span>New Thread</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search, Filter, LayoutList, LayoutGrid, History } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import Button from '@/core/components/design/button.vue'
import FilterPopover from './FilterPopover.vue'
import { id, type ThreadsState } from '@/plugins/threads/state'

const actor: ThreadsState = applicationState.system.get(id)
const currentState = useSelector(actor, s => s.value)
const isListView = computed(() => currentState.value === 'list')
const isKanbanView = computed(() => currentState.value === 'kanban')

const filters = useSelector(actor, s => s.context.filters)
const settings = useSelector(actor, s => s.context.settings)
const availableTags = useSelector(actor, s => s.context.availableTags)

const statuses = computed(() => settings.value?.statuses || [])

const activeFilterCount = computed(() =>
  filters.value.statuses.length + filters.value.tags.length + (filters.value.search ? 1 : 0)
)

const searchKeyword = ref('')
let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(searchKeyword, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    actor.send({ type: 'SET_SEARCH', keyword: val })
  }, 200)
})

// Sync search input when filters are cleared externally
watch(() => filters.value.search, (val) => {
  if (val === '' && searchKeyword.value !== '') {
    searchKeyword.value = ''
  }
})
</script>
