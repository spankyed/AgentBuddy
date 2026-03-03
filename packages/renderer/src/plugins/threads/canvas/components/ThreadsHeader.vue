<template>
  <div class="flex items-center justify-between gap-4 px-6 py-3 border-b border-neutral-800">
    <!-- Left section: Title and subtitle -->
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-2">
        <History class="w-4 h-4 text-neutral-500" />
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
        <span>New Thread</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Filter, LayoutList, LayoutGrid, History } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import Button from '@/core/components/design/button.vue'
import { id, type ThreadsState } from '@/plugins/threads/state'

const actor: ThreadsState = applicationState.system.get(id)
const currentState = useSelector(actor, s => s.value)
const isListView = computed(() => currentState.value === 'list')
const isKanbanView = computed(() => currentState.value === 'kanban')

const searchKeyword = ref('')
</script>
