<template>
  <div class="relative w-full h-full">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      class="w-full h-full bg-neutral-900"
      :fit-view-on-init="true"
      :connection-line-type="ConnectionLineType.SmoothStep"
      :default-edge-options="{
        type: 'smoothstep',
        style: { strokeWidth: 2 },
        markerEnd: MarkerType.Arrow
      }"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :zoom-on-scroll="true"
      :pan-on-scroll="false"
      :zoom-on-double-click="false"
      :min-zoom="0.5"
      :max-zoom="2"
      @node-click="handleNodeClick"
    >
      <template #node-track="nodeProps">
        <TrackNode v-bind="nodeProps" />
      </template>
      <Background variant="dots" />
      <Controls />
      
      <!-- Back button (top left) -->
      <div class="absolute z-10 top-4 left-4">
        <button
          v-if="canGoBack"
          class="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-50 rounded-md transition-colors"
          @click="$emit('back-click')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>
      
      <!-- Flow label (top center) -->
      <div v-if="currentFlowId" class="absolute z-10 left-1/2 transform -translate-x-1/2 top-4">
        <div class="px-4 py-2 bg-neutral-800 rounded-md">
          <span class="text-sm text-neutral-300">Flow: {{ currentFlowId }}</span>
        </div>
      </div>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import {
  VueFlow,
  ConnectionLineType,
  MarkerType,
  type Node as VueFlowNode,
  type Edge,
  type NodeMouseEvent,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import type { TrackEntity } from '@abuddy/api/systems/brain/types';
import TrackNode from './TrackNode.vue';
import { getNodeData } from '@/plugins/flows/repository/mock-data';

interface Props {
  tracks: TrackEntity[];
  currentFlowId?: string;
  canGoBack: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'flow-node-click': [flowId: string];
  'back-click': [];
}>();

// Convert tracks to VueFlow nodes and edges
const nodes = computed<VueFlowNode[]>(() => {
  const result: VueFlowNode[] = [];
  let yOffset = 100;
  
  props.tracks.forEach((track, trackIndex) => {
    let xOffset = 100;
    
    // Create event listener node (root of track)
    result.push({
      id: `${track.id}-event`,
      type: 'track',
      position: { x: xOffset, y: yOffset },
      data: {
        label: track.eventLabel,
        nodeType: 'listen',
        isRoot: true,
        status: track.status,
      },
    });
    
    xOffset += 200;
    
    // Create nodes for each executed node in the track
    track.nodes.forEach((nodeId, nodeIndex) => {
      const nodeData = getNodeData(nodeId);
      const isCurrentNode = nodeId === track.currentNodeId;
      const isFlowNode = nodeData?.nodeType === 'flow';
      
      result.push({
        id: `${track.id}-${nodeId}`,
        type: 'track',
        position: { x: xOffset, y: yOffset },
        data: {
          label: nodeData?.label || nodeId,
          nodeType: nodeData?.nodeType || 'unknown',
          isCurrentNode,
          isFlowNode,
          flowId: isFlowNode ? nodeData?.flowRef : undefined,
          status: track.status,
        },
      });
      
      xOffset += 200;
    });
    
    yOffset += 150;
  });
  
  return result;
});

const edges = computed<Edge[]>(() => {
  const result: Edge[] = [];
  
  props.tracks.forEach((track) => {
    // Connect event listener to first node
    if (track.nodes.length > 0) {
      result.push({
        id: `${track.id}-event-to-first`,
        source: `${track.id}-event`,
        target: `${track.id}-${track.nodes[0]}`,
        type: 'smoothstep',
        animated: track.status === 'active',
      });
    }
    
    // Connect executed nodes
    for (let i = 0; i < track.nodes.length - 1; i++) {
      result.push({
        id: `${track.id}-${i}`,
        source: `${track.id}-${track.nodes[i]}`,
        target: `${track.id}-${track.nodes[i + 1]}`,
        type: 'smoothstep',
        animated: track.status === 'active' && track.currentNodeId === track.nodes[i],
      });
    }
  });
  
  return result;
});

const handleNodeClick = (event: NodeMouseEvent) => {
  const node = event.node;
  if (node.data.isFlowNode && node.data.flowId) {
    emit('flow-node-click', node.data.flowId);
  }
};

// Auto-scroll to newest track
watch(() => props.tracks.length, () => {
  // Implementation would use VueFlow's fitView or viewport manipulation
  // to scroll to the newest track
});
</script> 