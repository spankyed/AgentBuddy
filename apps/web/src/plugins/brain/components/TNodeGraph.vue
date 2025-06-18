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
      <template #node-tnode="nodeProps">
        <TNodeGraphNode v-bind="nodeProps" />
      </template>
      <Background variant="dots" />
      <Controls />
      
      <!-- Back button (top left) -->
      <div class="absolute z-10 top-4 left-4">
        <button
          v-if="canGoBack"
          class="flex items-center gap-2 px-3 py-2 transition-colors rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-50"
          @click="$emit('back-click')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>
      
      <!-- Current TNode label (top center) -->
      <div v-if="flowTNodeId" class="absolute z-10 transform -translate-x-1/2 left-1/2 top-4">
        <div class="px-4 py-2 rounded-md bg-neutral-800">
          <span class="text-sm text-neutral-300">{{ flowTNodeId }}</span>
        </div>
      </div>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
import type { TrackEntity } from '@abuddy/api'
import TNodeGraphNode from './TNodeGraphNode.vue';

interface Props {
  tnodeTree?: TrackEntity;
  flowTNodeId?: string;
  canGoBack: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'tnode-click': [tNodeId: string];
  'back-click': [];
}>();

// Convert TNode tree to VueFlow nodes and edges
const nodes = computed<VueFlowNode[]>(() => {
  if (!props.tnodeTree) return [];
  
  const result: VueFlowNode[] = [];
  let yOffset = 100;
  
  // Helper to recursively build nodes
  const buildNodes = (tnode: TrackEntity, x: number, y: number, parentId?: string) => {
    result.push({
      id: tnode.id,
      type: 'tnode',
      position: { x, y },
      data: {
        label: tnode.label,
        nodeType: tnode.nodeType,
        stepNodeType: tnode.stepNodeType,
        status: tnode.status,
        hasChildren: tnode.children.length > 0,
      },
    });
    
    // Process children
    let childX = x;
    tnode.children.forEach((child, index) => {
      buildNodes(child, childX, y + 150, tnode.id);
      childX += 250;
    });
  };
  
  buildNodes(props.tnodeTree, 100, 100);
  
  return result;
});

const edges = computed<Edge[]>(() => {
  if (!props.tnodeTree) return [];
  
  const result: Edge[] = [];
  
  // Helper to recursively build edges
  const buildEdges = (tnode: TrackEntity) => {
    tnode.children.forEach((child) => {
      result.push({
        id: `${tnode.id}-to-${child.id}`,
        source: tnode.id,
        target: child.id,
        type: 'smoothstep',
        animated: tnode.status === 'active',
      });
      buildEdges(child);
    });
  };
  
  buildEdges(props.tnodeTree);
  
  return result;
});

const handleNodeClick = (event: NodeMouseEvent) => {
  emit('tnode-click', event.node.id);
};
</script> 