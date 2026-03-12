<template>
  <div>
    <!-- Node row -->
    <div
      class="flex items-center gap-1 px-2 py-1 cursor-pointer text-sm transition-colors group"
      :class="[
        note.id === currentNoteId
          ? 'bg-neutral-700 text-neutral-100'
          : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
      ]"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="$emit('select', note.id)"
    >
      <!-- Expand/Collapse chevron -->
      <button
        v-if="children.length > 0"
        class="flex items-center justify-center w-4 h-4 text-neutral-500 hover:text-neutral-300 transition-colors"
        @click.stop="$emit('toggle-expand', note.id)"
      >
        <ChevronRight
          :size="14"
          class="transition-transform"
          :class="isExpanded ? 'rotate-90' : ''"
        />
      </button>
      <div v-else class="w-4" />

      <!-- Note icon -->
      <EmojiPicker :model-value="note.icon" @update:model-value="(icon: string | null) => $emit('update-icon', note.id, icon)">
        <template #default="{ toggle }">
          <button
            class="flex items-center justify-center w-4 h-4 shrink-0"
            @click.stop="toggle"
          >
            <span v-if="note.icon" class="text-sm leading-none">{{ note.icon }}</span>
            <FileText v-else :size="14" class="text-neutral-500" />
          </button>
        </template>
      </EmojiPicker>

      <!-- Title -->
      <span class="truncate flex-1">{{ note.title || 'Untitled' }}</span>

      <!-- Actions (on hover) -->
      <div class="hidden group-hover:flex items-center gap-0.5">
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
        @select="$emit('select', $event)"
        @toggle-expand="$emit('toggle-expand', $event)"
        @create="$emit('create', $event)"
        @delete="$emit('delete', $event)"
        @update-icon="(noteId: string, icon: string | null) => $emit('update-icon', noteId, icon)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NoteDTO } from '@app/api'
import { ChevronRight, FileText, Plus, Trash2 } from 'lucide-vue-next'
import EmojiPicker from '@/core/components/design/EmojiPicker.vue'

const props = defineProps<{
  note: NoteDTO
  allNotes: NoteDTO[]
  currentNoteId: string | null
  expandedNodeIds: string[]
  depth: number
}>()

defineEmits<{
  (e: 'select', noteId: string): void
  (e: 'toggle-expand', nodeId: string): void
  (e: 'create', parentId: string): void
  (e: 'delete', noteId: string): void
  (e: 'update-icon', noteId: string, icon: string | null): void
}>()

const isExpanded = computed(() => props.expandedNodeIds.includes(props.note.id))

const children = computed(() =>
  props.allNotes
    .filter(n => n.parentId === props.note.id)
    .sort((a, b) => a.displayOrder - b.displayOrder)
)
</script>
