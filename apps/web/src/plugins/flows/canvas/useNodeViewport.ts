import { nextTick } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { Node as VueFlowNode } from '@vue-flow/core'

export function useNodeViewport() {
  const { setCenter, findNode } = useVueFlow()

  /**
   * Centers a node in the viewport, accounting for the form panel
   */
  async function centerNodeInView(nodeId: string) {
    await nextTick()
    
    const node = findNode(nodeId)
    if (!node) return
    
    // Calculate the visible area considering the form panel (40% width on right)
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const nodePaletteWidth = 240 // w-60 = 15rem = 240px
    const formPanelWidth = viewportWidth * 0.4 // 40% for the form
    
    // Get the node position and dimensions
    const nodeX = node.position.x
    const nodeY = node.position.y
    const nodeWidth = node.dimensions?.width || 150
    
    // Calculate offset to position node in the visible area
    // We want to move the camera/viewport to the RIGHT so the node appears to move LEFT
    // This keeps the node visible when the form panel opens on the right
    const targetX = nodeX + (formPanelWidth / 2) - nodeWidth
    const targetY = nodeY + (viewportHeight * 0.05) // Move camera down so node appears higher
    
    // Pan to the adjusted position with fixed zoom
    const fixedZoom = 1.75 // Fixed zoom level for consistent node viewing
    setCenter(targetX, targetY, { 
      zoom: fixedZoom,
      duration: 300 // Smooth animation
    })
  }

  /**
   * Centers a node by its position data (for newly created nodes)
   */
  async function centerNodeByPosition(x: number, y: number, width: number = 150) {
    await nextTick()
    
    // Calculate the visible area considering the form panel (40% width on right)
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const formPanelWidth = viewportWidth * 0.4 // 40% for the form
    
    // Calculate offset to position node in the visible area
    const targetX = x + (formPanelWidth / 2) - width
    const targetY = y + (viewportHeight * 0.05) // Move camera down so node appears higher
    
    // Pan to the adjusted position with fixed zoom
    const fixedZoom = 1.75 // Fixed zoom level for consistent node viewing
    setCenter(targetX, targetY, { 
      zoom: fixedZoom,
      duration: 300 // Smooth animation
    })
  }

  return {
    centerNodeInView,
    centerNodeByPosition
  }
}