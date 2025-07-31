<template>
  <!-- TNode Tree Display -->
  <div class="h-full agent-panel bg-neutral-900/50 backdrop-blur-sm">
    <div v-if="normalizedTree && normalizedTree.rootIds.length > 0" class="tnode-tree">
      <div class="px-4 pt-4 pb-3 border-b border-neutral-800 bg-neutral-900/30">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-semibold tracking-wider uppercase text-neutral-500">Event Trace</h3>
          <span class="text-xs text-neutral-500">{{ normalizedTree.rootIds.length }} event{{ normalizedTree.rootIds.length !== 1 ? 's' : '' }}</span>
        </div>
      </div>
      <div class="flex-1 p-4">
        <div class="space-y-2">
          <TnodeItem
            v-for="rootId in normalizedTree.rootIds"
            :key="rootId"
            :node-id="rootId"
            :normalized-tree="normalizedTree"
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
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id as brainId, type BrainState } from '@/plugins/brain/state'
import TnodeItem from './tnode-item.vue'

const brainActor: BrainState = applicationState.system.get(brainId);
const normalizedTree = useSelector(brainActor, (state) => state.context.normalizedTree);
</script>

<style lang="scss" scoped>
.agent-panel {
  display: flex;
  flex-direction: column;
}

.tnode-tree {
  flex: 1;
  
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

/* Smooth scroll behavior */
.tnode-tree > div:last-child {
  scroll-behavior: smooth;
}
</style> 