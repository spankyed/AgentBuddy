<template>
  <div class="max-w-2xl">
    <div class="rounded-md bg-neutral-850 animate-fade-in">
      <!-- Header with integrated buttons -->
      <div class="flex items-center justify-between px-3 py-2">
        <div class="flex items-center gap-2">
          <ListTodo :size="14" class="text-neutral-500" />
          <h3 class="text-sm font-medium text-neutral-200">
            {{ artifact.title || 'Proposed Tasks' }}
            <span class="ml-1 text-xs font-normal text-neutral-500">({{ todoData.tasks.length }})</span>
          </h3>
        </div>
        <div v-if="todoData.status === 'pending'" class="flex gap-2">
          <button
            @click="handleReject"
            class="px-3 py-1 text-xs font-medium text-red-400 transition-colors border rounded bg-red-500/10 border-red-500/20 hover:bg-red-500/15"
          >
            Reject
          </button>
          <button
            @click="handleApprove"
            class="px-3 py-1 text-xs font-medium text-green-400 transition-colors border rounded bg-green-500/10 border-green-500/20 hover:bg-green-500/15"
          >
            Approve
          </button>
        </div>
        <span 
          v-else
          :class="[
            'text-xs px-2 py-0.5 rounded',
            todoData.status === 'approved' 
              ? 'bg-green-500/10 text-green-400' 
              : 'bg-red-500/10 text-red-400'
          ]"
        >
          {{ todoData.status === 'approved' ? 'Approved' : 'Rejected' }}
        </span>
      </div>
      
      <!-- Todo Tasks -->
      <div class="space-y-0">
        <div 
          v-for="(task, index) in todoData.tasks" 
          :key="task.id"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 border-t border-neutral-700/30 transition-colors',
            task.completed 
              ? 'bg-neutral-900/20' 
              : 'hover:bg-neutral-900/30'
          ]"
        >
          <!-- Checkbox -->
          <div class="relative flex items-center justify-center">
            <input
              type="checkbox"
              :checked="task.completed"
              disabled
              :class="[
                'w-4 h-4 rounded   transition-all cursor-not-allowed',
                task.completed 
                  ? 'bg-blue-500/20 border-blue-500/40'
                  : 'bg-neutral-800 border-neutral-700'
              ]"
            />
            <Check 
              v-if="task.completed"
              :size="10" 
              class="absolute text-blue-400 pointer-events-none"
            />
          </div>
          
          <!-- Task Content -->
          <div class="flex-1 min-w-0">
            <input
              v-if="isEditable"
              v-model="task.description"
              type="text"
              class="w-full px-2 py-1 text-sm transition-colors bg-transparent rounded text-neutral-100 focus:outline-none focus:bg-neutral-900/50"
              placeholder="Enter task description..."
              @input="updateTaskDescription(task.id, $event)"
            />
            <p 
              v-else
              :class="[
                'text-sm',
                task.completed 
                  ? 'text-neutral-500 line-through' 
                  : 'text-neutral-300'
              ]"
            >
              {{ task.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ListTodo, Check, X } from 'lucide-vue-next';
import type { ArtifactItem } from '@app/api';
import { applicationState } from '@/main';
import { id as agentId } from '@/plugins/agent/state';

interface TodoTask {
  id: string;
  description: string;
  completed: boolean;
}

interface TodoContent {
  tasks: TodoTask[];
  status: 'pending' | 'approved' | 'rejected';
}

const props = defineProps<{
  artifact: ArtifactItem;
}>();

const agentActor = applicationState.system.get(agentId);

// Use reactive data to allow local edits
const todoData = ref<TodoContent>({
  tasks: props.artifact.content?.tasks || [],
  status: props.artifact.content?.status || 'pending'
});

const isEditable = computed(() => todoData.value.status === 'pending');

function updateTaskDescription(taskId: string, event: Event) {
  const target = event.target as HTMLInputElement;
  const task = todoData.value.tasks.find(t => t.id === taskId);
  if (task) {
    task.description = target.value;
  }
}

function handleApprove() {
  agentActor.send({
    type: 'APPROVE_TODO_LIST',
    artifactId: props.artifact.id,
    tasks: todoData.value.tasks
  });
  todoData.value.status = 'approved';
}

function handleReject() {
  agentActor.send({
    type: 'REJECT_TODO_LIST',
    artifactId: props.artifact.id
  });
  todoData.value.status = 'rejected';
}
</script>

<style scoped>
/* Custom checkbox styling */
input[type="checkbox"]:disabled {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

/* Smooth animations */
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>