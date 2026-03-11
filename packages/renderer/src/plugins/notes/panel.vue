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
    <div class="flex-1 overflow-y-auto py-1">
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
        @select="handleSelectNote"
        @toggle-expand="handleToggleExpand"
        @create="handleCreateNote"
        @delete="handleDeleteNote"
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

const actor: NotesState = applicationState.system.get(id)
const notes = useSelector(actor, (s) => s.context.notes)
const currentNoteId = useSelector(actor, (s) => s.context.currentNoteId)
const expandedNodeIds = useSelector(actor, (s) => s.context.expandedNodeIds)

const rootNotes = computed(() =>
  notes.value
    .filter(n => !n.parentId)
    .sort((a, b) => a.displayOrder - b.displayOrder)
)

function handleSelectNote(noteId: string) {
  actor.send({ type: 'NOTE.SELECT', noteId })
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
</script>
