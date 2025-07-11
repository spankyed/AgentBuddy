<script setup lang="ts">
import { ref } from 'vue'
import { ArrangeableList, DropZone, type MovingItem } from 'vue-arrange'
import { applicationState } from '@/app'
import { id as threadsId } from '@/plugins/agent/state.ts'
import type { ArtifactItem } from '../../../types';

defineProps<{
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
  backlog: 'grey',
  inProgress: 'red',
  inReview: 'yellow',
  inactive: 'grey',
  done: 'green',
}

const SECTION_ORDER = ['backlog', 'inProgress', 'inReview', 'inactive', 'done'] as const

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

// Seed one mock card into Backlog
const items = ref<WorkItem[]>([
  {
    id: 8,
    name: 'take out the trash',
    time: '16:16',
    date: '31.01.2023',
    priority: 3,
    tags: ['home', 'chores'],
    status: 'active',
    type: 'work-item',
    listId: lists.value[0].id, // Backlog
    index: 0,
  },
])

/* -------------------------------------------------------------------------- */
/*  Drag‑&‑drop config                                                        */
/* -------------------------------------------------------------------------- */

const dropGroup = Symbol('kanban-group')
const trashBin = Symbol('trash-bin')

const arrangeableOptions = {
  hoverClass: 'opacity-90 cursor-grabbing drop-shadow-[0_10px_15px_rgba(0,0,0,0.75)]',
    // 'opacity-70 cursor-grabbing drop-shadow-[0_10px_15px_rgba(0,0,0,0.75)] scale-110 -rotate-3',
  pickedItemClass: 'opacity-70',
}

/* -------------------------------------------------------------------------- */
/*  XState integration                                                         */
/* -------------------------------------------------------------------------- */

const threadsActor = applicationState.system.get(threadsId)

function onCardClick(item: WorkItem) {
  threadsActor.send({ type: 'SELECT_THREAD', id: String(item.id) })
}

/* -------------------------------------------------------------------------- */
/*  DnD handlers                                                               */
/* -------------------------------------------------------------------------- */

function dropItem<T extends KanbanList | WorkItem>(moving: MovingItem<T>) {
  const targetTable = 'listId' in moving.payload ? items : lists

  // no drop target => revert
  if (!moving.destination) return

  // delete if dropped on trash
  if (moving.destination.identifier === trashBin) {
    const payloadId = moving.payload.id
    if ('listId' in moving.payload) {
      items.value = items.value.filter(r => r.id !== payloadId)
    } else {
      lists.value = lists.value.filter(r => r.id !== payloadId)
    }
    return
  }

  // Re‑index destination items and update listId (for cards)
  if (moving.destination.listItems) {
    moving.destination.listItems.forEach((itm, idx) => {
      (itm as any).index = idx
      if ('listId' in itm) (itm as WorkItem).listId = moving.destination!.identifier as symbol
    })
  }

  // Keep table array sorted by index
  targetTable.value.sort((a: any, b: any) => a.index - b.index)
}
</script>

<template>
  <main class="flex flex-row items-start flex-grow py-2 overflow-auto">
    <!-- Outer list = lists/columns -->
    <ArrangeableList
      :list="lists"
      identifier="lists"
      class="flex flex-row items-start gap-3 px-2"
      :options="{ ...arrangeableOptions, handle: 'listHandle' }"
      :targets="[trashBin, 'lists']"
      @drop-item="dropItem"
    >
      <template #default="{ item: list }">
        <section
          class="w-64 border rounded-lg shrink-0 border-neutral-700 bg-neutral-900"
        >
          <!-- column header -->
          <header
            class="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-gray-800 text-neutral-200"
          >
            <span data-handle="listHandle" class="select-none cursor-grab">&#x2630;</span>
            <input
              class="w-full bg-transparent outline-none"
              :value="list.name"
              @change="(e) => (list.name = (e.target as HTMLInputElement).value)"
            />
          </header>

          <!-- inner list = cards -->
          <ArrangeableList
            :identifier="list.id"
            :group="dropGroup"
            :targets="[trashBin, dropGroup]"
            :list="items.filter(({ listId }) => listId === list.id)"
            class="min-h-[4rem] p-3 space-y-2"
            :options="arrangeableOptions"
            @drop-item="dropItem"
          >
            <template #default="{ item: card }">
              <article
                class="p-2 rounded cursor-pointer bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
                @click="onCardClick(card)"
              >
                <p class="text-sm font-medium leading-tight line-clamp-2">{{ card.name }}</p>
                <p class="mt-0.5 text-xs text-neutral-400">{{ card.date }} • {{ card.time }}</p>
              </article>
            </template>
          </ArrangeableList>
        </section>
      </template>
    </ArrangeableList>

    <!-- Trash -->
    <DropZone
      :identifier="trashBin"
      :group="dropGroup"
      v-slot="{ isHovering }"
      class="flex items-center mx-4"
    >
      <div
        class="flex items-center justify-center transition-all h-36 w-36 text-neutral-500 hover:text-red-500"
        :class="isHovering ? 'text-8xl' : 'text-7xl'"
      >
        🗑️
      </div>
    </DropZone>
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