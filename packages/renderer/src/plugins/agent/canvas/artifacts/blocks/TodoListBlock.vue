<template>
  <div class="todo-list-block">
    <div
      v-if="status && status !== 'pending'"
      class="mb-3 px-4 py-2 rounded-lg flex items-center gap-2"
      :class="getStatusClasses(status)"
    >
      <component :is="getStatusIcon(status)" class="w-5 h-5" />
      <span class="text-sm font-medium">{{ getStatusLabel(status) }}</span>
    </div>

    <div class="space-y-2">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="flex items-start gap-3 p-3 bg-neutral-900 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors"
        :class="{ 'opacity-60': task.completed }"
      >
        <button
          @click="() => emit('task-toggle', task.id, !task.completed)"
          class="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
          :class="task.completed
            ? 'bg-primary-600 border-primary-600'
            : 'border-neutral-500 hover:border-primary-400'"
        >
          <Check v-if="task.completed" class="w-3.5 h-3.5 text-white" />
        </button>

        <span
          class="text-sm flex-1"
          :class="task.completed ? 'line-through text-neutral-500' : 'text-neutral-200'"
        >
          {{ task.description }}
        </span>
      </div>
    </div>

    <div v-if="!tasks || tasks.length === 0" class="p-8 text-center text-neutral-500">
      <p>No tasks available</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check, CheckCircle, XCircle, Clock } from 'lucide-vue-next'

interface Task {
  id: string
  description: string
  completed: boolean
}

interface Props {
  tasks: Task[]
  status?: 'pending' | 'approved' | 'rejected' | 'in-progress' | 'completed'
}

defineProps<Props>()

interface Emits {
  (e: 'task-toggle', taskId: string, completed: boolean): void
}

const emit = defineEmits<Emits>()

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved':
    case 'completed':
      return CheckCircle
    case 'rejected':
      return XCircle
    case 'in-progress':
      return Clock
    default:
      return Clock
  }
}

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'in-progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'pending':
    default:
      return 'Pending'
  }
}

const getStatusClasses = (status: string): string => {
  switch (status) {
    case 'approved':
    case 'completed':
      return 'bg-green-950/30 border border-green-700/50 text-green-300'
    case 'rejected':
      return 'bg-red-950/30 border border-red-700/50 text-red-300'
    case 'in-progress':
      return 'bg-yellow-950/30 border border-yellow-700/50 text-yellow-300'
    case 'pending':
    default:
      return 'bg-blue-950/30 border border-blue-700/50 text-blue-300'
  }
}
</script>
