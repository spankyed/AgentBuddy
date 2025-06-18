<template>
  <div class="flex h-full bg-neutral-900">
    <!-- Left Panel: Ongoing Tracks -->
    <div class="flex flex-col w-64 border-r border-neutral-700 bg-neutral-800/50">
      <div class="flex-shrink-0 p-4 border-b border-neutral-700">
        <h2 class="text-sm font-semibold tracking-wider uppercase text-neutral-300">
          Ongoing Flows
        </h2>
      </div>
      <div class="flex-1 overflow-y-auto">
        <TracksList 
          :tracks="tracks"
          @track-click="handleTrackClick"
        />
      </div>
    </div>

    <!-- Center: Timeline Graph -->
    <div class="relative flex-1 overflow-hidden">
      <TimelineGraph
        :tracks="tracks"
        :current-flow-id="currentFlowId"
        :can-go-back="canGoBack"
        @flow-node-click="handleFlowNodeClick"
        @back-click="handleBackClick"
      />
    </div>

    <!-- Right Panel: Possible Events -->
    <div class="flex flex-col w-64 border-l border-neutral-700 bg-neutral-800/50">
      <div class="flex-shrink-0 p-4 border-b border-neutral-700">
        <h2 class="text-sm font-semibold tracking-wider uppercase text-neutral-300">
          Possible Events
        </h2>
      </div>
      <div class="flex-1 overflow-y-auto">
        <EventsList
          :events="possibleEvents"
          :pulsing-event-tag="pulsingEventTag"
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
import TracksList from './components/TracksList.vue';
import TimelineGraph from './components/TimelineGraph.vue';
import EventsList from './components/EventsList.vue';

const actor: BrainState = applicationState.system.get(id);

// Selectors for state
const tracks = useSelector(actor, (state) => state.context.tracks);
const possibleEvents = useSelector(actor, (state) => state.context.possibleEvents);
const currentFlowId = useSelector(actor, (state) => state.context.currentFlowId);
const pulsingEventTag = useSelector(actor, (state) => state.context.pulsingEventTag);
const canGoBack = useSelector(actor, (state) => state.context.flowStack.length > 1);

// Event handlers
const handleTrackClick = (trackId: string) => {
  actor.send({ type: 'TRACK.CLICK', trackId });
};

const handleFlowNodeClick = (flowId: string) => {
  actor.send({ type: 'FLOW_NODE.CLICK', flowId });
};

const handleBackClick = () => {
  actor.send({ type: 'BACK.CLICK' });
};

const handleEventClick = (eventTag: string) => {
  actor.send({ type: 'EVENT.CLICK', eventTag });
};
</script> 