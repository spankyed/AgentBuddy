<template>
  <div class="max-w-4xl">
    <div class="p-5 rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <h3 class="text-sm font-medium text-neutral-300 mb-3">Background Processes</h3>

      <div v-if="tasks.length === 0" class="text-xs text-neutral-500 italic">
        No background processes running.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="flex items-center gap-3 px-3 py-2 rounded-md bg-neutral-800/60"
        >
          <!-- Status indicator -->
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :class="task.status === 'running' ? 'animate-pulse bg-violet-400' : task.status === 'completed' ? 'bg-emerald-400' : 'bg-red-400'"
            :title="task.status"
          />

          <!-- Command -->
          <code class="text-xs text-neutral-300 font-mono truncate flex-1" :title="task.command">
            {{ task.command }}
          </code>

          <!-- Elapsed time -->
          <span class="text-xs text-neutral-500 shrink-0 tabular-nums">
            {{ elapsed(task) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { ArtifactItem } from '@app/api';

interface BackgroundTask {
  id: string;
  command: string;
  startedAt: number;
  taskId?: string;
  status: 'running' | 'completed' | 'error' | 'unknown';
  outputSummary?: string;
}

const props = defineProps<{
  artifact: ArtifactItem;
}>();

// Tick every second so elapsed times update.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const tasks = computed<BackgroundTask[]>(() => {
  const content = props.artifact.content as { tasks?: BackgroundTask[] } | undefined;
  return content?.tasks ?? [];
});

function elapsed(task: BackgroundTask): string {
  const ms = now.value - task.startedAt;
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
</script>
