<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrangeableList, type MovingItem } from 'vue-arrange'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState, type ThreadListItem } from '@/plugins/threads/state'
import ThreadsHeader from './components/ThreadsHeader.vue'
// import type { ThreadsSettings } from '@app/api'

const actor: ThreadsState = applicationState.system.get(id)
const threads = useSelector(actor, s => s.context.threads)
const settings = useSelector(actor, s => s.context.settings)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type WorkItem = ThreadListItem & {
  listId: symbol
  index: number
  time: string
  date: string
}

type KanbanList = {
  id: symbol
  name: string
  color: string
  index: number
}

/* -------------------------------------------------------------------------- */
/*  Computed Data                                                             */
/* -------------------------------------------------------------------------- */

// Build lists from settings statuses
const lists = computed<KanbanList[]>(() => {
  if (!settings.value?.statuses || settings.value.statuses.length === 0) {
    // Fallback to default statuses
    return [
      { id: Symbol('backlog'), name: 'Backlog', color: 'bg-neutral-800 border-b border-neutral-700/50', index: 0 },
      { id: Symbol('in-progress'), name: 'In Progress', color: 'bg-blue-900/50 border-b border-blue-800/30', index: 1 },
      { id: Symbol('done'), name: 'Done', color: 'bg-emerald-900/40 border-b border-emerald-800/30', index: 2 },
    ]
  }

  return settings.value.statuses.map((status, index) => ({
    id: Symbol(status.label),
    name: status.label,
    color: `bg-neutral-800 border-b border-neutral-700/50`, // Base color, can be enhanced with status.color
    index,
  }))
})

// Map status label to list index
const statusToListIndex = computed(() => {
  const map: Record<string, number> = {}
  lists.value.forEach((list, index) => {
    map[list.name.toLowerCase().replace(/\s+/g, '-')] = index
    map[list.name] = index
  })
  return map
})

// Initialize items from threads
const items = ref<WorkItem[]>([])

function initializeItems() {
  if (!threads.value || threads.value.length === 0) {
    items.value = []
    return
  }

  const workItemsByStatus: Record<string, WorkItem[]> = {}

  threads.value.forEach((thread) => {
    const status = thread.status || lists.value[0]?.name || 'Backlog'
    const listIndex = statusToListIndex.value[status] ?? statusToListIndex.value[status.toLowerCase().replace(/\s+/g, '-')] ?? 0
    const listId = lists.value[listIndex]?.id || lists.value[0].id

    if (!workItemsByStatus[status]) {
      workItemsByStatus[status] = []
    }

    const timestamp = thread.updatedAt || thread.createdAt || thread.timestamp || Date.now()

    workItemsByStatus[status].push({
      ...thread,
      listId,
      index: workItemsByStatus[status].length,
      time: new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
      date: new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
    })
  })

  items.value = Object.values(workItemsByStatus).flat()
}

// Initialize and watch for changes
initializeItems()
watch([threads, settings], () => {
  initializeItems()
}, { deep: true })

/* -------------------------------------------------------------------------- */
/*  Drag‑&‑drop config                                                        */
/* -------------------------------------------------------------------------- */

const dropGroup = Symbol('kanban-group')

const arrangeableOptions = {
  hoverClass: 'opacity-90 cursor-grabbing shadow-2xl',
  pickedItemClass: 'opacity-70',
}

/* -------------------------------------------------------------------------- */
/*  Event handlers                                                            */
/* -------------------------------------------------------------------------- */

function onCardClick(item: WorkItem) {
  actor.send({ type: 'SELECT_THREAD', id: item.id })
}

async function dropItem<T extends KanbanList | WorkItem>(moving: MovingItem<T>) {
  const targetTable = 'listId' in moving.payload ? items : lists

  // no drop target => revert
  if (!moving.destination) return

  // Re‑index destination items and update listId (for cards)
  if (moving.destination.listItems) {
    moving.destination.listItems.forEach((itm, idx) => {
      (itm as any).index = idx
      if ('listId' in itm) (itm as WorkItem).listId = moving.destination!.identifier as symbol
    })
  }

  // Keep table array sorted by index
  targetTable.value.sort((a: any, b: any) => a.index - b.index)

  // If we're moving a work item, update its status
  if ('listId' in moving.payload && moving.destination) {
    const workItem = moving.payload as WorkItem
    const destinationListId = moving.destination.identifier as symbol

    // Find the status for the destination list
    const destinationList = lists.value.find(list => list.id === destinationListId)
    if (destinationList) {
      const newStatus = destinationList.name

      // Send status update event
      actor.send({
        type: 'UPDATE_THREAD_STATUS',
        id: workItem.id,
        status: newStatus,
      })
    }
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-neutral-900">
    <ThreadsHeader />
    <main class="flex-1 flex flex-col p-6 bg-transparent overflow-hidden">
    <div v-if="lists.length === 0" class="flex items-center justify-center h-full">
      <p class="text-neutral-500">No status columns configured. Please configure thread statuses in settings.</p>
    </div>
    <div v-else class="flex flex-1 gap-4 w-full">
      <section
        v-for="list in lists"
        :key="String(list.id)"
        class="flex flex-col flex-1 overflow-hidden shadow-sm rounded-xl bg-neutral-900 min-h-full border border-neutral-800"
      >
        <!-- column header -->
        <header
          class="flex items-center gap-3 px-4 py-2.5 text-sm font-medium"
          :class="list.color"
        >
          <span class="text-sm text-neutral-200">{{ list.name }}</span>
          <span class="text-xs text-neutral-500">
            ({{ items.filter(({ listId }) => listId === list.id).length }})
          </span>
        </header>

        <!-- inner list = cards -->
        <ArrangeableList
          :identifier="list.id"
          :group="dropGroup"
          :targets="[dropGroup]"
          :list="items.filter(({ listId }) => listId === list.id)"
          class="flex-1 p-3 space-y-2 overflow-y-auto min-h-[6rem]"
          :options="arrangeableOptions"
          @drop-item="dropItem"
        >
          <template #default="{ item: card }">
            <article
              class="p-3 transition-all duration-200 border rounded-lg cursor-pointer bg-neutral-800/50 hover:bg-neutral-800/80 border-neutral-800/50 hover:border-neutral-700/50"
              @click="onCardClick(card)"
            >
              <div class="flex items-start justify-between gap-2 mb-1" :title="`${card.time} • ${card.date}`">
                <p class="text-sm font-medium leading-snug text-neutral-100">
                  {{ card.topic || 'Untitled Thread' }}
                </p>
                <span class="text-xs font-mono text-neutral-500">{{ card.shortCode }}</span>
              </div>
              <!-- <div class="flex items-center gap-2 mt-2">
                <span class="text-xs text-neutral-500">{{ card.date }}</span>
                <span class="text-xs text-neutral-600">•</span>
                <span class="text-xs text-neutral-500">{{ card.time }}</span>
              </div> -->
              <div v-if="card.tags && card.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="tag in card.tags"
                  :key="tag"
                  class="px-2 py-0.5 text-xs rounded-full bg-neutral-700/50 text-neutral-300"
                >
                  {{ tag }}
                </span>
              </div>
            </article>
          </template>
        </ArrangeableList>
      </section>
    </div>
  </main>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
