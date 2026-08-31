import { nextTick } from 'vue'
import { useVueFlow } from '@vue-flow/core'

export function useNodeViewport() {
  const { setCenter, findNode } = useVueFlow()

  async function centerNodeInView(nodeId: string) {
    await nextTick()
    const node = findNode(nodeId)
    if (!node) return

    const nodeWidth = node.dimensions?.width || 200
    const nodeHeight = node.dimensions?.height || 80
    const panelOffset = 384 / 2 // details panel w-96 = 384px

    setCenter(
      node.position.x + nodeWidth / 2 + panelOffset,
      node.position.y + nodeHeight / 2,
      { zoom: 1, duration: 300 }
    )
  }

  return {
    centerNodeInView,
  }
}
