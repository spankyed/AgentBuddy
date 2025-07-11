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
  backlog: 'bg-neutral-700',
  inProgress: 'bg-blue-600',
  inReview: 'bg-yellow-600',
  open: 'bg-neutral-600',
  done: 'bg-green-600',
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

const arrangeableOptions = {
  hoverClass: 'opacity-90 cursor-grabbing shadow-2xl',
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
  <main class="flex-grow p-6 overflow-y-auto bg-neutral-950">
    <div class="flex h-full gap-4 mx-auto max-w-7xl">
      <!-- Backlog column on the left -->
      <section
        v-for="list in lists.filter(l => l.name.toLowerCase() === 'backlog')"
        :key="list.id"
        class="flex flex-col flex-1 overflow-hidden shadow-sm rounded-xl bg-neutral-800"
      >
        <!-- column header -->
        <header
          class="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-white"
          :class="list.color"
        >
          <span class="text-base">{{ list.name }}</span>
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
              class="p-3 transition-colors rounded-lg shadow-sm cursor-pointer bg-neutral-900 hover:bg-neutral-950"
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
            class="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-white"
            :class="list.color"
          >
            <span class="text-base">{{ list.name }}</span>
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
                class="p-3 transition-colors rounded-lg shadow-sm cursor-pointer bg-neutral-900 hover:bg-neutral-950"
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