<template>
  <div class="flex h-full bg-neutral-900">
    <!-- Left Panel: TNode Tree -->
    <div class="flex flex-col border-r w-72 border-neutral-800/50 bg-neutral-900">
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

    <!-- Center: TNode Graph -->
    <div class="relative flex-1 overflow-hidden bg-neutral-900">
      <TNodeGraph
        :tnode-tree="tNodeTree"
        :flow-tnode-id="flowTNodeId"
        :can-go-back="canGoBack"
        @tnode-click="handleTNodeClick"
        @back-click="handleBackClick"
      />
    </div>

    <!-- Right Panel: Possible Events -->
    <div class="flex flex-col border-l w-72 border-neutral-800/50 bg-neutral-900">
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
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/main'
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
const pulsingEventType = useSelector(actor, (state) => state.context.pulsingEventType);
// const canGoBack = useSelector(actor, (state) => state.context.tNodeStack.length > 1);
const canGoBack = true;

// Event handlers
const handleTNodeClick = (tNodeId: string) => {
  actor.send({ type: 'TNODE.CLICK', tNodeId });
};

const handleBackClick = () => {
  actor.send({ type: 'BACK.CLICK' });
};

const handleEventClick = (eventType: string) => {
  actor.send({ type: 'EVENT.CLICK', eventType });
};
</script> 