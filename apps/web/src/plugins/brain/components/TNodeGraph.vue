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

// Constants
const LAYOUT = {
  HORIZONTAL_GAP: 85,   // Reduced by 2/3 (was 250)
  VERTICAL_GAP: 50,     // Reduced by half (was 100)
  NODE_WIDTH: 200,
  NODE_HEIGHT: 80,
} as const;

const ANIMATION = {
  DURATION: 800,
  MAX_RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 16, // ~1 frame at 60fps
} as const;

// Vue Flow composables
const { setCenter, getNode } = useVueFlow();

// State
const nodePositionCache = new Map<string, { x: number; y: number }>();
let previousNodeIds = new Set<string>();
let animationController: AbortController | null = null;

// Helper functions
const createVueFlowNode = (tnode: TrackEntity, position: { x: number; y: number }): VueFlowNode => ({
  id: tnode.id,
  type: 'tnode',
  position,
  data: {
    label: tnode.label,
    tNodeType: tnode.tNodeType,
    stepNodeType: tnode.stepNodeType,
    status: tnode.status,
    hasChildren: tnode.children.length > 0,
  },
});

const calculateNodePositions = (tracks: TrackEntity[]): VueFlowNode[] => {
  const nodes: VueFlowNode[] = [];
  let trackY = 0;

  const traverseTrack = (tnode: TrackEntity, x: number, y: number) => {
    const position = { x, y };
    nodes.push(createVueFlowNode(tnode, position));
    
    // Process children horizontally
    let childX = x;
    tnode.children.forEach((child) => {
      childX += LAYOUT.NODE_WIDTH + LAYOUT.HORIZONTAL_GAP;
      traverseTrack(child, childX, y);
    });
  };

  // Process each track
  tracks.forEach((track) => {
    traverseTrack(track, 0, trackY);
    trackY += LAYOUT.NODE_HEIGHT + LAYOUT.VERTICAL_GAP;
  });

  return nodes;
};

// Convert TNode tree to VueFlow nodes
const nodes = computed<VueFlowNode[]>(() => {
  if (!props.tnodeTree?.length) return [];
  return calculateNodePositions(props.tnodeTree);
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

// Animation helpers
const cancelCurrentAnimation = () => {
  if (animationController) {
    animationController.abort();
    animationController = null;
  }
};

const animateToNode = async (nodeId: string, position: { x: number; y: number }, signal: AbortSignal) => {
  const attemptCenter = async (attempt: number = 0): Promise<void> => {
    if (signal.aborted) return;
    
    const flowNode = getNode.value(nodeId);
    if (flowNode?.dimensions) {
      const centerX = position.x + (flowNode.dimensions.width || LAYOUT.NODE_WIDTH) / 2;
      const centerY = position.y + (flowNode.dimensions.height || LAYOUT.NODE_HEIGHT) / 2;
      
      await setCenter(centerX, centerY, { 
        duration: ANIMATION.DURATION, 
        zoom: 1 
      });
    } else if (attempt < ANIMATION.MAX_RETRY_ATTEMPTS) {
      // Retry after a frame
      await new Promise(resolve => setTimeout(resolve, ANIMATION.RETRY_DELAY));
      return attemptCenter(attempt + 1);
    }
  };
  
  // Wait for next frame to ensure DOM is updated
  await new Promise(resolve => requestAnimationFrame(resolve));
  return attemptCenter();
};

const findNewNodes = (currentNodes: VueFlowNode[]): string[] => {
  const currentIds = new Set(currentNodes.map(n => n.id));
  return Array.from(currentIds).filter(id => !previousNodeIds.has(id));
};

// Watch for new nodes and animate to them
watch(() => nodes.value, (newNodes) => {
  const newNodeIds = findNewNodes(newNodes);
  
  if (newNodeIds.length === 0) {
    previousNodeIds = new Set(newNodes.map(n => n.id));
    return;
  }
  
  // Cancel any existing animation
  cancelCurrentAnimation();
  
  // Focus on the last new node (most recent)
  const targetNodeId = newNodeIds[newNodeIds.length - 1];
  const targetNode = newNodes.find(n => n.id === targetNodeId);
  
  if (targetNode) {
    animationController = new AbortController();
    animateToNode(targetNodeId, targetNode.position, animationController.signal);
  }
  
  // Update tracked nodes
  previousNodeIds = new Set(newNodes.map(n => n.id));
}, { immediate: true });

// Cleanup on unmount
onUnmounted(() => {
  cancelCurrentAnimation();
  nodePositionCache.clear();
  previousNodeIds.clear();
});
</script> 