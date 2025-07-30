<script setup lang="ts">
import { ref, watch } from 'vue'
import { ArrangeableList, DropZone, type MovingItem } from 'vue-arrange'
import { applicationState } from '@/app'
import { id as agentId } from '@/plugins/agent/state.ts'
import type { ArtifactItem } from '@abuddy/api';

const props = defineProps<{
  artifact: ArtifactItem;
}>();

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type WorkItem = {
  id: number
  name: string
  time: string
  date: string
  priority: number
  tags: string[]
  status: string
  type: string
  listId: symbol
  index: number
}

type KanbanList = {
  id: symbol
  name: string
  color: string
  index: number
}

/* -------------------------------------------------------------------------- */
/*  Static config                                                              */
/* -------------------------------------------------------------------------- */

const SECTION_COLOR: Record<string, string> = {
  backlog: 'bg-neutral-800 border-b border-neutral-700/50',
  inProgress: 'bg-blue-900/50 border-b border-blue-800/30',
  inReview: 'bg-amber-900/40 border-b border-amber-800/30',
  open: 'bg-neutral-800/80 border-b border-neutral-700/50',
  done: 'bg-emerald-900/40 border-b border-emerald-800/30',
}

const SECTION_ORDER = ['backlog', 'inProgress', 'inReview', 'open', 'done'] as const

/* -------------------------------------------------------------------------- */
/*  State                                                                     */
/* -------------------------------------------------------------------------- */

// Build list meta from section order
const lists = ref<KanbanList[]>(
  SECTION_ORDER.map((key, index) => ({
    id: Symbol(key),
    name: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    color: SECTION_COLOR[key],
    index,
  })),
)

// Map status to list index
const statusToListIndex: Record<string, number> = {
  'backlog': 0,
  'in-progress': 1,
  'inProgress': 1,
  'in-review': 2,
  'inReview': 2,
  'open': 3,
  'done': 4,
}

// Map list index to status
const listIndexToStatus: string[] = ['backlog', 'in-progress', 'in-review', 'open', 'done']

// Initialize items from artifact content
const items = ref<WorkItem[]>([])

// Function to initialize items from artifact data
function initializeItems() {
  if (props.artifact?.content?.workItems) {
    const workItemsByStatus: Record<string, WorkItem[]> = {}
    
    // Group items by status and assign listId
    props.artifact.content.workItems.forEach((item: any) => {
      const listIndex = statusToListIndex[item.status] ?? 0
      const listId = lists.value[listIndex].id
      
      if (!workItemsByStatus[item.status]) {
        workItemsByStatus[item.status] = []
      }
      
      workItemsByStatus[item.status].push({
        ...item,
        listId,
        index: workItemsByStatus[item.status].length,
      })
    })
    
    // Flatten all items into single array
    items.value = Object.values(workItemsByStatus).flat()
  }
}

// Initialize items when component mounts
initializeItems()

// Watch for artifact changes
watch(() => props.artifact, () => {
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
/*  XState integration                                                         */
/* -------------------------------------------------------------------------- */

const agentActor = applicationState.system.get(agentId)

function onCardClick(item: WorkItem) {
  agentActor.send({ type: 'OPEN_THREAD_CHAT', threadId: String(item.id) })
}

/* -------------------------------------------------------------------------- */
/*  DnD handlers                                                               */
/* -------------------------------------------------------------------------- */

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
  
  // If we're moving a work item, update its status in the backend
  if ('listId' in moving.payload && moving.destination) {
    const workItem = moving.payload as WorkItem
    const destinationListId = moving.destination.identifier as symbol
    
    // Find the status for the destination list
    const destinationList = lists.value.find(list => list.id === destinationListId)
    if (destinationList) {
      const newStatus = listIndexToStatus[destinationList.index]
      
      // Send status update event to agent state machine
      const agentActor = applicationState.system.get(agentId)
      agentActor.send({
        type: 'UPDATE_THREAD_STATUS',
        threadId: String(workItem.id),
        status: newStatus as any,
      })
    }
  }
}
</script>

<template>
  <main class="flex-grow p-6 overflow-y-auto bg-transparent">
    <div class="flex h-full gap-4 mx-auto max-w-7xl">
      <!-- Backlog column on the left -->
      <section
        v-for="list in lists.filter(l => l.name.toLowerCase() === 'backlog')"
        :key="list.id"
        class="flex flex-col flex-1 overflow-hidden shadow-sm rounded-xl bg-neutral-800"
      >
        <!-- column header -->
        <header
          class="flex items-center gap-3 px-4 py-2.5 text-sm font-medium"
          :class="list.color"
        >
          <span class="text-sm text-neutral-200">{{ list.name }}</span>
        </header>

        <!-- inner list = cards -->
        <ArrangeableList
          :identifier="list.id"
          :group="dropGroup"
          :targets="[dropGroup]"
          :list="items.filter(({ listId }) => listId === list.id)"
          class="flex-1 p-3 space-y-2 overflow-y-auto"
          :options="arrangeableOptions"
          @drop-item="dropItem"
        >
          <template #default="{ item: card }">
            <article
              class="p-3 transition-all duration-200 border rounded-lg cursor-pointer bg-neutral-900/50 hover:bg-neutral-900/80 border-neutral-800/50 hover:border-neutral-700/50"
              @click="onCardClick(card)"
            >
              <p class="text-sm font-medium leading-snug text-neutral-100">{{ card.name }}</p>
              <div class="flex items-center gap-2 mt-2">
                <span class="text-xs text-neutral-500">{{ card.date }}</span>
                <span class="text-xs text-neutral-600">•</span>
                <span class="text-xs text-neutral-500">{{ card.time }}</span>
              </div>
            </article>
          </template>
        </ArrangeableList>
      </section>
      
      <!-- 2x2 grid for other statuses -->
      <div class="grid grid-cols-2 gap-4 flex-[2]">
        <section
          v-for="list in lists.filter(l => l.name.toLowerCase() !== 'backlog')"
          :key="list.id"
          class="flex flex-col overflow-hidden shadow-sm rounded-xl bg-neutral-800"
        >
          <!-- column header -->
          <header
            class="flex items-center gap-3 px-4 py-2.5 text-sm font-medium"
            :class="list.color"
          >
            <span class="text-sm text-neutral-200">{{ list.name }}</span>
          </header>

          <!-- inner list = cards -->
          <ArrangeableList
            :identifier="list.id"
            :group="dropGroup"
            :targets="[dropGroup]"
            :list="items.filter(({ listId }) => listId === list.id)"
            class="min-h-[6rem] p-3 space-y-2"
            :options="arrangeableOptions"
            @drop-item="dropItem"
          >
            <template #default="{ item: card }">
              <article
                class="p-3 transition-all duration-200 border rounded-lg cursor-pointer bg-neutral-900/50 hover:bg-neutral-900/80 border-neutral-800/50 hover:border-neutral-700/50"
                @click="onCardClick(card)"
              >
                <p class="text-sm font-medium leading-snug text-neutral-100">{{ card.name }}</p>
                <div class="flex items-center gap-2 mt-2">
                  <span class="text-xs text-neutral-500">{{ card.date }}</span>
                  <span class="text-xs text-neutral-600">•</span>
                  <span class="text-xs text-neutral-500">{{ card.time }}</span>
                </div>
              </article>
            </template>
          </ArrangeableList>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>