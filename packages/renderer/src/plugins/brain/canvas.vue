<template>
  <div class="relative flex h-full overflow-hidden bg-neutral-900">
    <!-- Left Panel: TNode Tree (Optional) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="-translate-x-full opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="-translate-x-full opacity-0"
    >
      <div v-if="showLeftPanel" class="flex flex-col border-r w-72 border-neutral-800/50 bg-neutral-900">
        <!-- Header -->
        <div class="px-5 py-3.5 border-b border-neutral-800/50 bg-neutral-900/30">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold tracking-wider uppercase text-neutral-500">Event Trace</h3>
            <span v-if="tNodeTree && tNodeTree.length > 0" class="text-xs text-neutral-500">
              {{ tNodeTree.length }} event{{ tNodeTree.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto">
          <TNodeTree 
            :tnode-tree="tNodeTree"
            @tnode-click="handleTNodeClick"
          />
        </div>
      </div>
    </Transition>

    <!-- Center: TNode Graph (Always visible) -->
    <div class="relative flex-1 overflow-hidden bg-neutral-900">
      <TNodeGraph
        :tnode-tree="tNodeTree"
        :flow-tnode-id="flowTNodeId"
        :can-go-back="canGoBack"
        :show-left-panel="showLeftPanel"
        :show-right-panel="showRightPanel"
        :debug-enabled="debugEnabled"
        @tnode-click="handleTNodeClick"
        @step-click="handleStepNodeClick"
        @back-click="handleBackClick"
        @toggle-left-panel="handleToggleLeftPanel"
        @toggle-right-panel="handleToggleRightPanel"
        @toggle-debug="handleToggleDebug"
      />
    </div>

    <!-- Right Panel: Possible Events (Optional) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="translate-x-full opacity-0"
      enter-to-class="translate-x-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-x-0 opacity-100"
      leave-to-class="translate-x-full opacity-0"
    >
      <div v-if="showRightPanel && !selectedStepNode" class="flex flex-col border-l w-72 border-neutral-800/50 bg-neutral-900">
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
import TNodeTree from './components/TNodeTree.vue';
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
const showRightPanel = useSelector(actor, (state) => state.context.showRightPanel);
const selectedStepNode = useSelector(actor, (state) => state.context.selectedStepNode);
const debugEnabled = useSelector(actor, (state) => state.context.debugEnabled);

// Event handlers
const handleTNodeClick = (tNodeId: string) => {
  actor.send({ type: 'TNODE.CLICK', tNodeId });
};

const handleStepNodeClick = (tNodeId: string) => {
  actor.send({ type: 'STEP_NODE.CLICK', tNodeId });
};

const handleBackClick = () => {
  actor.send({ type: 'BACK.CLICK' });
};

const handleEventClick = (eventType: string) => {
  actor.send({ type: 'EVENT.CLICK', eventType });
};

const handleToggleLeftPanel = () => {
  actor.send({ type: 'TOGGLE_LEFT_PANEL' });
};

const handleToggleRightPanel = () => {
  actor.send({ type: 'TOGGLE_RIGHT_PANEL' });
};

const handleToggleDebug = () => {
  actor.send({ type: 'TOGGLE_DEBUG' });
};

const handleCloseDetails = () => {
  actor.send({ type: 'CLOSE_DETAILS' });
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