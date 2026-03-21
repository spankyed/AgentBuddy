<template>
  <div class="flex flex-col h-full w-[250px] min-w-[250px] border-r border-neutral-800">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
      <span class="text-sm font-medium text-neutral-300">Tasks</span>
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
    <div class="flex-1 overflow-y-auto py-1">
      <!-- Overview item -->
      <button
        class="w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left"
        :class="!selectedTaskId ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'"
        @click="$emit('deselect-task')"
      >
        <FileText :size="14" class="text-neutral-500 shrink-0" />
        <span class="truncate">Overview</span>
      </button>

      <!-- Divider -->
      <div class="border-b border-neutral-800/50 mx-3 my-1" />

      <!-- Incomplete tasks -->
      <div
        v-for="task in incompleteTasks"
        :key="task.id"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors cursor-pointer group"
        :class="task.id === selectedTaskId ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-300 hover:bg-neutral-800'"
        @click="$emit('select-task', task.id)"
      >
        <button
          class="flex items-center justify-center w-4 h-4 shrink-0 rounded border border-neutral-500 hover:border-neutral-300 transition-colors"
          @click.stop="$emit('toggle-complete', task.id)"
        >
        </button>
        <span class="truncate flex-1">{{ task.title || 'Untitled' }}</span>
        <button
          class="hidden group-hover:flex items-center justify-center w-4 h-4 text-neutral-500 hover:text-red-400 transition-colors shrink-0"
          @click.stop="$emit('delete-task', task.id)"
        >
          <Trash2 :size="12" />
        </button>
      </div>

      <!-- Completed tasks -->
      <template v-if="showCompleted && completedTasks.length > 0">
        <div v-if="incompleteTasks.length > 0" class="border-b border-neutral-700/50 mx-3 my-1" />
        <div
          v-for="task in completedTasks"
          :key="task.id"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors cursor-pointer group"
          :class="task.id === selectedTaskId ? 'bg-neutral-700 text-neutral-400' : 'text-neutral-600 hover:bg-neutral-800'"
          @click="$emit('select-task', task.id)"
        >
          <button
            class="flex items-center justify-center w-4 h-4 shrink-0 rounded border border-neutral-600 bg-neutral-700 transition-colors"
            @click.stop="$emit('toggle-complete', task.id)"
          >
            <Check :size="10" class="text-neutral-400" />
          </button>
          <span class="truncate flex-1">{{ task.title || 'Untitled' }}</span>
          <button
            class="hidden group-hover:flex items-center justify-center w-4 h-4 text-neutral-500 hover:text-red-400 transition-colors shrink-0"
            @click.stop="$emit('delete-task', task.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </template>

      <!-- Empty state -->
      <div v-if="incompleteTasks.length === 0 && (!showCompleted || completedTasks.length === 0)" class="px-3 py-4 text-xs text-neutral-500 text-center">
        No tasks yet
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NoteDTO } from '@app/api'
import { Plus, FileText, Trash2, Check, Eye, EyeOff } from 'lucide-vue-next'

const props = defineProps<{
  tasks: NoteDTO[]
  selectedTaskId: string | null
  showCompleted: boolean
}>()

defineEmits<{
  (e: 'select-task', taskId: string): void
  (e: 'deselect-task'): void
  (e: 'create-task'): void
  (e: 'delete-task', taskId: string): void
  (e: 'toggle-complete', taskId: string): void
  (e: 'toggle-show-completed'): void
}>()

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
