<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-semibold">Graph Explorer</h3>
      <div class="text-xs text-gray-500">
        {{ queryResult.nodes.length }} nodes, {{ queryResult.edges.length }} edges
      </div>
    </div>
    
    <div ref="graphContainer" class="relative flex-1">
      <div v-if="queryResult.nodes.length === 0" class="absolute inset-0 flex items-center justify-center text-gray-500">
        <div class="text-center">
          <Database class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">Run a query to see results</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Database } from 'lucide-vue-next';
import { Graph } from '@antv/g6';
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/app'

const actor: DatabaseState = applicationState.system.get(id)

const queryResult = useSelector(actor, (state) => state.context.queryResult);
const graphContainer = ref<HTMLElement>();
let graph: any = null;

const entityColors: Record<string, string> = {
  Agent: '#3B82F6',    // blue
  Brain: '#8B5CF6',    // purple
  Message: '#10B981',  // green
  Thread: '#F59E0B',   // amber
  Tag: '#EF4444',      // red
  Relation: '#6B7280', // gray
  ContextItem: '#14B8A6', // teal
  CanvasItem: '#F97316',  // orange
  Flow: '#EC4899',        // pink
  Node: '#6366F1',        // indigo
};

onMounted(async () => {
  await nextTick();
  
  if (!graphContainer.value) return;
  
  // Ensure container has dimensions
  const width = graphContainer.value.offsetWidth || 600;
  const height = graphContainer.value.offsetHeight || 400;
  
  try {
    // Try to create graph with basic configuration
    const graphConfig: any = {
      container: graphContainer.value,
      width,
      height,
    };
    
    // Try to instantiate
    graph = new Graph(graphConfig);
    
    // Add layout if supported
    if (graph.updateLayout) {
      graph.updateLayout({
        type: 'force',
      });
    }
    
    // Check available methods
    console.log('Graph methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(graph)).filter(m => typeof graph[m] === 'function'));
    
    // Try to set initial data
    if (graph.data && graph.render) {
      graph.data({ nodes: [], edges: [] });
      graph.render();
    } else if (graph.read) {
      graph.read({ nodes: [], edges: [] });
    }
    
    // Update with actual data if available
    if (queryResult.value.nodes.length > 0) {
      updateGraph();
    }
  } catch (error) {
    console.error('Failed to initialize G6 graph:', error);
  }
});

onUnmounted(() => {
  if (graph) {
    try {
      graph.destroy();
    } catch (e) {
      console.warn('Failed to destroy graph:', e);
    }
  }
});

// Simple resize handler
let resizeTimeout: any;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (graph && graphContainer.value) {
      const width = graphContainer.value.offsetWidth || 600;
      const height = graphContainer.value.offsetHeight || 400;
      try {
        graph.changeSize(width, height);
      } catch (e) {
        console.warn('Failed to resize graph:', e);
      }
    }
  }, 300);
});

watch(queryResult, () => {
  updateGraph();
}, { deep: true });

function updateGraph() {
  if (!graph) return;
  
  try {
    const nodes = queryResult.value.nodes.map(node => ({
      id: node.id,
      label: node.id.split('-')[1] || node.id,
      style: {
        fill: entityColors[node.type] || '#6B7280',
      },
    }));
    
    const edges = queryResult.value.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type,
    }));
    
    // Clear and update
    graph.clear();
    graph.data({ nodes, edges });
    graph.render();
    
    // Fit view if there are nodes
    if (nodes.length > 0) {
      setTimeout(() => {
        try {
          graph.fitView();
        } catch (e) {
          console.warn('Failed to fit view:', e);
        }
      }, 100);
    }
  } catch (error) {
    console.error('Failed to update graph:', error);
  }
}
</script> 