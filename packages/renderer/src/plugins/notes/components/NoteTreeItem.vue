<template>
  <div>
    <!-- Node row -->
    <div
      data-note-tree-item
      class="relative flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors group"
      :class="[
        note.id === currentNoteId
          ? taskMode && note.completed ? 'bg-neutral-700 text-neutral-400' : 'bg-neutral-700 text-neutral-100'
          : taskMode && note.completed ? 'text-neutral-600 hover:bg-neutral-800' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
        ownItemClass,
      ]"
      :style="{ paddingLeft: `${depth * INDENT_PX + BASE_PADDING_PX}px` }"
      :draggable="!taskMode"
      @click="handleClick"
      @contextmenu="handleContextMenu"
      @dragstart="$emit('drag-start', $event, note.id)"
      @dragover="$emit('drag-over', $event, note.id)"
      @dragleave="$emit('drag-leave', $event)"
      @drop="$emit('drop', $event, note.id)"
      @dragend="$emit('drag-end')"
    >
      <!-- Note icon / Expand chevron -->
      <EmojiPicker :model-value="note.icon" @update:model-value="(icon: string | null) => $emit('update-icon', note.id, icon)">
        <template #default="{ toggle }">
          <button
            class="flex items-center justify-center w-4 h-4 shrink-0"
            @click.stop="children.length > 0 ? $emit('toggle-expand', note.id) : toggle()"
          >
            <!-- Chevron shown on hover when item has children -->
            <ChevronRight
              v-if="children.length > 0"
              :size="14"
              class="transition-transform hidden group-hover:block text-neutral-500"
              :class="isExpanded ? 'rotate-90' : ''"
            />
            <!-- Note icon shown by default, hidden on hover when item has children -->
            <span
              v-if="note.icon"
              class="text-sm leading-none"
              :class="children.length > 0 ? 'group-hover:hidden' : ''"
            >{{ note.icon }}</span>
            <ListChecks
              v-else-if="note.noteType === 'tasklist'"
              :size="14"
              class="text-neutral-500"
              :class="children.length > 0 ? 'group-hover:hidden' : ''"
            />
            <CircleCheck
              v-else-if="note.noteType === 'task'"
              :size="14"
              class="text-neutral-500"
              :class="children.length > 0 ? 'group-hover:hidden' : ''"
            />
            <FileText
              v-else
              :size="14"
              class="text-neutral-500"
              :class="children.length > 0 ? 'group-hover:hidden' : ''"
            />
          </button>
        </template>
      </EmojiPicker>

      <!-- Title -->
      <span class="truncate flex-1 ml-0.5" :class="note.completed && !taskMode ? 'line-through text-neutral-600' : ''">{{ note.title || 'Untitled' }}</span>

      <!-- Task actions + checkbox (taskMode only) -->
      <template v-if="taskMode">
        <button
          class="hidden group-hover:flex items-center justify-center w-5 h-5 text-neutral-500 hover:text-red-400 rounded transition-colors shrink-0"
          title="Delete task"
          @click.stop="$emit('delete', note.id)"
        >
          <Trash2 :size="12" />
        </button>
        <div class="hidden group-hover:block w-px h-3.5 bg-neutral-600 shrink-0" />
        <button
          class="flex items-center justify-center w-4 h-4 shrink-0 rounded border transition-colors"
          :class="note.completed
            ? 'border-neutral-600 bg-neutral-700'
            : 'border-neutral-500 hover:border-neutral-300'"
          @click.stop="$emit('toggle-complete', note.id)"
        >
          <Check v-if="note.completed" :size="10" class="text-neutral-400" />
        </button>
      </template>

      <!-- Actions (on hover, normal mode) -->
      <div v-else class="hidden group-hover:flex items-center gap-0.5">
        <button
          class="flex items-center justify-center w-5 h-5 text-neutral-500 hover:text-neutral-300 rounded transition-colors"
          title="Add child note"
          @click.stop="$emit('create', note.id)"
        >
          <Plus :size="12" />
        </button>
        <button
          class="flex items-center justify-center w-5 h-5 text-neutral-500 hover:text-red-400 rounded transition-colors"
          title="Delete note"
          @click.stop="$emit('delete', note.id)"
        >
          <Trash2 :size="12" />
        </button>
      </div>

      <!-- Task context menu -->
      <div
        v-if="showTaskMenu"
        ref="taskMenuRef"
        class="absolute right-2 z-50 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[130px]"
      >
        <button
          class="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700 transition-colors"
          @click="$emit('create-task', note.id); showTaskMenu = false"
        >
          New Task
        </button>
      </div>
    </div>

    <!-- Children (recursive) -->
    <template v-if="isExpanded && children.length > 0">
      <NoteTreeItem
        v-for="child in children"
        :key="child.id"
        :note="child"
        :all-notes="allNotes"
        :current-note-id="currentNoteId"
        :expanded-node-ids="expandedNodeIds"
        :depth="depth + 1"
        :get-item-class="getItemClass"
        :task-mode="taskMode"
        @select="$emit('select', $event)"
        @toggle-expand="$emit('toggle-expand', $event)"
        @create="$emit('create', $event)"
        @delete="$emit('delete', $event)"
        @update-icon="(noteId: string, icon: string | null) => $emit('update-icon', noteId, icon)"
        @toggle-select="$emit('toggle-select', $event)"
        @shift-select="$emit('shift-select', $event)"
        @toggle-complete="$emit('toggle-complete', $event)"
        @create-task="$emit('create-task', $event)"
        @drag-start="(e: DragEvent, id: string) => $emit('drag-start', e, id)"
        @drag-over="(e: DragEvent, id: string) => $emit('drag-over', e, id)"
        @drag-leave="(e: DragEvent) => $emit('drag-leave', e)"
        @drop="(e: DragEvent, id: string) => $emit('drop', e, id)"
        @drag-end="$emit('drag-end')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { NoteDTO } from '@app/api'
import { Check, ChevronRight, CircleCheck, FileText, ListChecks, Plus, Trash2 } from 'lucide-vue-next'
import EmojiPicker from '@/core/components/design/EmojiPicker.vue'

const INDENT_PX = 8
const BASE_PADDING_PX = 8

const props = withDefaults(defineProps<{
  note: NoteDTO
  allNotes: NoteDTO[]
  currentNoteId: string | null
  expandedNodeIds: string[]
  depth: number
  getItemClass: (noteId: string) => string
  taskMode?: boolean
}>(), {
  taskMode: false,
})

const emit = defineEmits<{
  (e: 'select', noteId: string): void
  (e: 'toggle-expand', nodeId: string): void
  (e: 'create', parentId: string): void
  (e: 'delete', noteId: string): void
  (e: 'update-icon', noteId: string, icon: string | null): void
  (e: 'toggle-select', noteId: string): void
  (e: 'drag-start', event: DragEvent, noteId: string): void
  (e: 'drag-over', event: DragEvent, noteId: string): void
  (e: 'drag-leave', event: DragEvent): void
  (e: 'drop', event: DragEvent, noteId: string): void
  (e: 'drag-end'): void
  (e: 'shift-select', noteId: string): void
  (e: 'toggle-complete', noteId: string): void
  (e: 'create-task', parentId: string): void
}>()

function handleClick(e: MouseEvent) {
  if (e.shiftKey) {
    emit('shift-select', props.note.id)
  } else if (e.ctrlKey || e.metaKey) {
    emit('toggle-select', props.note.id)
  } else {
    emit('select', props.note.id)
  }
}

const isTaskRelated = computed(() => props.note.noteType === 'tasklist' || props.note.noteType === 'task')
const showTaskMenu = ref(false)
const taskMenuRef = ref<HTMLDivElement | null>(null)

function handleContextMenu(e: MouseEvent) {
  if (!isTaskRelated.value) return
  e.preventDefault()
  showTaskMenu.value = true
}

function handleClickOutsideTaskMenu(e: MouseEvent) {
  if (taskMenuRef.value && !taskMenuRef.value.contains(e.target as Node)) {
    showTaskMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutsideTaskMenu))
onUnmounted(() => document.removeEventListener('click', handleClickOutsideTaskMenu))

const ownItemClass = computed(() => props.getItemClass(props.note.id))

const isExpanded = computed(() => props.expandedNodeIds.includes(props.note.id))

const children = computed(() =>
  props.allNotes
    .filter(n => n.parentId === props.note.id)
    .sort((a, b) => a.displayOrder - b.displayOrder)
)
</script>
