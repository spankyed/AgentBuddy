<template>
  <div ref="canvasRoot" class="relative w-full h-full">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      class="w-full h-full bg-neutral-900"
      data-onboarding-id="brain-flow-graph"
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
    >
      <template #node-tnode="nodeProps">
        <BaseNode
          v-bind="nodeProps"
          :editable="false"
          :show-status-indicator="nodeProps.data.tNodeType !== 'event'"
          :selectable="nodeProps.data.tNodeType === 'flow' || nodeProps.data.tNodeType === 'step' || nodeProps.data.tNodeType === 'event'"
        />
      </template>
      <Background variant="dots" />
      <Controls />
      
      <!-- Back button (top left) -->
      <div v-if="canGoBack" class="absolute z-10 top-4 left-4">
        <button
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all duration-200 rounded-md bg-neutral-900/90 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-100 backdrop-blur-sm"
          @click="$emit('back-click')"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>
      
      <!-- Fit button (bottom left) -->
      <div class="absolute z-10 bottom-4 left-4 flex gap-2">
        <!-- Fit to View Button -->
        <button
          class="flex items-center justify-center p-1.5 text-sm rounded-md bg-neutral-900/90 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 transition-all backdrop-blur-sm"
          title="Fit graph to view"
          @click="handleFitView"
        >
          <Maximize :size="16" />
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
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
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
import type { TrackEntity } from '@app/api'
import { BaseNode } from '@/plugins/flows/canvas/nodes';
import { Maximize } from 'lucide-vue-next';
import { useNodeViewport } from '../useNodeViewport';

interface Props {
  tnodeTree?: TrackEntity[];
  flowTNodeId?: string;
  canGoBack: boolean;
  animationsEnabled?: boolean;
  selectedNodeId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'node-click': [tNodeId: string];
  'flow-navigate': [tNodeId: string];
  'back-click': [];
}>();

// Constants
const LAYOUT = {
  HORIZONTAL_GAP: 45,   // Reduced by 2/3 (was 250)
  VERTICAL_GAP: 40,     // Between sibling nodes in parallel branches
  TRACK_GAP: 30,        // Between separate tracks (like flow plugin's chainGap)
  NODE_WIDTH: 200,
  NODE_HEIGHT: 80,
} as const;

const ANIMATION = {
  DURATION: 800,
  MAX_RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 16, // ~1 frame at 60fps
} as const;

const ROW_HEIGHT = LAYOUT.NODE_HEIGHT + LAYOUT.VERTICAL_GAP;

// Vue Flow composables
const { 
  setCenter, 
  getNode, 
  fitView,
  onNodeClick,
  onNodeDoubleClick
} = useVueFlow();
const { centerNodeInView } = useNodeViewport();

// Click handling state - need to delay single clicks for flow nodes
let clickTimeout: NodeJS.Timeout | null = null;
const DOUBLE_CLICK_DELAY = 250; // ms to wait for double click

// State
let previousNodeIds = new Set<string>();
let animationController: AbortController | null = null;

// Outer wrapper ref — used to catch re-entry into the canvas so we can
// clear any stale middle-mouse pan state (see clearStalePan below).
const canvasRoot = ref<HTMLElement | null>(null);

// Workaround for a "stuck pan" bug: Vue Flow's d3-zoom attaches mouseup
// on window when a drag begins, but if the user releases the mouse
// outside the Electron window (e.g. over another application) the OS
// never delivers that mouseup. The drag's mousemove listener stays live
// and re-entering the canvas resumes panning with no button held. On
// re-entry with no buttons pressed, synthesise a mouseup on window so
// d3-zoom tears down its listeners — and also strip the `.dragging`
// class from the pane, since Vue Flow's end-of-drag cursor state isn't
// always cleared by the synthetic event alone.
const clearStalePan = (event: MouseEvent) => {
  if (event.buttons !== 0) return;
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 1, buttons: 0 }));
  canvasRoot.value?.querySelector('.vue-flow__pane')?.classList.remove('dragging');
};

// Helper functions
const createVueFlowNode = (tnode: TrackEntity, position: { x: number; y: number }): VueFlowNode => ({
  id: tnode.id,
  type: 'tnode',
  position,
  data: {
    label: tnode.label,
    nodeType: tnode.stepNodeType || tnode.tNodeType,
    tNodeType: tnode.tNodeType, // Keep for click handling logic
    status: tnode.status,
    eventType: tnode.eventType, // For listen/event nodes
  },
});

const subtreeLeafCount = (tnode: TrackEntity): number => {
  if (tnode.children.length === 0) return 1;
  return tnode.children.reduce((sum, child) => sum + subtreeLeafCount(child), 0);
};

const calculateNodePositions = (tracks: TrackEntity[]): VueFlowNode[] => {
  const nodes: VueFlowNode[] = [];
  let trackY = 0;

  const traverseTrack = (tnode: TrackEntity, x: number, y: number) => {
    nodes.push(createVueFlowNode(tnode, { x, y }));
    const childX = x + LAYOUT.NODE_WIDTH + LAYOUT.HORIZONTAL_GAP;

    if (tnode.children.length === 1) {
      // Sequential: continue same row
      traverseTrack(tnode.children[0], childX, y);
    } else if (tnode.children.length > 1) {
      // Parallel: fan out vertically
      const totalLeaves = tnode.children.reduce((s, c) => s + subtreeLeafCount(c), 0);
      const totalPixelHeight = (totalLeaves - 1) * ROW_HEIGHT;
      let currentY = y - totalPixelHeight / 2;

      tnode.children.forEach(child => {
        const childLeaves = subtreeLeafCount(child);
        const childCenterY = currentY + ((childLeaves - 1) * ROW_HEIGHT) / 2;
        traverseTrack(child, childX, childCenterY);
        currentY += childLeaves * ROW_HEIGHT;
      });
    }
  };

  tracks.forEach((track) => {
    const trackLeaves = subtreeLeafCount(track);
    const trackContentHeight = (trackLeaves - 1) * ROW_HEIGHT + LAYOUT.NODE_HEIGHT;
    traverseTrack(track, 0, trackY + trackContentHeight / 2);
    trackY += trackContentHeight + LAYOUT.TRACK_GAP;
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
  
  // Helper to recursively build edges — every child connects to its parent
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
  
  props.tnodeTree.forEach(track => buildEdges(track));
  
  return result;
});

// Register node event handlers using Vue Flow composables
onNodeClick((event: NodeMouseEvent) => {
  const nodeData = event.node.data as { tNodeType?: string };
  
  if (nodeData.tNodeType === 'flow') {
    // For flow nodes, delay single click to allow for double-click detection
    if (clickTimeout) {
      clearTimeout(clickTimeout);
    }
    clickTimeout = setTimeout(() => {
      emit('node-click', event.node.id);
      clickTimeout = null;
    }, DOUBLE_CLICK_DELAY);
  } else if (nodeData.tNodeType === 'step' || nodeData.tNodeType === 'event') {
    // Step and event nodes always open details immediately
    emit('node-click', event.node.id);
  }
});

onNodeDoubleClick((event: NodeMouseEvent) => {
  const nodeData = event.node.data as { tNodeType?: string };
  
  // Only flow nodes can be navigated into on double click
  if (nodeData.tNodeType === 'flow') {
    // Cancel the pending single-click action
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    emit('flow-navigate', event.node.id);
  }
  // Step nodes and event nodes don't have double click behavior
});

const handleFitView = () => {
  // Fit all nodes in view with some padding
  fitView({ 
    padding: 0.2,
    duration: 400 
  });
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

// Watch for node changes — handles both incremental additions and structural changes (sub-flow navigation)
watch(() => nodes.value, (newNodes) => {
  const currentIds = new Set(newNodes.map(n => n.id));
  const newNodeIds = newNodes.map(n => n.id).filter(id => !previousNodeIds.has(id));
  const removedCount = [...previousNodeIds].filter(id => !currentIds.has(id)).length;

  const isStructuralChange = previousNodeIds.size > 0 && removedCount > previousNodeIds.size / 2;

  if (isStructuralChange) {
    cancelCurrentAnimation();
    nextTick(() => {
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
    });
  } else if (newNodeIds.length > 0 && props.animationsEnabled) {
    cancelCurrentAnimation();
    const targetNodeId = newNodeIds[newNodeIds.length - 1];
    const targetNode = newNodes.find(n => n.id === targetNodeId);
    if (targetNode) {
      animationController = new AbortController();
      animateToNode(targetNodeId, targetNode.position, animationController.signal);
    }
  }

  previousNodeIds = currentIds;
}, { immediate: true });

// Watch for selected node changes and center the node in view
watch(() => props.selectedNodeId, (newSelectedId, oldSelectedId) => {
  if (newSelectedId && newSelectedId !== oldSelectedId) {
    setTimeout(() => centerNodeInView(newSelectedId), 100);
  }
});

onMounted(() => {
  canvasRoot.value?.addEventListener('mouseenter', clearStalePan);
});

// Cleanup on unmount
onUnmounted(() => {
  canvasRoot.value?.removeEventListener('mouseenter', clearStalePan);
  cancelCurrentAnimation();
  previousNodeIds.clear();
  if (clickTimeout) {
    clearTimeout(clickTimeout);
  }
});
</script> 