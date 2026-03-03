<template>
  <div class="relative flex h-full overflow-hidden bg-neutral-900">
    <!-- Left Panel: Watched Events (Optional) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="-translate-x-full opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="-translate-x-full opacity-0"
    >
      <div v-if="showLeftPanel" class="flex flex-col border-r w-72 border-neutral-800/50 bg-neutral-900">
        <div class="px-5 py-3.5 border-b border-neutral-800/50 bg-neutral-900/30">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold tracking-wider uppercase text-neutral-500">Watched Events</h3>
            <span v-if="possibleEvents && possibleEvents.length > 0" class="text-xs text-neutral-500">
              {{ possibleEvents.length }} event{{ possibleEvents.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto">
          <EventsList
            :events="possibleEvents"
            :pulsing-event-type="pulsingEventType"
            @event-click="handleEventClick"
          />
        </div>
      </div>
    </Transition>

    <!-- Center: TNode Graph (Always visible) -->
    <div class="relative flex-1 overflow-hidden bg-neutral-900" @click="handleCanvasClick">
      <TNodeGraph
        :tnode-tree="tNodeTree"
        :flow-tnode-id="flowTNodeId"
        :can-go-back="canGoBack"
        :animations-enabled="animationsEnabled"
        :selected-node-id="selectedStepNode?.id"
        @node-click="handleNodeClick"
        @flow-navigate="handleFlowNavigate"
        @back-click="handleBackClick"
      />
    </div>

    <!-- Step Node Details Panel (Slide-out) -->
    <StepNodeDetails
      :node="selectedStepNode"
      @close="handleCloseDetails"
    />
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { onMounted, onUnmounted } from 'vue'
import { id, type BrainState } from '@/plugins/brain/state.ts';
import TNodeGraph from './components/TNodeGraph.vue';
import EventsList from './components/EventsList.vue';
import StepNodeDetails from './components/StepNodeDetails.vue';

const actor: BrainState = applicationState.system.get(id);

// Selectors for state
const tNodeTree = useSelector(actor, (state) => state.context.tNodeTree);
const possibleEvents = useSelector(actor, (state) => state.context.possibleEvents);
const flowTNodeId = useSelector(actor, (state) => state.context.flowTNodeId);
const pulsingEventType = useSelector(actor, (state) => state.context.pulsingEventType);
const canGoBack = useSelector(actor, (state) => state.context.flowTNodeId !== 'TNode-Root');

// UI state selectors
const showLeftPanel = useSelector(actor, (state) => state.context.showLeftPanel);
const selectedStepNode = useSelector(actor, (state) => state.context.selectedStepNode);
const inspectEnabled = useSelector(actor, (state) => state.context.inspectEnabled);
const animationsEnabled = useSelector(actor, (state) => state.context.animationsEnabled);

// Event handlers
const handleNodeClick = (nodeId: string) => {
  actor.send({ type: 'NODE.CLICK', nodeId });
};

const handleFlowNavigate = (tNodeId: string) => {
  actor.send({ type: 'FLOW.NAVIGATE', tNodeId });
};

const handleBackClick = () => {
  actor.send({ type: 'BACK.CLICK' });
};

const handleEventClick = (eventType: string) => {
  actor.send({ type: 'EVENT.CLICK', eventType });
};

const handleCloseDetails = () => {
  actor.send({ type: 'CLOSE_DETAILS' });
};

const handleCanvasClick = (event: MouseEvent) => {
  // Only close if we have a selected node and the click is directly on the canvas
  // The StepNodeDetails panel has @click.stop to prevent propagation
  if (selectedStepNode.value) {
    handleCloseDetails();
  }
};

// Keyboard shortcuts
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && selectedStepNode.value) {
    handleCloseDetails();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>