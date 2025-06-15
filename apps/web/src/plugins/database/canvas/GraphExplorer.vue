<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-semibold">Graph Explorer</h3>
      <div class="flex items-center gap-2">
        <button
          @click="fitView"
          class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          title="Fit to view"
        >
          <Maximize2 class="w-4 h-4" />
        </button>
        <button
          @click="zoomIn"
          class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          title="Zoom in"
        >
          <ZoomIn class="w-4 h-4" />
        </button>
        <button
          @click="zoomOut"
          class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          title="Zoom out"
        >
          <ZoomOut class="w-4 h-4" />
        </button>
        <div class="text-xs text-gray-500">
          {{ queryResult.nodes.length }} nodes, {{ queryResult.edges.length }} edges
        </div>
      </div>
    </div>
    
    <div ref="graphContainer" class="relative flex-1 overflow-hidden">
      <div v-if="!hasData" class="absolute inset-0 flex items-center justify-center text-gray-500">
        <div class="text-center">
          <Database class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">Run a query to see results</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Database, ZoomIn, ZoomOut, Maximize2 } from 'lucide-vue-next';
import { useSelector } from '@xstate/vue';
import { Graph } from '@antv/g6';
import { id } from '../state';
import { applicationState } from '@/app'

const actor = applicationState.system.get(id)
const queryResult = useSelector(actor, (state: any) => state.context.queryResult);

const graphContainer = ref<HTMLElement>();
const graph = ref<any>(null);
let resizeObserver: ResizeObserver | null = null;

const hasData = computed(() => queryResult.value.nodes.length > 0);

const entityColors: Record<string, string> = {
  Agent: '#3B82F6',
  Brain: '#8B5CF6',
  Message: '#10B981',
  Thread: '#F59E0B',
  Tag: '#EF4444',
  Relation: '#6B7280',
  ContextItem: '#14B8A6',
  CanvasItem: '#F97316',
  Flow: '#EC4899',
  Node: '#6366F1',
};

onMounted(async () => {
  await nextTick();
  
  if (!graphContainer.value) return;
  
  try {
    const container = graphContainer.value;
    const width = container.offsetWidth || 800;
    const height = container.offsetHeight || 600;
    
    graph.value = new Graph({
      container,
      width,
      height,
      fitView: true,
      fitViewPadding: 20,
      layout: {
        type: 'force',
        preventOverlap: true,
        nodeSize: 50,
        linkDistance: 120,
      },
      behaviors: ['drag-canvas', 'drag-node', 'zoom-canvas'],
      defaultNode: {
        size: 40,
        style: {
          fill: '#5B8FF9',
          stroke: '#5B8FF9',
        },
      },
      defaultEdge: {
        style: {
          stroke: '#e2e2e2',
        },
      },
    });
    
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (graph.value && width > 0 && height > 0) {
          graph.value.changeSize(width, height);
          if (hasData.value) {
            setTimeout(() => graph.value.fitView(20), 100);
          }
        }
      }
    });
    
    resizeObserver.observe(container);
    
    if (hasData.value) {
      updateGraph();
    }
    
  } catch (error) {
    console.error('Failed to initialize graph:', error);
  }
});

function updateGraph() {
  if (!graph.value) return;
  
  try {
    const nodes = queryResult.value.nodes.map(node => ({
      id: node.id,
      label: node.id.split('-')[1] || node.id,
      style: {
        fill: entityColors[node.type] || '#6B7280',
      },
    }));
    
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = queryResult.value.edges
      .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map(edge => ({
        source: edge.source,
        target: edge.target,
        label: edge.type,
      }));
    
    graph.value.setData({ nodes, edges });
    graph.value.render();
    
    setTimeout(() => graph.value.fitView(20), 100);
    
  } catch (error) {
    console.error('Failed to update graph:', error);
  }
}

function zoomIn() {
  if (graph.value) {
    graph.value.zoomTo(graph.value.getZoom() * 1.2);
  }
}

function zoomOut() {
  if (graph.value) {
    graph.value.zoomTo(graph.value.getZoom() * 0.8);
  }
}

function fitView() {
  if (graph.value) {
    graph.value.fitView(20);
  }
}

watch(queryResult, () => {
  updateGraph();
}, { deep: true });

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  
  if (graph.value) {
    graph.value.destroy();
    graph.value = null;
  }
});
</script> 