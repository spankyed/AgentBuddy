<template>
  <div class="flex flex-col h-full">
    <!-- Header with Controls -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-4">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Graph Explorer</h3>
        
        <!-- Layout Selector -->
        <LayoutSelector 
          v-model="currentLayout" 
          :layouts="AVAILABLE_LAYOUTS"
          :disabled="!hasData"
          @change="handleLayoutChange"
        />
      </div>
      
      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <!-- Node Count -->
        <GraphStats :nodes="nodeCount" :edges="edgeCount" />
        
        <div class="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        
        <!-- Zoom Controls -->
        <ZoomControls 
          :zoom-level="zoomLevel"
          :disabled="!graphInstance"
          @zoom-in="handleZoomIn"
          @zoom-out="handleZoomOut"
          @fit-view="handleFitView"
        />
        
        <ActionButton
          icon="maximize"
          title="Toggle fullscreen"
          :active="isFullscreen"
          @click="toggleFullscreen"
        />
        
        <div class="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        
        <ActionButton
          icon="download"
          title="Export graph"
          :disabled="!graphInstance"
          @click="handleExport"
        />
      </div>
    </div>
    
    <!-- Graph Container -->
    <div class="relative flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div 
        ref="graphContainer" 
        class="absolute inset-0 bg-white dark:bg-gray-800"
        :class="{ 'cursor-grabbing': isDragging }"
      />
      
      <!-- Empty State -->
      <EmptyState v-if="!hasData && !isLoading" />
      
      <!-- Loading State -->
      <LoadingState v-if="isLoading" />
      
      <!-- Selected Node Info Panel -->
      <NodeInfoPanel 
        v-if="selectedNode"
        :node="selectedNode"
        @close="selectedNode = null"
      />
    </div>
    
    <!-- Legend -->
    <GraphLegend :colors="ENTITY_COLORS" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue';
import { useSelector } from '@xstate/vue';
import { Graph } from '@antv/g6';
import type { GraphData, NodeData, EdgeData } from '@antv/g6';
import { useGraphInstance } from './composables/useGraphInstance';
import { useGraphInteractions } from './composables/useGraphInteractions';
import { ENTITY_COLORS, AVAILABLE_LAYOUTS } from './constants';
import LayoutSelector from './components/LayoutSelector.vue';
import ZoomControls from './components/ZoomControls.vue';
import ActionButton from './components/ActionButton.vue';
import GraphStats from './components/GraphStats.vue';
import EmptyState from './components/EmptyState.vue';
import LoadingState from './components/LoadingState.vue';
import NodeInfoPanel from './components/NodeInfoPanel.vue';
import GraphLegend from './components/GraphLegend.vue';
import { id } from '../state';
import { applicationState } from '@/app';

// Props & Emits
interface Props {
  readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false
});

// State Management
const actor = applicationState.system.get(id);
const queryResult = useSelector(actor, (state: any) => state.context.queryResult);

// Component State
const graphContainer = ref<HTMLElement>();
const graphInstance = shallowRef<Graph | null>(null);
const selectedNode = ref<NodeData | null>(null);
const isFullscreen = ref(false);
const currentLayout = ref('d3-force');
const zoomLevel = ref(1);
const isLoading = ref(false);
const isDragging = ref(false);

// Computed Properties
const hasData = computed(() => queryResult.value.nodes.length > 0);
const nodeCount = computed(() => queryResult.value.nodes.length);
const edgeCount = computed(() => queryResult.value.edges.length);

// Composables
const { 
  initializeGraph, 
  updateGraphData, 
  destroyGraph 
} = useGraphInstance(graphContainer, graphInstance);

const {
  handleNodeClick,
  handleCanvasClick,
  handleZoomChange,
  handleDragStart,
  handleDragEnd
} = useGraphInteractions(graphInstance, selectedNode, zoomLevel, isDragging);

// Graph Operations
async function setupGraph() {
  if (!hasData.value || !graphContainer.value) return;
  
  isLoading.value = true;
  
  try {
    const data = transformQueryData();
    
    const graph = await initializeGraph({
      data,
      layout: { type: currentLayout.value },
      behaviors: props.readonly ? ['zoom-canvas', 'drag-canvas'] : undefined,
      onNodeClick: handleNodeClick,
      onCanvasClick: handleCanvasClick,
      onZoomChange: handleZoomChange,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd
    });
    
    if (graph) {
      graphInstance.value = graph;
      await graph.fitView({ padding: 20 });
    }
  } catch (error) {
    console.error('Failed to setup graph:', error);
  } finally {
    isLoading.value = false;
  }
}

function transformQueryData(): GraphData {
  const nodes: NodeData[] = queryResult.value.nodes.map((node: any) => ({
    id: node.id,
    data: {
      type: node.type,
      label: extractLabel(node.id),
      ...node
    }
  }));
  
  const nodeIdSet = new Set(nodes.map(n => n.id));
  const edges: EdgeData[] = queryResult.value.edges
    .filter((edge: any) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
    .map((edge: any, index: number) => ({
      id: `edge-${index}`,
      source: edge.source,
      target: edge.target,
      data: {
        type: edge.type,
        ...edge
      }
    }));
  
  return { nodes, edges };
}

function extractLabel(id: string): string {
  const parts = id.split('-');
  return parts[parts.length - 1] || id;
}

// Event Handlers
async function handleLayoutChange(newLayout: string) {
  if (!graphInstance.value) return;
  
  try {
    await graphInstance.value.updateLayout({ type: newLayout });
    await graphInstance.value.fitView({ padding: 20 });
  } catch (error) {
    console.error('Failed to change layout:', error);
  }
}

function handleZoomIn() {
  if (!graphInstance.value) return;
  const currentZoom = graphInstance.value.getZoom();
  graphInstance.value.zoomTo(Math.min(currentZoom * 1.2, 3), { duration: 200 });
}

function handleZoomOut() {
  if (!graphInstance.value) return;
  const currentZoom = graphInstance.value.getZoom();
  graphInstance.value.zoomTo(Math.max(currentZoom * 0.8, 0.3), { duration: 200 });
}

async function handleFitView() {
  if (!graphInstance.value) return;
  await graphInstance.value.fitView({ padding: 20, duration: 200 });
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  // Implement fullscreen logic here
}

async function handleExport() {
  if (!graphInstance.value || !graphContainer.value) return;
  
  try {
    const canvas = graphContainer.value.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas not found');
    
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `graph-export-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  } catch (error) {
    console.error('Failed to export graph:', error);
  }
}

// Watchers
watch(queryResult, async () => {
  if (!hasData.value) {
    await destroyGraph();
    return;
  }
  
  if (!graphInstance.value) {
    await setupGraph();
  } else {
    const data = transformQueryData();
    await updateGraphData(data);
  }
}, { deep: true, immediate: true });

// Lifecycle
onMounted(() => {
  // Component mounted
});

onUnmounted(() => {
  destroyGraph();
});
</script> 