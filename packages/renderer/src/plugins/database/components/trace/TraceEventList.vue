<template>
  <div class="flex flex-col h-full bg-neutral-900/50 backdrop-blur-sm">
    <!-- Event List -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="flowEvents.length === 0 && !isLoadingTrace" class="flex flex-col items-center justify-center h-full px-4 text-center">
        <div class="flex items-center justify-center w-12 h-12 mb-3 rounded-lg bg-neutral-800/30">
          <svg class="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p class="text-sm text-neutral-400">No events in this flow</p>
      </div>
      
      <div v-else class="p-4">
        <div class="space-y-1">
          <TNodeListItem
            v-for="event in flowEvents"
            :key="event.id"
            :node="event"
            :node-details="nodeDetails.get(event.id)"
            :node-details-map="nodeDetails"
            :depth="0"
            @toggle="toggleNode"
            @request-details="requestNodeDetails"
            @open-flow="openFlow"
          />
        </div>
        
        <!-- Load More Button -->
        <div v-if="tracePagination.hasMore" class="flex justify-center mt-4">
          <button
            @click="loadMore"
            :disabled="isLoadingTrace"
            class="px-4 py-2 text-sm font-medium text-blue-400 bg-blue-900/20 hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Loader2 v-if="isLoadingTrace" class="w-4 h-4 animate-spin" />
            <span>{{ isLoadingTrace ? 'Loading...' : 'Load More Events' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as databaseId, type DatabaseState } from '../../state'
import { Loader2 } from 'lucide-vue-next'
import TNodeListItem from '@/core/components/design/TNodeListItem.vue'

const databaseActor: DatabaseState = applicationState.system.get(databaseId)

// State selectors
const flowEvents = useSelector(databaseActor, (state) => state.context.flowEvents)
const expandedNodes = useSelector(databaseActor, (state) => state.context.expandedNodes)
const nodeDetails = useSelector(databaseActor, (state) => state.context.nodeDetails)
const isLoadingTrace = useSelector(databaseActor, (state) => state.context.isLoadingTrace)
const tracePagination = useSelector(databaseActor, (state) => state.context.tracePagination)

// Actions
function toggleNode(nodeId: string) {
  databaseActor.send({ type: 'TRACE.EXPAND_NODE', nodeId })
}

function requestNodeDetails(nodeId: string) {
  // Request node details if not already loaded
  if (!nodeDetails.value.has(nodeId)) {
    databaseActor.send({ type: 'TRACE.EXPAND_NODE', nodeId })
  }
}

function loadMore() {
  databaseActor.send({ type: 'TRACE.LOAD_MORE' })
}

function openFlow(flowId: string) {
  // Send event to select the flow that was double-clicked
  databaseActor.send({ type: 'TRACE.SELECT_FLOW', flowId })
}
</script>