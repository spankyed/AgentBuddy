import { nextTick } from 'vue'
import { useVueFlow } from '@vue-flow/core'

export function useNodeViewport() {
  const { findNode, getViewport, setCenter } = useVueFlow()

  /**
   * Pans so the node is positioned just left of the form panel.
   * Preserves user's zoom level.
   */
  async function centerNodeInView(nodeId: string) {
    await nextTick()

    const node = findNode(nodeId)
    if (!node) return

    const { zoom } = getViewport()
    const nodeX = node.position.x
    const nodeY = node.position.y
    const nodeW = node.dimensions?.width || 150
    const nodeH = node.dimensions?.height || 50

    // Form panel is 40% width on right, we want node just to the left of it
    // setCenter centers the viewport on a point, so we offset right
    // to push the node to the left side of the visible area
    const formWidth = window.innerWidth * 0.4
    const offsetX = (formWidth / 2 - 150) / zoom // closer to form edge

    const centerX = nodeX + nodeW / 2 + offsetX
    const centerY = nodeY + nodeH / 2

    setCenter(centerX, centerY, { zoom, duration: 250 })
  }

  return { centerNodeInView }
}