<template>
  <div class="flex flex-col h-full">
    <!-- Header with Controls -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-4">
        <!-- Layout Selector -->
        <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg dark:bg-gray-800">
          <button
            v-for="layout in layouts"
            :key="layout.type"
            @click="changeLayout(layout.type)"
            :class="[
              'px-2 py-1 text-xs font-medium rounded transition-all',
              currentLayout === layout.type
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
            :title="layout.description"
          >
            {{ layout.name }}
          </button>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <!-- Node Count -->
        <div class="flex items-center gap-2 mr-2 text-xs text-gray-500 dark:text-gray-400">
          <CircleDot class="w-3 h-3" />
          <span>{{ queryResult.nodes.length }} nodes</span>
          <Link2 class="w-3 h-3 ml-1" />
          <span>{{ queryResult.edges.length }} edges</span>
        </div>
        
        <div class="w-px h-5 bg-gray-200 dark:bg-gray-700"></div>
        
        <!-- Zoom Controls -->
        <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg dark:bg-gray-800">
          <button
            @click="zoomOut"
            class="p-1 text-gray-600 transition-colors rounded hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Zoom out"
          >
            <ZoomOut class="w-3.5 h-3.5" />
          </button>
          
          <span class="px-2 text-xs font-medium text-gray-600 dark:text-gray-400">
            {{ Math.round(zoomLevel * 100) }}%
          </span>
          
          <button
            @click="zoomIn"
            class="p-1 text-gray-600 transition-colors rounded hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Zoom in"
          >
            <ZoomIn class="w-3.5 h-3.5" />
          </button>
        </div>
        
        <button
          @click="fitView"
          class="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Fit to view"
        >
          <Maximize2 class="w-4 h-4" />
        </button>
        
        <button
          @click="toggleFullscreen"
          class="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Toggle fullscreen"
        >
          <component :is="isFullscreen ? Minimize2 : Maximize" class="w-4 h-4" />
        </button>
        
        <div class="w-px h-5 bg-gray-200 dark:bg-gray-700"></div>
        
        <button
          @click="exportGraph"
          class="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Export graph"
        >
          <Download class="w-4 h-4" />
        </button>
      </div>
    </div>
    
    <!-- Graph Container -->
    <div class="relative flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div ref="graphContainer" class="absolute inset-0 bg-white dark:bg-gray-800">
        <!-- Empty State -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="scale-95 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition-all duration-300 ease-in"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-95 opacity-0"
        >
          <div v-if="!hasData" class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <div class="relative">
                <Database class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <div class="absolute inset-0 animate-ping">
                  <Database class="w-16 h-16 mx-auto text-gray-200 opacity-75 dark:text-gray-700" />
                </div>
              </div>
              <h4 class="mb-1 text-lg font-medium text-gray-900 dark:text-gray-100">No Data to Display</h4>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Run a query to visualize the results
              </p>
            </div>
          </div>
        </Transition>
      </div>
      
      <!-- Selected Node Info Panel -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <div v-if="selectedNode" class="absolute w-64 p-4 bg-white border border-gray-200 rounded-lg shadow-lg top-4 right-4 dark:bg-gray-800 dark:border-gray-700">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Node Details</h4>
            <button
              @click="selectedNode = null"
              class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X class="w-3 h-3 text-gray-500" />
            </button>
          </div>
          
          <div class="space-y-2">
            <div>
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">ID</label>
              <p class="font-mono text-sm text-gray-900 dark:text-gray-100">{{ selectedNode.id }}</p>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">Type</label>
              <p class="text-sm text-gray-900 dark:text-gray-100">{{ selectedNode.type || 'Unknown' }}</p>
            </div>
            <div v-if="selectedNode.connections">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">Connections</label>
              <p class="text-sm text-gray-900 dark:text-gray-100">{{ selectedNode.connections }} edges</p>
            </div>
          </div>
        </div>
      </Transition>
    </div>
    
    <!-- Legend -->
    <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div class="flex items-center gap-4 text-xs">
        <span class="font-medium text-gray-700 dark:text-gray-300">Legend:</span>
        <div v-for="(color, type) in entityColors" :key="type" class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: color }"></div>
          <span class="text-gray-600 dark:text-gray-400">{{ type }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { 
  Database, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Maximize,
  Minimize2,
  Download,
  X,
  CircleDot,
  Link2
} from 'lucide-vue-next';
import { useSelector } from '@xstate/vue';
import { Graph } from '@antv/g6';
import { id } from '../state';
import { applicationState } from '@/app'

const actor = applicationState.system.get(id)
const queryResult = useSelector(actor, (state: any) => state.context.queryResult);

const graphContainer = ref<HTMLElement>();
const graph = ref<any>(null);
let resizeObserver: ResizeObserver | null = null;

// UI State
const selectedNode = ref<any>(null);
const isFullscreen = ref(false);
const currentLayout = ref('d3-force');
const zoomLevel = ref(1);

const hasData = computed(() => queryResult.value.nodes.length > 0);

const layouts = [
  { type: 'd3-force', name: 'Force', description: 'Force-directed layout' },
  { type: 'circular', name: 'Circular', description: 'Circular layout' },
  { type: 'grid', name: 'Grid', description: 'Grid layout' },
  { type: 'radial', name: 'Radial', description: 'Radial layout' }
];

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

onMounted(() => {
  // Set up resize observer on the container
  if (graphContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (graph.value && width > 0 && height > 0) {
          // G6 v5 handles resizing automatically with autoResize: true
          // Just ensure we fit the view if needed
          if (hasData.value) {
            graph.value.fitView({ padding: 20 });
          }
        }
      }
    });
    
    resizeObserver.observe(graphContainer.value);
  }
});

async function initializeGraph() {
  if (!graphContainer.value) return;
  
  try {
    const container = graphContainer.value;
    
    // Wait for container to have dimensions
    let retries = 0;
    while ((!container.offsetWidth || !container.offsetHeight) && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 50));
      retries++;
    }
    
    if (!container.offsetWidth || !container.offsetHeight) {
      console.error('Container has no dimensions after waiting');
      return;
    }
    
    // Transform data for G6 v5
    const graphData = transformData();
    
    // Destroy existing graph if any
    if (graph.value) {
      graph.value.destroy();
      graph.value = null;
    }
    
    graph.value = new Graph({
      container,
      data: graphData,
      width: container.offsetWidth,
      height: container.offsetHeight,
      layout: {
        type: currentLayout.value,
      },
      node: {
        style: {
          size: 30,
          fill: (d: any) => entityColors[d.data?.type] || '#6B7280',
          stroke: '#fff',
          lineWidth: 2,
          label: true,
          labelText: (d: any) => {
            const parts = d.id.split('-');
            return parts[parts.length - 1] || d.id;
          },
          labelFontSize: 11,
          labelOffsetY: 20,
        },
      },
      edge: {
        style: {
          stroke: '#e2e2e2',
          lineWidth: 1,
          label: true,
          labelText: (d: any) => d.data?.type || '',
          labelFontSize: 10,
          labelFill: '#666',
        },
      },
      behaviors: [
        { type: 'zoom-canvas' },
        { type: 'drag-canvas' },
        { type: 'drag-node' },
        { type: 'click-select' },
      ],
      autoResize: true,
    });
    
    // Event handlers
    graph.value.on('node:click', (event: any) => {
      const { target } = event;
      const nodeId = target.id;
      const model = graph.value.getNodeData(nodeId);
      
      if (model) {
        // Count connections
        const edges = graph.value.getEdgeData();
        const connections = edges.filter((edge: any) => 
          edge.source === nodeId || edge.target === nodeId
        ).length;
        
        selectedNode.value = {
          id: nodeId,
          type: model.data?.type,
          connections
        };
      }
    });
    
    graph.value.on('canvas:click', () => {
      selectedNode.value = null;
    });
    
    // Track zoom level
    graph.value.on('viewportchange', ({ transform }: any) => {
      zoomLevel.value = transform.zoom || 1;
    });
    
    // Render the graph
    await graph.value.render();
    
    // Fit view after rendering
    if (hasData.value) {
      setTimeout(() => {
        if (graph.value) {
          graph.value.fitView({ padding: 20 });
        }
      }, 100);
    }
    
  } catch (error) {
    console.error('Failed to initialize graph:', error);
  }
}

function transformData() {
  if (!hasData.value) {
    return { nodes: [], edges: [] };
  }
  
  const nodes = queryResult.value.nodes.map((node: any) => ({
    id: node.id,
    data: {
      type: node.type,
      ...node
    }
  }));
  
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = queryResult.value.edges
    .filter((edge: any) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
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

async function updateGraph() {
  // If no data, destroy existing graph
  if (!hasData.value) {
    if (graph.value) {
      graph.value.destroy();
      graph.value = null;
    }
    return;
  }
  
  // If graph doesn't exist yet, initialize it
  if (!graph.value && graphContainer.value) {
    await nextTick(); // Ensure DOM is ready
    initializeGraph();
    return;
  }
  
  // If graph exists, update the data
  if (graph.value) {
    try {
      const newData = transformData();
      
      // Use changeData for G6 v5
      graph.value.changeData(newData);
      
      // Fit view after update
      setTimeout(() => {
        if (graph.value) {
          graph.value.fitView({ padding: 20 });
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to update graph:', error);
    }
  }
}

function changeLayout(type: string) {
  if (!graph.value || !hasData.value) return;
  
  currentLayout.value = type;
  
  try {
    // For G6 v5, update layout
    graph.value.updateLayout({
      type,
    });
    
    // Let the layout run
    setTimeout(() => {
      if (graph.value) {
        graph.value.fitView({ padding: 20 });
      }
    }, 300);
    
  } catch (error) {
    console.error('Failed to change layout:', error);
  }
}

function zoomIn() {
  if (graph.value) {
    const currentZoom = graph.value.getZoom();
    const newZoom = Math.min(currentZoom * 1.2, 3);
    graph.value.zoomTo(newZoom, { duration: 200 });
    zoomLevel.value = newZoom;
  }
}

function zoomOut() {
  if (graph.value) {
    const currentZoom = graph.value.getZoom();
    const newZoom = Math.max(currentZoom * 0.8, 0.3);
    graph.value.zoomTo(newZoom, { duration: 200 });
    zoomLevel.value = newZoom;
  }
}

function fitView() {
  if (graph.value) {
    graph.value.fitView({ padding: 20 });
    zoomLevel.value = graph.value.getZoom();
  }
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  // In real implementation, would toggle actual fullscreen mode
}

function exportGraph() {
  if (graph.value && graphContainer.value) {
    try {
      // Get the graph canvas element
      const canvas = graphContainer.value.querySelector('canvas') as HTMLCanvasElement;
      if (canvas) {
        // Convert canvas to data URL
        const dataURL = canvas.toDataURL('image/png');
        
        // Create download link
        const link = document.createElement('a');
        link.download = `graph-export-${new Date().getTime()}.png`;
        link.href = dataURL;
        link.click();
      }
    } catch (error) {
      console.error('Failed to export graph:', error);
    }
  }
}

// Watch for data changes
watch(queryResult, async (newVal, oldVal) => {
  console.log('Query result changed:', { 
    nodes: newVal.nodes.length, 
    edges: newVal.edges.length,
    hasGraph: !!graph.value,
    container: !!graphContainer.value
  });
  await nextTick(); // Ensure DOM updates are complete
  await updateGraph();
}, { deep: true, immediate: true });

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