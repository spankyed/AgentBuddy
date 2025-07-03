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
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all duration-200 rounded-md bg-neutral-900/90 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 backdrop-blur-sm"
          @click="$emit('back-click')"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>
      
      <!-- Current TNode label (top center) -->
      <div v-if="flowTNodeId" class="absolute z-10 transform -translate-x-1/2 left-1/2 top-4">
        <div class="px-4 py-2 border rounded-md bg-neutral-900/90 border-neutral-800 backdrop-blur-sm">
          <span class="text-sm text-neutral-100">{{ flowTNodeId }}</span>
        </div>
      </div>
    </VueFlow>
  </div>
</template>

<script lang="ts">
export default {
  name: 'TNodeGraph'
}
</script>

<script setup lang="ts">
import { computed, watch, nextTick, ref, onUnmounted } from 'vue';
import {
  VueFlow,
  ConnectionLineType,
  MarkerType,
  type Node as VueFlowNode,
  type Edge,
  type NodeMouseEvent,
  useVueFlow,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import type { TrackEntity } from '@abuddy/api'
import TNodeGraphNode from './TNodeGraphNode.vue';

interface Props {
  tnodeTree?: TrackEntity[];
  flowTNodeId?: string;
  canGoBack: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'tnode-click': [tNodeId: string];
  'back-click': [];
}>();

const { fitView, setCenter, getNode } = useVueFlow();

// Layout constants
const HORIZONTAL_GAP = 250;  // Gap between parent and child
const VERTICAL_GAP = 100;    // Gap between siblings
const NODE_WIDTH = 200;      // Estimated node width
const NODE_HEIGHT = 80;      // Estimated node height

// Animation control
let animationController: AbortController | null = null;

// Convert TNode tree to VueFlow nodes and edges
const nodes = computed<VueFlowNode[]>(() => {
  if (!props.tnodeTree) return [];
  
  const result: VueFlowNode[] = [];
  let trackY = 0; // Y position for track nodes
  
  // Helper to recursively build nodes with manual positioning
  const buildNodes = (tnode: TrackEntity, parentX: number = 0, y: number = 0) => {
    const x = parentX;
    
    result.push({
      id: tnode.id,
      type: 'tnode',
      position: { x, y },
      data: {
        label: tnode.label,
        tNodeType: tnode.tNodeType,
        stepNodeType: tnode.stepNodeType,
        status: tnode.status,
        hasChildren: tnode.children.length > 0,
      },
    });
    
    // Process children in a horizontal chain
    let currentX = x;
    tnode.children.forEach((child) => {
      currentX += NODE_WIDTH + HORIZONTAL_GAP;
      buildNodes(child, currentX, y);
    });
  };
  
  // Process each track entity as a root
  if (props.tnodeTree) {
    props.tnodeTree.forEach((track) => {
      buildNodes(track, 0, trackY);
      trackY += NODE_HEIGHT + VERTICAL_GAP;
    });
  }
  
  return result;
});

const edges = computed<Edge[]>(() => {
  if (!props.tnodeTree) return [];
  
  const result: Edge[] = [];
  
  // Helper to recursively build edges
  const buildEdges = (tnode: TrackEntity) => {
    // For children, create a chain: parent -> first child -> second child -> ...
    tnode.children.forEach((child, index) => {
      if (index === 0) {
        // First child connects to parent
        result.push({
          id: `${tnode.id}-to-${child.id}`,
          source: tnode.id,
          target: child.id,
          type: 'smoothstep',
          animated: tnode.status === 'active',
        });
      } else {
        // Subsequent children connect to previous child
        const previousChild = tnode.children[index - 1];
        result.push({
          id: `${previousChild.id}-to-${child.id}`,
          source: previousChild.id,
          target: child.id,
          type: 'smoothstep',
          animated: previousChild.status === 'active',
        });
      }
      // Recursively process each child's children
      buildEdges(child);
    });
  };
  
  // Process edges for each track entity
  if (props.tnodeTree) {
    props.tnodeTree.forEach(track => {
      buildEdges(track);
    });
  }
  
  return result;
});

const handleNodeClick = (event: NodeMouseEvent) => {
  emit('tnode-click', event.node.id);
};

// Track new nodes and animate to them
let previousNodeIds = new Set<string>();
watch(() => nodes.value, (newNodes) => {
  const currentNodeIds = new Set(newNodes.map(n => n.id));
  
  // Find newly added nodes
  const newNodeId = Array.from(currentNodeIds).find(id => !previousNodeIds.has(id));
  
  if (newNodeId) {
    // Cancel any in-progress animation
    if (animationController) {
      animationController.abort();
    }
    animationController = new AbortController();
    
    // Find the new node
    const newNode = newNodes.find(n => n.id === newNodeId);
    if (newNode) {
      // Use requestAnimationFrame to ensure node is rendered
      requestAnimationFrame(() => {
        // Check if this animation was cancelled
        if (animationController?.signal.aborted) return;
        
        // Check if the node actually exists in the flow
        const flowNode = getNode.value(newNodeId);
        if (flowNode && flowNode.dimensions) {
          // Center on the new node with animation
          setCenter(
            newNode.position.x + (flowNode.dimensions.width || NODE_WIDTH) / 2, 
            newNode.position.y + (flowNode.dimensions.height || NODE_HEIGHT) / 2, 
            { duration: 800, zoom: 1 }
          );
        } else {
          // Node not ready yet, try again on next frame
          if (!animationController?.signal.aborted) {
            requestAnimationFrame(() => {
              if (animationController?.signal.aborted) return;
              const retryNode = getNode.value(newNodeId);
              if (retryNode && retryNode.dimensions) {
                setCenter(
                  newNode.position.x + (retryNode.dimensions.width || NODE_WIDTH) / 2, 
                  newNode.position.y + (retryNode.dimensions.height || NODE_HEIGHT) / 2, 
                  { duration: 800, zoom: 1 }
                );
              }
            });
          }
        }
      });
    }
  }
  
  previousNodeIds = currentNodeIds;
}, { immediate: true });

// Cleanup on unmount
onUnmounted(() => {
  if (animationController) {
    animationController.abort();
  }
});
</script> 