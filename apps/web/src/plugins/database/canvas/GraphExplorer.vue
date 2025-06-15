<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-semibold">Graph Explorer</h3>
      <div class="text-xs text-gray-500">
        <span v-if="filteredEdgeCount > 0" class="text-amber-500">
          {{ queryResult.nodes.length }} nodes, {{ displayedEdgeCount }}/{{ queryResult.edges.length }} edges
          ({{ filteredEdgeCount }} filtered)
        </span>
        <span v-else>
          {{ queryResult.nodes.length }} nodes, {{ queryResult.edges.length }} edges
        </span>
      </div>
    </div>
    
    <div 
      ref="graphContainer" 
      class="relative flex-1" 
      style="min-height: 400px;"
    >
      <div v-if="queryResult.nodes.length === 0 && !graph" class="absolute inset-0 flex items-center justify-center text-gray-500">
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
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/app'

const actor: DatabaseState = applicationState.system.get(id)
const queryResult = useSelector(actor, (state) => state.context.queryResult);
const graphContainer = ref<HTMLElement>();

const graph = ref<any>(null);
const filteredEdgeCount = ref(0);
const displayedEdgeCount = ref(0);

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

// Initialize graph
onMounted(async () => {
  await nextTick();
  
  if (!graphContainer.value) return;
  
  try {
    const { Graph } = await import('@antv/g6');
    
    const container = graphContainer.value;
    const width = container.scrollWidth || container.offsetWidth || 800;
    const height = container.scrollHeight || container.offsetHeight || 600;
    
    console.log('Initializing G6 with dimensions:', width, 'x', height);
    
    // Create graph instance
    graph.value = new Graph({
      container,
      width,
      height,
      layout: {
        type: 'force',
        preventOverlap: true,
        nodeSize: 30,
        linkDistance: 100,
      },
      modes: {
        default: ['drag-canvas', 'drag-node', 'zoom-canvas'],
      },
      defaultNode: {
        size: 30,
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
    
    // Initialize with data if available
    if (queryResult.value.nodes.length > 0) {
      updateGraph();
    } else {
      // Set empty data and render
      try {
        filteredEdgeCount.value = 0;
        displayedEdgeCount.value = 0;
        graph.value.setData({ nodes: [], edges: [] });
        graph.value.render();
      } catch (e) {
        console.error('Failed to initialize empty graph:', e);
      }
    }
    
  } catch (error) {
    console.error('Failed to initialize G6:', error);
  }
});

// Update graph with new data
function updateGraph() {
  if (!graph.value) return;
  
  try {
    console.log('Query result:', queryResult.value);
    
    const nodes = queryResult.value.nodes.map(node => ({
      id: node.id,
      label: node.id.split('-')[1] || node.id,
      style: {
        fill: entityColors[node.type] || '#6B7280',
      },
    }));
    
    // Create a Set of valid node IDs for quick lookup
    const nodeIds = new Set(nodes.map(n => n.id));
    
    // Filter edges to only include those with valid source and target nodes
    let skippedCount = 0;
    const edges = queryResult.value.edges
      .filter(edge => {
        const isValid = nodeIds.has(edge.source) && nodeIds.has(edge.target);
        if (!isValid) {
          console.warn(`Skipping edge ${edge.type}: source="${edge.source}" target="${edge.target}" - one or both nodes not found`);
          skippedCount++;
        }
        return isValid;
      })
      .map(edge => ({
        source: edge.source,
        target: edge.target,
        label: edge.type,
      }));
    
    // Update counts
    filteredEdgeCount.value = skippedCount;
    displayedEdgeCount.value = edges.length;
    
    const data = { nodes, edges };
    console.log('Graph data:', data);
    
    // Use G6 v5 API: setData() method
    graph.value.setData(data);
    graph.value.render();
    
  } catch (error) {
    console.error('Failed to update graph:', error);
  }
}

// Watch for data changes
watch(queryResult, () => {
  updateGraph();
}, { deep: true });

// Cleanup
onUnmounted(() => {
  if (graph.value) {
    graph.value.destroy();
    graph.value = null;
  }
});
</script> 