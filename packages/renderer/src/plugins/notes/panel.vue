<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700"
      @dragover.prevent="handleRootDragOver"
      @drop="handleRootDrop"
    >
      <span class="text-sm font-medium text-neutral-300">Notes</span>
      <div class="flex items-center gap-0.5">
        <DropdownMenuRoot v-model:open="dropdownOpen">
          <DropdownMenuTrigger as-child>
            <button
              class="flex items-center justify-center w-6 h-6 text-neutral-400 hover:text-neutral-200 transition-colors rounded"
              title="More actions"
              @click.stop
            >
              <MoreHorizontal :size="16" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[140px] z-50"
              :side-offset="4"
            >
              <DropdownMenuItem
                v-for="item in createMenuItems"
                :key="item.label"
                class="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-neutral-700 transition-colors cursor-pointer"
                :class="item.class"
                @select="item.action"
              >
                <component :is="item.icon" :size="14" class="shrink-0" :class="item.iconClass || 'text-neutral-500'" />
                {{ item.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <button
          class="flex items-center justify-center w-6 h-6 text-neutral-400 hover:text-neutral-200 transition-colors rounded"
          title="New Note"
          @click="handleCreateNote()"
        >
          <Plus :size="16" />
        </button>
      </div>
    </div>

    <!-- Tree -->
    <div
      class="flex-1 overflow-y-auto p-3 px-2"
      @click="handleOutsideClick"
      @dragover.prevent="handleRootDragOver"
      @drop="handleRootDrop"
    >
      <div v-if="rootNotes.length === 0" class="px-3 py-4 text-sm text-neutral-500 text-center">
        No notes yet
      </div>
      <NoteTreeItem
        v-for="note in rootNotes"
        :key="note.id"
        :note="note"
        :all-notes="notes"
        :current-note-id="currentNoteId"
        :expanded-node-ids="expandedNodeIds"
        :depth="0"
        :get-item-class="getItemClass"
        :drop-indicator-note-id="dropIndicator?.noteId ?? null"
        :drop-indicator-position="dropIndicator?.position ?? null"
        @select="handleSelectNote"
        @toggle-expand="handleToggleExpand"
        @create="handleCreateNote"
        @delete="handleDeleteNote"
        @update-icon="handleUpdateIcon"
        @toggle-select="handleToggleSelect"
        @shift-select="handleShiftSelect"
        @drag-start="handleDragStart"
        @drag-over="handleDragOver"
        @drag-leave="handleDragLeave"
        @drop="(e: DragEvent, id: string) => handleDrop(e, id)"
        @drag-end="handleDragEnd"
        @create-task="handleCreateTask"
        @open="handleOpenNote"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { id, type NotesState } from './state'
import { applicationState } from '@/main'
import NoteTreeItem from './components/NoteTreeItem.vue'
import { Plus, ListChecks, MoreHorizontal } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'reka-ui'
import { useNoteTreeDragDrop } from './composables/useNoteTreeDragDrop'
import type { MenuItem } from '@/core/composables/useContextMenu'

const actor: NotesState = applicationState.system.get(id)

const dropdownOpen = ref(false)

const createMenuItems = computed<MenuItem[]>(() => [
  { label: 'New Task List', icon: ListChecks, class: 'text-neutral-300', action: () => handleCreateTaskList() },
])
const notes = useSelector(actor, (s) => s.context.notes)
const currentNoteId = useSelector(actor, (s) => s.context.currentNoteId)
const expandedNodeIds = useSelector(actor, (s) => s.context.expandedNodeIds)
const selectedNoteIds = useSelector(actor, (s) => s.context.selectedNoteIds)

const rootNotes = computed(() =>
  notes.value
    .filter(n => !n.parentId)
    .sort((a, b) => a.displayOrder - b.displayOrder)
)

const {
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  cancelDragLeave,
  getItemClass,
  dropIndicator,
} = useNoteTreeDragDrop({
  notes,
  selectedNoteIds,
  currentNoteId,
  onMove: (noteIds, newParentId) => {
    actor.send({ type: 'NOTE.MOVE', noteIds, newParentId })
  },
  onReorder: (noteId, newParentId, newIndex) => {
    actor.send({ type: 'NOTE.REORDER', noteId, newParentId, newIndex })
  },
})

const visibleNodeIds = computed(() => {
  const result: string[] = []
  function walk(parentId: string | null) {
    const children = notes.value
      .filter(n => (n.parentId ?? null) === parentId)
      .sort((a, b) => a.displayOrder - b.displayOrder)
    for (const child of children) {
      result.push(child.id)
      if (expandedNodeIds.value.includes(child.id)) {
        walk(child.id)
      }
    }
  }
  walk(null)
  return result
})

function handleShiftSelect(noteId: string) {
  const visible = visibleNodeIds.value
  const anchor = currentNoteId.value
  if (!anchor) {
    handleSelectNote(noteId)
    return
  }
  const anchorIdx = visible.indexOf(anchor)
  const targetIdx = visible.indexOf(noteId)
  if (anchorIdx === -1 || targetIdx === -1) {
    handleSelectNote(noteId)
    return
  }
  const start = Math.min(anchorIdx, targetIdx)
  const end = Math.max(anchorIdx, targetIdx)
  const rangeIds = visible.slice(start, end + 1)
  actor.send({ type: 'NOTE.RANGE_SELECT', noteIds: rangeIds })
}

function handleSelectNote(noteId: string) {
  actor.send({ type: 'NOTE.SELECT', noteId })
}

function handleOpenNote(noteId: string) {
  actor.send({ type: 'NOTE.OPEN', noteId })
}

function handleToggleSelect(noteId: string) {
  actor.send({ type: 'NOTE.TOGGLE_SELECT', noteId })
}

function handleToggleExpand(nodeId: string) {
  actor.send({ type: 'NOTE.TOGGLE_EXPAND', nodeId })
}

function handleCreateNote(parentId?: string) {
  actor.send({ type: 'NOTE.CREATE', parentId })
}

function handleCreateTaskList() {
  actor.send({ type: 'NOTE.CREATE_TASKLIST' })
}

function handleCreateTask(parentId: string) {
  actor.send({ type: 'TASK.CREATE', parentId })
}

function handleDeleteNote(noteId: string) {
  actor.send({ type: 'NOTE.DELETE', noteId })
}

function handleUpdateIcon(noteId: string, icon: string | null) {
  actor.send({ type: 'NOTE.UPDATE_ICON', noteId, icon })
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-note-tree-item]')) {
    actor.send({ type: 'NOTE.CLEAR_SELECTION' })
  }
}

function handleRootDragOver(e: DragEvent) {
  cancelDragLeave()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function handleRootDrop(e: DragEvent) {
  handleDrop(e, null)
}
</script>
