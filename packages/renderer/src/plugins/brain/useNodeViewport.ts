import { nextTick } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { Node as VueFlowNode } from '@vue-flow/core'

export function useNodeViewport() {
  const { setCenter, findNode } = useVueFlow()

  /**
   * Centers a node in the viewport, accounting for the details panel
   */
  async function centerNodeInView(nodeId: string) {
    await nextTick()
    
    const node = findNode(nodeId)
    if (!node) return
    
    // Calculate the visible area considering the details panel (384px width on right)
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const detailsPanelWidth = 384 // w-96 = 24rem = 384px
    
    // Get the node position and dimensions
    const nodeX = node.position.x
    const nodeY = node.position.y
    const nodeWidth = node.dimensions?.width || 200
    const nodeHeight = node.dimensions?.height || 80
    
    // Calculate the center of the remaining visible area (left side of viewport when panel is open)
    // The visible area is from 0 to (viewportWidth - detailsPanelWidth)
    const visibleAreaCenterX = (viewportWidth - detailsPanelWidth) / 2
    
    // We want the node center to appear at the center of the visible area
    // So we need to set the viewport center such that the node appears at visibleAreaCenterX
    const nodeCenterX = nodeX + nodeWidth / 2
    const nodeCenterY = nodeY + nodeHeight / 2
    
    // Calculate how much to shift the viewport center to the right
    // to make the node appear centered in the visible area
    const panelOffset = detailsPanelWidth / 2
    const targetX = nodeCenterX + panelOffset
    const targetY = nodeCenterY
    
    // Pan to the adjusted position with smooth animation
    setCenter(targetX, targetY, { 
      zoom: 1,
      duration: 300 // Smooth animation
    })
  }

  /**
   * Centers a node by its position data (for newly created nodes)
   */
  async function centerNodeByPosition(x: number, y: number, width: number = 200, height: number = 80) {
    await nextTick()
    
    // Calculate the visible area considering the details panel (384px width on right)
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const detailsPanelWidth = 384 // w-96 = 24rem = 384px
    
    // Calculate the center of the node
    const nodeCenterX = x + width / 2
    const nodeCenterY = y + height / 2
    
    // Calculate how much to shift the viewport center to the right
    // to make the node appear centered in the visible area
    const panelOffset = detailsPanelWidth / 2
    const targetX = nodeCenterX + panelOffset
    const targetY = nodeCenterY
    
    // Pan to the adjusted position with smooth animation
    setCenter(targetX, targetY, { 
      zoom: 1,
      duration: 300 // Smooth animation
    })
  }

  return {
    centerNodeInView,
    centerNodeByPosition
  }
}