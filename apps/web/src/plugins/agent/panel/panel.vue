<template>
  <!-- TNode Tree Display -->
  <div class="agent-panel h-full bg-neutral-900/50 backdrop-blur-sm">
    <div v-if="normalizedTree && normalizedTree.rootIds.length > 0" class="tnode-tree">
      <div class="px-4 py-3 border-b border-neutral-800/50">
        <h3 class="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Execution Tree</h3>
      </div>
      <div class="p-3 space-y-1.5">
        <TnodeItem
          v-for="rootId in normalizedTree.rootIds"
          :key="rootId"
          :node-id="rootId"
          :normalized-tree="normalizedTree"
        />
      </div>
    </div>
    <div v-else class="flex items-center justify-center h-full">
      <div class="text-center px-6 py-8">
        <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-800/50 flex items-center justify-center">
          <svg class="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p class="text-sm text-neutral-400 font-medium">No execution data</p>
        <p class="text-xs text-neutral-500 mt-1">Run a flow to see the execution tree</p>
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
  overflow-y: auto;
  overflow-x: hidden;
  
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