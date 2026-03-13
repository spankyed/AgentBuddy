<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
      <span class="text-sm font-medium text-neutral-300">Notes</span>
      <button
        class="flex items-center justify-center w-6 h-6 text-neutral-400 hover:text-neutral-200 transition-colors rounded"
        title="New Note"
        @click="handleCreateNote()"
      >
        <Plus :size="16" />
      </button>
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
        :item-class="getItemClass(note.id)"
        :get-item-class="getItemClass"
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
        @drop="handleNoteTreeDrop"
        @drag-end="handleDragEnd"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSelector } from '@xstate/vue'
import { id, type NotesState } from './state'
import { applicationState } from '@/main'
import NoteTreeItem from './components/NoteTreeItem.vue'
import { Plus } from 'lucide-vue-next'
import { useNoteTreeDragDrop } from './composables/useNoteTreeDragDrop'

const actor: NotesState = applicationState.system.get(id)
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
  getItemClass,
} = useNoteTreeDragDrop({
  notes,
  selectedNoteIds,
  currentNoteId,
  onMove: (noteIds, newParentId) => {
    actor.send({ type: 'NOTE.MOVE', noteIds, newParentId })
  },
})

function getVisibleNodeIds(): string[] {
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
}

function handleShiftSelect(noteId: string) {
  const visible = getVisibleNodeIds()
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
  actor.send({ type: 'NOTE.CLEAR_SELECTION' })
  actor.send({ type: 'NOTE.SELECT', noteId })
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

function handleDeleteNote(noteId: string) {
  actor.send({ type: 'NOTE.DELETE', noteId })
}

function handleUpdateIcon(noteId: string, icon: string | null) {
  actor.send({ type: 'NOTE.UPDATE_ICON', noteId, icon })
}

function handleNoteTreeDrop(e: DragEvent, noteId: string) {
  handleDrop(e, noteId)
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('[data-note-tree-item]')) {
    actor.send({ type: 'NOTE.CLEAR_SELECTION' })
  }
}

function handleRootDragOver(e: DragEvent) {
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function handleRootDrop(e: DragEvent) {
  handleDrop(e, null)
}
</script>
