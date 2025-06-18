<template>
  <div class="flex h-full bg-neutral-900">
    <!-- Left Panel: TNode Tree -->
    <div class="flex flex-col w-64 border-r border-neutral-700 bg-neutral-800/50">
      <div class="flex-1 overflow-y-auto">
        <TNodeTree 
          :tnode-tree="tNodeTree"
          @tnode-click="handleTNodeClick"
        />
      </div>
      <div class="flex-shrink-0 p-4 border-t border-neutral-700">
        <h2 class="text-sm font-semibold tracking-wider uppercase text-neutral-300">
          Event Trace
        </h2>
      </div>
    </div>

    <!-- Center: TNode Graph -->
    <div class="relative flex-1 overflow-hidden">
      <TNodeGraph
        :tnode-tree="tNodeTree"
        :flow-tnode-id="flowTNodeId"
        :can-go-back="canGoBack"
        @tnode-click="handleTNodeClick"
        @back-click="handleBackClick"
      />
    </div>

    <!-- Right Panel: Possible Events -->
    <div class="flex flex-col w-64 border-l border-neutral-700 bg-neutral-800/50">
      <div class="flex-1 overflow-y-auto">
        <EventsList
          :events="possibleEvents"
          :pulsing-event-tag="pulsingEventTag"
          @event-click="handleEventClick"
        />
      </div>
      <div class="flex-shrink-0 p-4 border-t border-neutral-700">
        <h2 class="text-sm font-semibold tracking-wider uppercase text-neutral-300">
          Watched Events
        </h2>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type BrainState } from '@/plugins/brain/state.ts';
import TNodeTree from './components/TNodeTree.vue';
import TNodeGraph from './components/TNodeGraph.vue';
import EventsList from './components/EventsList.vue';

const actor: BrainState = applicationState.system.get(id);

// Selectors for state
const tNodeTree = useSelector(actor, (state) => state.context.tNodeTree);
const possibleEvents = useSelector(actor, (state) => state.context.possibleEvents);
const flowTNodeId = useSelector(actor, (state) => state.context.flowTNodeId);
const pulsingEventTag = useSelector(actor, (state) => state.context.pulsingEventTag);
// const canGoBack = useSelector(actor, (state) => state.context.tNodeStack.length > 1);
const canGoBack = true;

// Event handlers
const handleTNodeClick = (tNodeId: string) => {
  actor.send({ type: 'TNODE.CLICK', tNodeId });
};

const handleBackClick = () => {
  actor.send({ type: 'BACK.CLICK' });
};

const handleEventClick = (eventTag: string) => {
  actor.send({ type: 'EVENT.CLICK', eventTag });
};
</script> 