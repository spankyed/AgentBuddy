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

    <!-- Paused Banner -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="-translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-full opacity-0"
    >
      <div v-if="brainIsPaused" class="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-3 px-4 py-1.5 bg-amber-900/80 border-b border-amber-700/50 text-amber-200 text-xs">
        <span>Brain Paused — Events Queued</span>
        <button
          class="px-2 py-0.5 text-xs font-medium rounded bg-amber-700/60 hover:bg-amber-600/60 text-amber-100 transition-colors"
          @click.stop="handleResume"
        >
          Resume
        </button>
      </div>
    </Transition>

    <!-- Runtime Error Banner -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="-translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="-translate-y-full opacity-0"
    >
      <div
        v-if="latestRuntimeError"
        :class="[
          'absolute left-0 right-0 z-20 flex items-center justify-between gap-3 border-b border-red-700/50 bg-red-950/90 px-4 py-2 text-xs text-red-100',
          brainIsPaused ? 'top-8' : 'top-0'
        ]"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold">Brain runtime error</span>
            <span v-if="latestRuntimeError.nodeLabel || latestRuntimeError.actionLabel" class="truncate text-red-200/80">
              {{ latestRuntimeError.nodeLabel || latestRuntimeError.actionLabel }}
            </span>
          </div>
          <div class="truncate text-red-100/80">
            {{ latestRuntimeError.message }}
          </div>
        </div>
        <button
          class="shrink-0 rounded px-2 py-1 text-red-100/80 transition-colors hover:bg-red-900/70 hover:text-white"
          @click.stop="handleDismissRuntimeError"
        >
          Dismiss
        </button>
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

      <!-- Brain Stopped Overlay -->
      <div v-if="brainIsDead && tNodeTree && tNodeTree.length" class="absolute inset-0 z-20 flex items-center justify-center bg-neutral-900/60 backdrop-blur-[1px]">
        <div class="text-center">
          <div class="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-full bg-neutral-800/80 border border-neutral-700/50">
            <svg class="w-7 h-7 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728" />
            </svg>
          </div>
          <p class="text-sm font-medium text-neutral-300">Brain Stopped</p>
          <p class="mt-1 text-xs text-neutral-500">This is the last known state</p>
          <button
            class="mt-4 px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            @click.stop="handleStart"
          >
            Start Brain
          </button>
        </div>
      </div>
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
import { trpc } from '@/core/trpc';

const actor: BrainState = applicationState.system.get(id);

// Selectors for state
const tNodeTree = useSelector(actor, (state) => state.context.tNodeTree);
const possibleEvents = useSelector(actor, (state) => state.context.possibleEvents);
const flowTNodeId = useSelector(actor, (state) => state.context.flowTNodeId);
const pulsingEventType = useSelector(actor, (state) => state.context.pulsingEventType);
const canGoBack = useSelector(actor, (state) => state.context.flowTNodeId !== 'TNode-Root');
const brainIsPaused = useSelector(actor, (state) => state.context.brainIsPaused);
const brainIsDead = useSelector(actor, (state) => state.context.brainIsDead);
const latestRuntimeError = useSelector(actor, (state) => state.context.latestRuntimeError);

// UI state selectors
const showLeftPanel = useSelector(actor, (state) => state.context.showLeftPanel);
const selectedStepNode = useSelector(actor, (state) => state.context.selectedStepNode);
const inspectEnabled = useSelector(actor, (state) => state.context.inspectEnabled);
const animationsEnabled = useSelector(actor, (state) => state.context.animationsEnabled);

// Event handlers
const handleNodeClick = (nodeId: string) => {
  if (brainIsDead.value) return;
  actor.send({ type: 'NODE.CLICK', nodeId });
};

const handleFlowNavigate = (tNodeId: string) => {
  if (brainIsDead.value) return;
  actor.send({ type: 'FLOW.NAVIGATE', tNodeId });
};

const handleBackClick = () => {
  if (brainIsDead.value) return;
  actor.send({ type: 'BACK.CLICK' });
};

const handleStart = () => {
  trpc.bus.send.mutate({
    systemId: 'brain',
    type: 'START_BRAIN'
  });
};

const handleEventClick = (eventType: string) => {
  actor.send({ type: 'EVENT.CLICK', eventType });
};

const handleCloseDetails = () => {
  actor.send({ type: 'CLOSE_DETAILS' });
};

const handleResume = () => {
  actor.send({ type: 'RESUME_BRAIN' });
};

const handleDismissRuntimeError = () => {
  actor.send({ type: 'DISMISS_RUNTIME_ERROR' });
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
