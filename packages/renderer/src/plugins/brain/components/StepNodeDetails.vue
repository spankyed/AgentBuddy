<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="translate-x-full opacity-0"
    enter-to-class="translate-x-0 opacity-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-x-0 opacity-100"
    leave-to-class="translate-x-full opacity-0"
  >
    <div
      v-if="node"
      class="absolute inset-y-0 right-0 z-20 flex w-96 flex-col border-l border-neutral-800/50 bg-neutral-900 shadow-2xl"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-neutral-800/50 px-4 py-3">
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-neutral-100">{{ node.label }}</h3>
          <div class="mt-1 flex items-center gap-2">
            <span :class="statusClasses" class="text-xs">
              {{ node.status }}
            </span>
            <span v-if="node.stepNodeType" class="text-xs text-neutral-400">
              {{ node.stepNodeType }}
            </span>
          </div>
        </div>
        <button
          @click="$emit('close')"
          class="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
          aria-label="Close details"
        >
          <X :size="18" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex flex-1 flex-col overflow-y-auto">
        <!-- Main content area with flex-1 to take available space -->
        <div class="flex-1 p-4">
          <!-- Input Parameters -->
          <section v-if="hasInputParams" class="mb-4">
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Input Parameters
            </h4>
            <div class="rounded bg-black/30 border border-white/5 p-3">
              <DataRenderer :data="inputParams" :default-expanded="true" />
            </div>
          </section>

          <!-- Output Result -->
          <section v-if="hasOutput" class="mb-4">
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Output Result
            </h4>
            <div class="rounded bg-black/30 border border-white/5 p-3">
              <DataRenderer :data="outputResult" :default-expanded="true" />
            </div>
          </section>

          <!-- Empty state for pending/active nodes -->
          <div v-if="!hasContent && !node.startedAt" class="mt-8 text-center">
            <div class="text-sm text-neutral-500">
              {{ node.status === 'active' ? 'Step is currently executing...' : 'No additional details available' }}
            </div>
          </div>
        </div>

        <!-- Execution Info (sticky at bottom) -->
        <section v-if="node.startedAt || duration" class="border-t border-neutral-800/50 bg-neutral-900/50 px-4 py-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Execution Info
          </h4>
          <div class="flex items-baseline gap-4 text-xs">
            <div v-if="node.startedAt" class="flex items-baseline gap-2">
              <span class="text-neutral-500">Started:</span>
              <span class="text-neutral-300">{{ formatTimestamp(node.startedAt) }}</span>
            </div>
            <div v-if="duration" class="flex items-baseline gap-2">
              <span class="text-neutral-500">Duration:</span>
              <span class="text-neutral-300">{{ duration }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import type { TNodeEntity } from '@app/api';
import DataRenderer from '@/plugins/logs/data-renderer.vue';

interface Props {
  node?: TNodeEntity;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

const statusClasses = computed(() => {
  switch (props.node?.status) {
    case 'active':
      return 'text-emerald-400';
    case 'completed':
      return 'text-blue-400';
    case 'failed':
      return 'text-red-400';
    case 'paused':
      return 'text-yellow-400';
    default:
      return 'text-neutral-400';
  }
});

// Separate input params from output result
const inputParams = computed(() => {
  if (!props.node?.nodeAttributes) return {};
  
  const params: Record<string, any> = {};
  for (const [key, value] of Object.entries(props.node.nodeAttributes)) {
    // Exclude result as it's shown in output section
    if (key !== 'result') {
      params[key] = value;
    }
  }
  
  return params;
});

const outputResult = computed(() => {
  return props.node?.nodeAttributes?.result;
});

const hasInputParams = computed(() => Object.keys(inputParams.value).length > 0);
const hasOutput = computed(() => outputResult.value !== undefined);

const hasContent = computed(() => {
  return hasInputParams.value || hasOutput.value;
});

const duration = computed(() => {
  if (!props.node?.startedAt) return null;
  const start = props.node.startedAt;
  
  // Use completedAt for completed nodes, otherwise use current time
  const end = props.node?.completedAt || Date.now();
  const ms = end - start;
  
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
});

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}
</script>