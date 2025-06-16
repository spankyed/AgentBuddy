import { ref, type Ref, type ShallowRef } from 'vue';
import { Graph } from '@antv/g6';
import type { GraphData, GraphOptions } from '@antv/g6';
import { ENTITY_COLORS } from '../../../constants';

interface GraphConfig {
  data: GraphData;
  layout?: any;
  behaviors?: string[] | any[];
  onNodeClick?: (event: any) => void;
  onCanvasClick?: () => void;
  onZoomChange?: (zoom: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function useGraphInstance(
  container: Ref<HTMLElement | undefined>,
  graphInstance: ShallowRef<Graph | null>
) {
  const isInitializing = ref(false);
  let resizeObserver: ResizeObserver | null = null;

  async function waitForContainer(): Promise<HTMLElement | null> {
    if (!container.value) return null;
    
    let retries = 0;
    const maxRetries = 20;
    const delay = 50;
    
    while ((!container.value.offsetWidth || !container.value.offsetHeight) && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
    }
    
    if (!container.value.offsetWidth || !container.value.offsetHeight) {
      console.error('Container has no dimensions after waiting');
      return null;
    }
    
    return container.value;
  }

  async function initializeGraph(config: GraphConfig): Promise<Graph | null> {
    if (isInitializing.value) return null;
    
    isInitializing.value = true;
    
    try {
      const element = await waitForContainer();
      if (!element) return null;
      
      // Clean up existing graph
      if (graphInstance.value) {
        graphInstance.value.destroy();
        graphInstance.value = null;
      }
      
      const graphOptions: GraphOptions = {
        container: element,
        width: element.offsetWidth,
        height: element.offsetHeight,
        data: config.data,
        layout: config.layout || { type: 'd3-force' },
        zoomRange: [0.5, 5],
        node: {
          style: {
            size: 32,
            fill: (d: any) => ENTITY_COLORS[d.data?.type] || '#6B7280',
            stroke: '#fff',
            lineWidth: 2,
            label: true,
            labelText: (d: any) => d.data?.label || d.id,
            labelFontSize: 11,
            labelOffsetY: 20,
            cursor: 'pointer',
          },
        },
        edge: {
          style: {
            stroke: '#E5E7EB',
            lineWidth: 1.5,
            label: true,
            labelText: (d: any) => d.data?.type || '',
            labelFontSize: 10,
            labelFill: '#6B7280',
            labelBackground: true,
            labelBackgroundFill: '#ffffff',
            labelBackgroundOpacity: 0.8,
            labelPadding: [2, 4],
            endArrow: true,
            endArrowSize: 8,
            endArrowFill: '#E5E7EB',
          },
        },
        behaviors: config.behaviors || [
          { type: 'zoom-canvas', minZoom: 0.3, maxZoom: 3 },
          { type: 'drag-canvas' },
          { type: 'drag-node' },
          { type: 'click-select' },
        ],
        autoResize: true,
      };
      
      const graph = new Graph(graphOptions);
      
      // Set up event handlers
      if (config.onNodeClick) {
        graph.on('node:click', config.onNodeClick);
      }
      
      if (config.onCanvasClick) {
        graph.on('canvas:click', config.onCanvasClick);
      }
      
      if (config.onZoomChange) {
        graph.on('viewportchange', ({ transform }: any) => {
          config.onZoomChange?.(transform.zoom || 1);
        });
      }
      
      if (config.onDragStart) {
        graph.on('drag:start', config.onDragStart);
      }
      
      if (config.onDragEnd) {
        graph.on('drag:end', config.onDragEnd);
      }
      
      // Set up resize observer
      setupResizeObserver(element, graph);
      
      // Render the graph
      await graph.render();
      
      return graph;
      
    } catch (error) {
      console.error('Failed to initialize graph:', error);
      return null;
    } finally {
      isInitializing.value = false;
    }
  }

  function setupResizeObserver(element: HTMLElement, graph: Graph) {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          // G6 v5 handles resizing with autoResize: true
          // Ensure we maintain the fit with proper padding
          requestAnimationFrame(() => {
            if (graph && !graph.destroyed) {
              graph.fitView();
            }
          });
        }
      }
    });
    
    resizeObserver.observe(element);
  }

  async function updateGraphData(data: GraphData): Promise<void> {
    if (!graphInstance.value || graphInstance.value.destroyed) return;
    
    try {
      // Store current layout type
      const currentLayout = graphInstance.value.getLayout();
      
      // Clear existing data
      graphInstance.value.clear();
      
      // Add new data
      graphInstance.value.addData(data);
      
      // Re-apply layout to properly position new nodes
      graphInstance.value.layout(currentLayout);
      
      // Fit view to show all nodes
      graphInstance.value.fitView();
      
      // Render the updates
      graphInstance.value.draw();
    } catch (error) {
      console.error('Failed to update graph data:', error);
    }
  }

  function destroyGraph(): void {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    
    if (graphInstance.value && !graphInstance.value.destroyed) {
      graphInstance.value.destroy();
      graphInstance.value = null;
    }
  }

  return {
    initializeGraph,
    updateGraphData,
    destroyGraph,
    isInitializing,
  };
} 