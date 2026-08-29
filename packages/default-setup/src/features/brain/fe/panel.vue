<template>
  <!-- TNode Tree Display -->
  <div class="h-full brain-panel bg-neutral-900/50 backdrop-blur-sm">
    <!-- Brain Dead State (no nodes) -->
    <div v-if="brainIsDead && (!tNodeTree || tNodeTree.length === 0)" class="flex items-center justify-center h-full">
      <div class="px-6 py-8 text-center">
        <div class="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-800/50">
          <svg class="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728" />
          </svg>
        </div>
        <p class="text-sm font-medium text-neutral-400">Brain Stopped</p>
        <p class="mt-1 text-xs text-neutral-500 mb-4">The brain is currently inactive</p>
        <button
          @click="startBrain"
          class="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          Start Brain
        </button>
      </div>
    </div>
    <!-- Brain Dead State (with stale nodes) -->
    <div v-else-if="brainIsDead" class="tnode-tree">
      <div class="px-4 pt-4 pb-3 border-b border-neutral-800 bg-neutral-900/30">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-semibold tracking-wider uppercase text-neutral-500">Event Trace</h3>
          <span class="px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded bg-neutral-700/50 text-neutral-400">Stopped</span>
        </div>
      </div>
      <div class="flex-1 p-4 opacity-50 pointer-events-none overflow-y-auto tnode-scroll">
        <div class="space-y-1">
          <TNodeListItem
            v-for="node in displayedNodes"
            :key="node.id"
            :node="node"
            :depth="0"
          />
        </div>
      </div>
    </div>
    <!-- Normal TNode Tree Display -->
    <div v-else-if="tNodeTree && tNodeTree.length > 0" class="tnode-tree">
      <div class="px-4 pt-4 pb-3 border-b border-neutral-800 bg-neutral-900/30">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-semibold tracking-wider uppercase text-neutral-500">Event Trace</h3>
          <span class="text-xs text-neutral-500">
            <template v-if="displayedNodes.length < tNodeTree.length">
              {{ displayedNodes.length }} of {{ tNodeTree.length }} event{{ tNodeTree.length !== 1 ? 's' : '' }}
            </template>
            <template v-else>
              {{ tNodeTree.length }} event{{ tNodeTree.length !== 1 ? 's' : '' }}
            </template>
          </span>
        </div>
      </div>
      <div class="flex-1 p-4 overflow-y-auto tnode-scroll" @scroll="onScroll">
        <div class="space-y-1">
          <TNodeListItem
            v-for="node in displayedNodes"
            :key="node.id"
            :node="node"
            :depth="0"
            @open-flow="$emit('flow-navigate', $event)"
          />
        </div>
      </div>
    </div>
    <div v-else class="flex items-center justify-center h-full">
      <div class="px-6 py-8 text-center">
        <div class="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-800/50">
          <svg class="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p class="text-sm font-medium text-neutral-400">No event data</p>
        <p class="mt-1 text-xs text-neutral-500">Run a flow to see an event trace</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id as brainId, type BrainState } from '@/plugins/brain/state'
import TNodeListItem from '@/core/components/design/TNodeListItem.vue'
import type { TrackEntity } from '@app/api'
import { trpc } from '@/core/trpc'

const brainActor: BrainState = applicationState.system.get(brainId);
const normalizedTree = useSelector(brainActor, (state) => state.context.normalizedTree);
const brainIsDead = useSelector(brainActor, (state) => state.context.brainIsDead);
const flowTNodeId = useSelector(brainActor, (state) => state.context.flowTNodeId);

// Infinite scroll: show 50 items at a time
const PAGE_SIZE = 50;
const displayCount = ref(PAGE_SIZE);

// Reset display count only on flow navigation (not on every TNODE_SPAWNED)
watch(flowTNodeId, () => {
  displayCount.value = PAGE_SIZE;
});

// Convert normalized tree back to TrackEntity[] format, reversed (newest first)
const tNodeTree = computed((): TrackEntity[] => {
  if (!normalizedTree.value) return [];

  function buildNode(id: string): TrackEntity {
    const node = normalizedTree.value!.byId[id];
    const childIds = normalizedTree.value!.childrenById[id] || [];

    return {
      ...node,
      children: childIds.map(childId => buildNode(childId))
    } as TrackEntity;
  }

  return normalizedTree.value.rootIds.slice().reverse().map(id => buildNode(id));
});

// Paginated slice for display
const displayedNodes = computed(() => {
  return tNodeTree.value.slice(0, displayCount.value);
});

// Infinite scroll handler
const onScroll = (e: Event) => {
  const el = e.target as HTMLElement;
  // Load more when within 100px of the bottom
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
    if (displayCount.value < tNodeTree.value.length) {
      displayCount.value = Math.min(displayCount.value + PAGE_SIZE, tNodeTree.value.length);
    }
  }
};

// Start brain method
const startBrain = () => {
  trpc.bus.send.mutate({
    systemId: 'brain',
    type: 'START_BRAIN'
  });
};

defineEmits<{
  'flow-navigate': [flowId: string];
}>();
</script>

<style lang="scss" scoped>
.brain-panel {
  display: flex;
  flex-direction: column;
}

.tnode-tree {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tnode-scroll {
  scroll-behavior: smooth;

  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  }
}
</style>