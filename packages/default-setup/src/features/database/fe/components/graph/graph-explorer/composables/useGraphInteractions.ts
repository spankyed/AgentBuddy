import type { Ref, ShallowRef } from 'vue';
import type { Graph } from '@antv/g6';

export function useGraphInteractions(
  graphInstance: ShallowRef<Graph | null>,
  selectedNode: Ref<any>,
  zoomLevel: Ref<number>,
  isDragging: Ref<boolean>
) {
  function handleNodeClick(event: any) {
    if (!graphInstance.value) return;
    
    const { target } = event;
    const nodeId = target.id;
    const nodeData = graphInstance.value.getNodeData(nodeId);
    
    if (nodeData) {
      // Count connections
      const edges = graphInstance.value.getEdgeData();
      const connections = edges.filter((edge: any) => 
        edge.source === nodeId || edge.target === nodeId
      ).length;
      
      selectedNode.value = {
        id: nodeId,
        type: nodeData.data?.type,
        label: nodeData.data?.label,
        connections,
        ...nodeData.data
      };
    }
  }
  
  function handleCanvasClick() {
    selectedNode.value = null;
  }
  
  function handleZoomChange(zoom: number) {
    zoomLevel.value = zoom;
  }
  
  function handleDragStart() {
    isDragging.value = true;
    document.body.style.cursor = 'grabbing';
  }
  
  function handleDragEnd() {
    isDragging.value = false;
    document.body.style.cursor = '';
  }
  
  return {
    handleNodeClick,
    handleCanvasClick,
    handleZoomChange,
    handleDragStart,
    handleDragEnd,
  };
} 