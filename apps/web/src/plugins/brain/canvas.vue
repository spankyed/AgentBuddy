<template>
  <div class="flex h-full bg-neutral-800">
    <!-- Left Panel: TNode Tree -->
    <div class="flex flex-col border-r w-72 border-neutral-800/50 bg-neutral-800">
              <div class="flex-shrink-0 px-4 py-3 border-b border-neutral-800/50">
          <h2 class="text-xs font-medium tracking-wider uppercase text-neutral-500">
            Event Trace
          </h2>
        </div>
      <div class="flex-1 overflow-y-auto">
        <TNodeTree 
          :tnode-tree="tNodeTree"
          @tnode-click="handleTNodeClick"
        />
      </div>
    </div>

    <!-- Center: TNode Graph -->
    <div class="relative flex-1 overflow-hidden bg-neutral-800">
      <TNodeGraph
        :tnode-tree="tNodeTree"
        :flow-tnode-id="flowTNodeId"
        :can-go-back="canGoBack"
        @tnode-click="handleTNodeClick"
        @back-click="handleBackClick"
      />
    </div>

    <!-- Right Panel: Possible Events -->
    <div class="flex flex-col border-l w-72 border-neutral-800/50 bg-neutral-800">
              <div class="flex-shrink-0 px-4 py-3 border-b border-neutral-800/50">
          <h2 class="text-xs font-medium tracking-wider uppercase text-neutral-500">
            Watched Events
          </h2>
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