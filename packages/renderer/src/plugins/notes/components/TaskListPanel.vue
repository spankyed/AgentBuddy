<template>
  <div class="flex flex-col h-full w-[250px] min-w-[250px] border-r border-neutral-800">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
      <button
        class="flex items-center gap-1.5 text-sm font-medium transition-colors rounded px-1 -ml-1"
        :class="!selectedTaskId ? 'text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'"
        @click="$emit('deselect-task')"
      >
        <span v-if="currentNoteIcon" class="text-sm leading-none shrink-0">{{ currentNoteIcon }}</span>
        <ListChecks v-else :size="14" class="text-neutral-500 shrink-0" />
        <span class="truncate">{{ currentNoteTitle || 'Untitled' }}</span>
      </button>
      <div class="flex items-center gap-1">
        <button
          class="flex items-center justify-center w-6 h-6 rounded transition-colors"
          :class="showCompleted ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-600 hover:text-neutral-400'"
          :title="showCompleted ? 'Hide completed' : 'Show completed'"
          @click="$emit('toggle-show-completed')"
        >
          <Eye v-if="showCompleted" :size="14" />
          <EyeOff v-else :size="14" />
        </button>
        <button
          class="flex items-center justify-center w-6 h-6 text-neutral-400 hover:text-neutral-200 transition-colors rounded"
          title="Add task"
          @click="$emit('create-task')"
        >
          <Plus :size="16" />
        </button>
      </div>
    </div>

    <!-- Task list -->
    <div
      class="flex-1 overflow-y-auto py-1"
      @dragover.prevent="handleRootDragOver"
      @drop="handleRootDrop"
    >

      <!-- Incomplete tasks -->
      <NoteTreeItem
        v-for="task in incompleteTasks"
        :key="task.id"
        :note="task"
        :all-notes="allNotes"
        :current-note-id="selectedTaskId"
        :expanded-node-ids="expandedNodeIds"
        :depth="0"
        :get-item-class="getItemClass"
        :task-mode="true"
        :drop-indicator-note-id="dropIndicator?.noteId ?? null"
        :drop-indicator-position="dropIndicator?.position ?? null"
        @select="(id: string) => $emit('select-task', id)"
        @toggle-expand="(nodeId: string) => $emit('toggle-expand', nodeId)"
        @delete="(id: string) => $emit('delete-task', id)"
        @toggle-complete="(id: string) => $emit('toggle-complete', id)"
        @create-task="(parentId: string) => $emit('create-task-child', parentId)"
        @drag-start="handleDragStart"
        @drag-over="handleDragOver"
        @drag-leave="handleDragLeave"
        @drop="handleDrop"
        @drag-end="handleDragEnd"
      />

      <!-- Completed section -->
      <template v-if="showCompleted && completedTasks.length > 0">
        <div v-if="incompleteTasks.length > 0" class="border-b border-neutral-800/50 mx-3 my-1" />
        <NoteTreeItem
          v-for="task in completedTasks"
          :key="task.id"
          :note="task"
          :all-notes="allNotes"
          :current-note-id="selectedTaskId"
          :expanded-node-ids="expandedNodeIds"
          :depth="0"
          :get-item-class="getItemClass"
          :task-mode="true"
          :muted="true"
          :drop-indicator-note-id="dropIndicator?.noteId ?? null"
          :drop-indicator-position="dropIndicator?.position ?? null"
          @select="(id: string) => $emit('select-task', id)"
          @toggle-expand="(nodeId: string) => $emit('toggle-expand', nodeId)"
          @delete="(id: string) => $emit('delete-task', id)"
          @toggle-complete="(id: string) => $emit('toggle-complete', id)"
          @create-task="(parentId: string) => $emit('create-task-child', parentId)"
          @drag-start="handleDragStart"
          @drag-over="handleDragOver"
          @drag-leave="handleDragLeave"
          @drop="handleDrop"
          @drag-end="handleDragEnd"
        />
      </template>

      <!-- Empty state -->
      <div v-if="incompleteTasks.length === 0 && (!showCompleted || completedTasks.length === 0)" class="px-3 py-4 text-xs text-neutral-500 text-center">
        No tasks yet
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NoteDTO } from '@app/api'
import { Plus, ListChecks, Eye, EyeOff } from 'lucide-vue-next'
import NoteTreeItem from './NoteTreeItem.vue'
import { useNoteTreeDragDrop } from '../composables/useNoteTreeDragDrop'

const props = defineProps<{
  tasks: NoteDTO[]
  allNotes: NoteDTO[]
  selectedTaskId: string | null
  expandedNodeIds: string[]
  currentNoteId: string | null
  currentNoteTitle: string
  currentNoteIcon: string | null
  showCompleted: boolean
}>()

const emit = defineEmits<{
  (e: 'select-task', taskId: string): void
  (e: 'deselect-task'): void
  (e: 'create-task'): void
  (e: 'create-task-child', parentId: string): void
  (e: 'delete-task', taskId: string): void
  (e: 'toggle-complete', taskId: string): void
  (e: 'toggle-show-completed'): void
  (e: 'toggle-expand', nodeId: string): void
  (e: 'move-task', noteIds: string[], newParentId: string | null): void
  (e: 'reorder-task', noteId: string, newParentId: string | null, newIndex: number): void
}>()

const { handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd, getItemClass, dropIndicator } =
  useNoteTreeDragDrop({
    notes: computed(() => props.allNotes),
    selectedNoteIds: ref([]),
    currentNoteId: computed(() => props.selectedTaskId),
    onMove: (noteIds, newParentId) => emit('move-task', noteIds, newParentId),
    onReorder: (noteId, newParentId, newIndex) => emit('reorder-task', noteId, newParentId, newIndex),
  })

function handleRootDragOver(e: DragEvent) {
  e.dataTransfer!.dropEffect = 'move'
}

function handleRootDrop(e: DragEvent) {
  handleDrop(e, props.currentNoteId)
}

const incompleteTasks = computed(() =>
  props.tasks
    .filter(t => !t.completed)
    .sort((a, b) => a.displayOrder - b.displayOrder)
)

const completedTasks = computed(() =>
  props.tasks
    .filter(t => t.completed)
    .sort((a, b) => a.displayOrder - b.displayOrder)
)
</script>
